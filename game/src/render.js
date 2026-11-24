// render.js — everything Sirena City looks like, drawn on one canvas.
// The world pass draws ground, harbor, buildings, traffic and people under
// a dusk grade with headlight cones and police glow; the HUD pass draws
// the minimap, wanted stars, objective banner and prompts; and the menu,
// pause and incident screens are painted here too. No images: every shape
// is a path, every sign a line of text.

import {
  PITCH, ROAD_W, BLOCK_OFF, BLOCK_IN, COLS, ROWS, LAND_W, LAND_H, WORLD_H,
  roadCenterV, roadCenterH, groundAt,
} from './city.js';
import { CAR_MODELS, MODEL, carSpeed } from './entities.js';
import { Rng } from './rng.js';
import { CONTACT_NAME, STORY_INTRO } from './missions.js';

const FONT = 'system-ui, "Segoe UI", sans-serif';

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  // ---------- frame ----------

  draw(game, view) {
    const { ctx } = this;
    const w = view.w;
    const h = view.h;
    const shakeX = game.shake ? (Math.random() - 0.5) * game.shake : 0;
    const shakeY = game.shake ? (Math.random() - 0.5) * game.shake : 0;
    const camX = game.camera.x - w / 2 + shakeX;
    const camY = game.camera.y - h / 2 + shakeY;
    this.camX = camX;
    this.camY = camY;

    ctx.fillStyle = '#175d7a';
    ctx.fillRect(0, 0, w, h);
    this.drawGround(game, camX, camY, w, h);
    this.drawZones(game, camX, camY);
    this.drawBuildings(game, camX, camY, w, h);
    this.drawProps(game, camX, camY, w, h);
    for (const ped of game.peds) this.drawPed(game, ped, camX, camY);
    const sortedCars = [...game.cars].sort((a, b) => a.y - b.y);
    for (const car of sortedCars) this.drawCar(game, car, camX, camY);
    if (!game.player.car) this.drawPlayer(game, camX, camY);
    this.drawFx(game, camX, camY);
    this.drawLighting(game, camX, camY, w, h);

    if (game.mode === 'play' || game.mode === 'pause') this.drawHud(game, view);
    if (game.mode === 'title') this.drawTitle(game, view);
    if (game.mode === 'pause') this.drawPause(game, view);
    if (game.mode === 'over') this.drawOver(game, view);
  }

  visible(x, y, camX, camY, w, h, pad = 90) {
    return x > camX - pad && x < camX + w + pad && y > camY - pad && y < camY + h + pad;
  }

  // ---------- world ----------

  drawGround(game, camX, camY, w, h) {
    const { ctx } = this;
    const city = game.city;
    const x0 = Math.max(0, camX);
    const y0 = Math.max(0, camY);
    const x1 = Math.min(LAND_W, camX + w);
    const y1 = Math.min(LAND_H, camY + h);

    // Water sparkle south of the land.
    if (camY + h > LAND_H) {
      ctx.strokeStyle = 'rgba(255,255,255,0.13)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let gx = Math.floor(camX / 128) * 128; gx < camX + w; gx += 128) {
        for (let gy = Math.max(LAND_H + 26, Math.floor(camY / 92) * 92); gy < camY + h; gy += 92) {
          const off = Math.sin(game.time * 0.9 + Rng.hash3(gx, gy, 5) * 9) * 9;
          ctx.moveTo(gx - camX + off, gy - camY);
          ctx.lineTo(gx - camX + off + 34, gy - camY);
        }
      }
      ctx.stroke();
    }

    // Land base and block interiors.
    ctx.fillStyle = '#7a7d72';
    ctx.fillRect(x0 - camX, y0 - camY, x1 - x0, y1 - y0);
    const i0 = Math.max(0, Math.floor(camX / PITCH) - 1);
    const i1 = Math.min(COLS - 1, Math.floor((camX + w) / PITCH) + 1);
    const j0 = Math.max(0, Math.floor(camY / PITCH) - 1);
    const j1 = Math.min(ROWS - 1, Math.floor((camY + h) / PITCH) + 1);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const bx = i * PITCH + ROAD_W - camX;
        const by = j * PITCH + ROAD_W - camY;
        ctx.fillStyle = '#9aa0a2';
        ctx.fillRect(bx, by, BLOCK_IN + 64, BLOCK_IN + 64);
        const ix = i * PITCH + BLOCK_OFF - camX;
        const iy = j * PITCH + BLOCK_OFF - camY;
        const park = city.parks.find((pk) => pk.x === i * PITCH + BLOCK_OFF && pk.y === j * PITCH + BLOCK_OFF);
        const lot = city.lots.find((lt) => lt.x === i * PITCH + BLOCK_OFF && lt.y === j * PITCH + BLOCK_OFF);
        if (park) {
          ctx.fillStyle = '#4e7a3a';
          ctx.fillRect(ix, iy, BLOCK_IN, BLOCK_IN);
          ctx.strokeStyle = 'rgba(240,230,190,0.5)';
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(ix, iy + BLOCK_IN / 2);
          ctx.lineTo(ix + BLOCK_IN, iy + BLOCK_IN / 2);
          ctx.moveTo(ix + BLOCK_IN / 2, iy);
          ctx.lineTo(ix + BLOCK_IN / 2, iy + BLOCK_IN);
          ctx.stroke();
        } else if (lot) {
          ctx.fillStyle = '#3a3d42';
          ctx.fillRect(ix, iy, BLOCK_IN, BLOCK_IN);
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 2;
          for (let s = 0; s < 6; s++) {
            ctx.strokeRect(ix + 26 + s * 60, iy + 30, 44, 92);
            ctx.strokeRect(ix + 26 + s * 60, iy + BLOCK_IN - 122, 44, 92);
          }
        } else {
          ctx.fillStyle = '#6f7268';
          ctx.fillRect(ix, iy, BLOCK_IN, BLOCK_IN);
        }
      }
    }

    // Roads: full strips, then markings inside the view.
    ctx.fillStyle = '#2f3237';
    for (let i = 0; i <= COLS; i++) {
      const rx = roadCenterV(i) - ROAD_W / 2 - camX;
      if (rx + ROAD_W < 0 || rx > w) continue;
      ctx.fillRect(rx, y0 - camY, ROAD_W, y1 - y0);
    }
    for (let j = 0; j <= ROWS; j++) {
      const ry = roadCenterH(j) - ROAD_W / 2 - camY;
      if (ry + ROAD_W < 0 || ry > h) continue;
      ctx.fillRect(x0 - camX, ry, x1 - x0, ROAD_W);
    }
    ctx.fillStyle = '#ffd166';
    const dashFrom = Math.max(0, Math.floor(camY / 46) * 46);
    for (let i = 0; i <= COLS; i++) {
      const cx = roadCenterV(i) - camX;
      if (cx < -4 || cx > w + 4) continue;
      for (let y = dashFrom; y < Math.min(LAND_H, camY + h); y += 46) {
        if ((((y % PITCH) + PITCH) % PITCH) < ROAD_W) continue; // skip intersections
        ctx.fillRect(cx - 2, y - camY, 4, 24);
      }
    }
    const dashFromX = Math.max(0, Math.floor(camX / 46) * 46);
    for (let j = 0; j <= ROWS; j++) {
      const cy = roadCenterH(j) - camY;
      if (cy < -4 || cy > h + 4) continue;
      for (let x = dashFromX; x < Math.min(LAND_W, camX + w); x += 46) {
        if ((((x % PITCH) + PITCH) % PITCH) < ROAD_W) continue;
        ctx.fillRect(x - camX, cy - 2, 24, 4);
      }
    }
    // Edge lines.
    ctx.fillStyle = 'rgba(240,240,240,0.55)';
    for (let i = 0; i <= COLS; i++) {
      const cx = roadCenterV(i) - camX;
      if (cx < -70 || cx > w + 70) continue;
      ctx.fillRect(cx - ROAD_W / 2 + 3, y0 - camY, 3, y1 - y0);
      ctx.fillRect(cx + ROAD_W / 2 - 6, y0 - camY, 3, y1 - y0);
    }
    for (let j = 0; j <= ROWS; j++) {
      const cy = roadCenterH(j) - camY;
      if (cy < -70 || cy > h + 70) continue;
      ctx.fillRect(x0 - camX, cy - ROAD_W / 2 + 3, x1 - x0, 3);
      ctx.fillRect(x0 - camX, cy + ROAD_W / 2 - 6, x1 - x0, 3);
    }

    // The boardwalk promenade along the water.
    ctx.fillStyle = '#8a6d4b';
    ctx.fillRect(x0 - camX, LAND_H - camY - 4, x1 - x0, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = Math.floor(camX / 46) * 46; x < camX + w; x += 46) {
      ctx.fillRect(x - camX, LAND_H - camY - 4, 2, 10);
    }

    // Piers.
    for (const pier of city.piers) {
      ctx.fillStyle = '#96795a';
      ctx.fillRect(pier.x - camX, pier.y - camY, pier.w, pier.h);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      for (let y = pier.y + 8; y < pier.y + pier.h; y += 26) {
        ctx.fillRect(pier.x - camX, y - camY, pier.w, 3);
      }
      ctx.fillStyle = '#5d4630';
      ctx.fillRect(pier.x - camX - 3, pier.y - camY, 5, pier.h);
      ctx.fillRect(pier.x + pier.w - camX - 2, pier.y - camY, 5, pier.h);
    }
  }

  drawZones(game, camX, camY) {
    const { ctx } = this;
    const city = game.city;
    const pulse = 0.72 + Math.sin(game.time * 4) * 0.28;
    // Marisol herself, waiting under a marker.
    const c = city.zones.contact;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(c.x - camX, c.y - camY + 10, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff5d8f';
    rr(ctx, c.x - camX - 6, c.y - camY - 8, 12, 17, 5);
    ctx.fill();
    ctx.fillStyle = '#f2c29b';
    ctx.beginPath();
    ctx.arc(c.x - camX, c.y - camY - 13, 6, 0, Math.PI * 2);
    ctx.fill();
    if (!game.missions.active && game.mode === 'play') {
      ctx.fillStyle = `rgba(0,229,255,${pulse})`;
      ctx.font = `bold 21px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('!', c.x - camX, c.y - camY - 30 - Math.sin(game.time * 3) * 3);
      ctx.font = `11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(CONTACT_NAME, c.x - camX, c.y - camY + 30);
    }
    // The mission target gets a pillar of light and a diamond.
    const target = game.missions.currentTarget();
    if (target && game.mode === 'play') {
      const tx = target.x - camX;
      const ty = target.y - camY;
      const grad = ctx.createLinearGradient(0, ty - 190, 0, ty);
      grad.addColorStop(0, 'rgba(255,209,102,0)');
      grad.addColorStop(1, 'rgba(255,209,102,0.30)');
      ctx.fillStyle = grad;
      ctx.fillRect(tx - 15, ty - 190, 30, 190);
      ctx.strokeStyle = `rgba(255,209,102,${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(tx, ty, 30, 13, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd166';
      ctx.save();
      ctx.translate(tx, ty - 46 - Math.sin(game.time * 3) * 4);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-7, -7, 14, 14);
      ctx.restore();
    }
  }

  drawBuildings(game, camX, camY, w, h) {
    const { ctx } = this;
    for (const b of game.city.buildings) {
      if (!this.visible(b.x + b.w / 2, b.y + b.h / 2, camX, camY, w, h, Math.max(b.w, b.h))) continue;
      const x = b.x - camX;
      const y = b.y - camY;
      // Shadow, then body, then a slightly inset roof.
      ctx.fillStyle = 'rgba(15,18,24,0.35)';
      ctx.fillRect(x + 10, y + 12, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(x, y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(x + 7, y + 7, b.w - 14, b.h - 14);
      // Windows: lit warm at dusk, dark glass otherwise.
      const cw = b.w / b.cols;
      const ch = b.h / b.floors;
      for (let cx = 0; cx < b.cols; cx++) {
        for (let fy = 0; fy < b.floors; fy++) {
          const lit = Rng.hash3(b.id, cx, fy) < 0.42;
          ctx.fillStyle = lit ? '#ffd98a' : '#2c3540';
          ctx.fillRect(x + 9 + cx * cw + 2, y + 9 + fy * ch + 2, Math.min(13, cw - 6), Math.min(9, ch - 6));
        }
      }
      // Rooftop clutter: air-conditioning boxes and a water tank, placed
      // by the same stable hash so they never jump between frames.
      const units = 1 + Math.floor(Rng.hash3(b.id, 91, 7) * 3);
      for (let u = 0; u < units; u++) {
        const ux = x + 14 + Rng.hash3(b.id, u, 31) * Math.max(10, b.w - 60);
        const uy = y + 12 + Rng.hash3(b.id, u, 57) * Math.max(10, b.h - 70);
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        ctx.fillRect(ux + 3, uy + 4, 22, 15);
        ctx.fillStyle = '#b9bec4';
        ctx.fillRect(ux, uy, 22, 15);
        ctx.fillStyle = '#8f959c';
        ctx.fillRect(ux + 3, uy + 3, 16, 4);
      }
      // Storefront sign along the south face.
      ctx.fillStyle = b.sign;
      ctx.fillRect(x, y + b.h - 17, b.w, 17);
      ctx.fillStyle = 'rgba(10,10,16,0.88)';
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'center';
      let name = b.name;
      while (name.length > 3 && ctx.measureText(name).width > b.w - 8) {
        name = name.slice(0, -2);
      }
      ctx.fillText(name, x + b.w / 2, y + b.h - 5);
    }
  }

  drawProps(game, camX, camY, w, h) {
    const { ctx } = this;
    const city = game.city;
    for (const park of city.parks) {
      for (const tree of park.trees) {
        if (!this.visible(tree.x, tree.y, camX, camY, w, h, 40)) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(tree.x - camX + 4, tree.y - camY + 6, tree.r, tree.r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3d6630';
        ctx.beginPath();
        ctx.arc(tree.x - camX, tree.y - camY, tree.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#548c42';
        ctx.beginPath();
        ctx.arc(tree.x - camX - 3, tree.y - camY - 3, tree.r * 0.62, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const palm of city.palms) {
      if (!this.visible(palm.x, palm.y, camX, camY, w, h, 40)) continue;
      const x = palm.x - camX;
      const y = palm.y - camY;
      ctx.strokeStyle = '#7a5c38';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y + 8);
      ctx.quadraticCurveTo(x + 3, y - 4, x + 6, y - 13);
      ctx.stroke();
      ctx.strokeStyle = '#4e8c46';
      ctx.lineWidth = 3;
      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.moveTo(x + 6, y - 13);
        ctx.quadraticCurveTo(
          x + 6 + Math.cos(a) * palm.r * 0.8, y - 13 + Math.sin(a) * palm.r * 0.5 - 4,
          x + 6 + Math.cos(a) * palm.r * 1.25, y - 13 + Math.sin(a) * palm.r * 0.8 + 5,
        );
        ctx.stroke();
      }
    }
    // The lighthouse: striped tower at the end of the middle pier.
    const lh = city.zones.lighthouse;
    const lx = lh.x - camX;
    const ly = lh.y - camY;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(lx + 5, ly + 8, 24, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e4da';
    ctx.beginPath();
    ctx.arc(lx, ly, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d94f3d';
    ctx.beginPath();
    ctx.arc(lx, ly, 19, Math.PI * 0.15, Math.PI * 0.5);
    ctx.arc(lx, ly, 19, Math.PI * 1.15, Math.PI * 1.5, true);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(lx, ly, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- actors ----------

  drawPed(game, ped, camX, camY) {
    const { ctx } = this;
    const x = ped.x - camX;
    const y = ped.y - camY;
    if (x < -30 || y < -30 || x > this.canvas.width + 30 || y > this.canvas.height + 30) return;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + 7, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (ped.state === 'down') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ped.angle);
      ctx.fillStyle = ped.color;
      rr(ctx, -11, -5, 22, 10, 5);
      ctx.fill();
      ctx.fillStyle = '#f2c29b';
      ctx.beginPath();
      ctx.arc(13, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const bob = ped.state === 'flee' || Math.hypot(ped.vx, ped.vy) > 4
      ? Math.sin(game.time * 13 + ped.id) * 1.6
      : 0;
    ctx.fillStyle = ped.color;
    rr(ctx, x - 5, y - 6 + bob * 0.3, 10, 14, 4);
    ctx.fill();
    ctx.fillStyle = '#f2c29b';
    ctx.beginPath();
    ctx.arc(x, y - 10 + bob * 0.3, 5.5, 0, Math.PI * 2);
    ctx.fill();
    if (ped.state === 'flee') {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('!', x, y - 20);
    }
  }

  drawPlayer(game, camX, camY) {
    const { ctx } = this;
    const p = game.player;
    const x = p.x - camX;
    const y = p.y - camY;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const moving = Math.hypot(p.vx, p.vy) > 4;
    const bob = moving ? Math.sin(p.walkPhase) * 1.8 : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.angle + Math.PI / 2);
    ctx.fillStyle = '#123a3a';
    rr(ctx, -6, -2 + bob * 0.2, 5, 9, 2);
    ctx.fill();
    rr(ctx, 1, -2 - bob * 0.2, 5, 9, 2);
    ctx.fill();
    ctx.fillStyle = '#12b5a5';
    rr(ctx, -7, -8, 14, 13, 5);
    ctx.fill();
    ctx.fillStyle = '#ff5d8f';
    ctx.fillRect(-7, -8, 14, 4);
    ctx.restore();
    ctx.fillStyle = '#f2c29b';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20242c';
    ctx.beginPath();
    ctx.arc(x, y - 2, 6, Math.PI, Math.PI * 2);
    ctx.fill();
    if (p.hasPackage) {
      ctx.fillStyle = '#c98f4e';
      ctx.fillRect(x + 7, y - 4, 9, 8);
      ctx.strokeStyle = '#8a5a26';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 7, y - 4, 9, 8);
    }
  }

  drawCar(game, car, camX, camY) {
    const { ctx } = this;
    const model = CAR_MODELS[car.model];
    const x = car.x - camX;
    const y = car.y - camY;
    if (x < -90 || y < -90 || x > this.canvas.width + 90 || y > this.canvas.height + 90) return;
    ctx.fillStyle = 'rgba(10,12,18,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 5, y + 7, model.w * 0.55, model.h * 0.62, car.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(car.angle);
    const w = model.w;
    const h = model.h;
    // Wheels.
    ctx.fillStyle = '#14161a';
    const ww = 9;
    const wh = 5;
    ctx.fillRect(-w / 2 + 4, -h / 2 - 2, ww, wh);
    ctx.fillRect(w / 2 - 4 - ww, -h / 2 - 2, ww, wh);
    ctx.fillRect(-w / 2 + 4, h / 2 - 3, ww, wh);
    ctx.fillRect(w / 2 - 4 - ww, h / 2 - 3, ww, wh);
    // Body.
    ctx.fillStyle = car.wrecked ? '#2c2c30' : car.color;
    rr(ctx, -w / 2, -h / 2, w, h, 7);
    ctx.fill();
    if (car.driver === 'police') {
      ctx.fillStyle = '#e8ecf0';
      ctx.fillRect(-6, -h / 2 + 2, 15, h - 4);
      ctx.fillStyle = '#20303e';
      ctx.font = `bold 7px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('POLICÍA', 1, 2.5);
    }
    // Cabin and glass.
    ctx.fillStyle = car.wrecked ? '#1c1e22' : '#1d2733';
    rr(ctx, -w * 0.16, -h / 2 + 3, w * 0.34, h - 6, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,210,235,0.5)';
    ctx.fillRect(w * 0.13, -h / 2 + 4, 4, h - 8);
    if (car.model === MODEL.TAXI) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-4, -4, 9, 8);
      ctx.fillStyle = '#20303e';
      ctx.font = `bold 6px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0.5, 2);
    }
    if (car.model === MODEL.CORAL) {
      ctx.fillStyle = '#20242c';
      ctx.fillRect(-w / 2 + 1, -h / 2 + 1, 5, h - 2);
    }
    // Lights: headlights forward, brake lights when slowing.
    ctx.fillStyle = '#fff6c9';
    ctx.fillRect(w / 2 - 2, -h / 2 + 3, 3, 5);
    ctx.fillRect(w / 2 - 2, h / 2 - 8, 3, 5);
    ctx.fillStyle = car.braking ? '#ff2d2d' : '#8c1f28';
    ctx.fillRect(-w / 2 - 1, -h / 2 + 3, 3, 5);
    ctx.fillRect(-w / 2 - 1, h / 2 - 8, 3, 5);
    if (car.driver === 'police') {
      const phase = Math.sin(game.time * 11) > 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#3b82f6';
      ctx.fillRect(-3, -7, 7, 5);
      ctx.fillStyle = phase ? '#3b82f6' : '#ff3b30';
      ctx.fillRect(-3, 2, 7, 5);
    }
    if (car.hp < 55 && !car.wrecked) {
      ctx.fillStyle = 'rgba(20,20,24,0.35)';
      ctx.beginPath();
      ctx.ellipse(w * 0.28, 0, 9, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (car.isMissionTarget && game.missions.active) {
      ctx.strokeStyle = `rgba(255,209,102,${0.65 + Math.sin(game.time * 5) * 0.3})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(x, y, model.w + 6, model.h + 12, car.angle, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (game.player.car === car) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.moveTo(x, y - model.h - 14 + Math.sin(game.time * 3) * 2);
      ctx.lineTo(x - 6, y - model.h - 24 + Math.sin(game.time * 3) * 2);
      ctx.lineTo(x + 6, y - model.h - 24 + Math.sin(game.time * 3) * 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawFx(game, camX, camY) {
    const { ctx } = this;
    for (const tr of game.tracers) {
      ctx.strokeStyle = `rgba(255,220,120,${Math.max(0, tr.t / 0.07)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tr.x1 - camX, tr.y1 - camY);
      ctx.lineTo(tr.x2 - camX, tr.y2 - camY);
      ctx.stroke();
    }
    for (const pt of game.particles) {
      const a = Math.max(0, pt.life / pt.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x - camX, pt.y - camY, pt.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawLighting(game, camX, camY, w, h) {
    const { ctx } = this;
    // Dusk grade.
    const grade = ctx.createLinearGradient(0, 0, 0, h);
    grade.addColorStop(0, 'rgba(38,24,74,0.20)');
    grade.addColorStop(0.55, 'rgba(20,16,44,0.08)');
    grade.addColorStop(1, 'rgba(64,26,54,0.20)');
    ctx.fillStyle = grade;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Headlight cones for cars that are being driven.
    for (const car of game.cars) {
      if (car.driver === 'none' || car.wrecked) continue;
      const x = car.x - camX;
      const y = car.y - camY;
      if (x < -160 || y < -160 || x > w + 160 || y > h + 160) continue;
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const len = 150;
      const spread = 0.42;
      const a1 = car.angle - spread;
      const a2 = car.angle + spread;
      const grad = ctx.createRadialGradient(x, y, 8, x, y, len);
      const strong = game.player.car === car ? 0.20 : 0.11;
      grad.addColorStop(0, `rgba(255,240,190,${strong})`);
      grad.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x + fx * 18, y + fy * 18);
      ctx.lineTo(x + Math.cos(a1) * len, y + Math.sin(a1) * len);
      ctx.lineTo(x + Math.cos(a2) * len, y + Math.sin(a2) * len);
      ctx.closePath();
      ctx.fill();
      if (car.driver === 'police') {
        const phase = Math.sin(game.time * 11) > 0;
        const glow = ctx.createRadialGradient(x, y, 2, x, y, 74);
        glow.addColorStop(0, phase ? 'rgba(255,60,50,0.30)' : 'rgba(60,120,255,0.30)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 74, y - 74, 148, 148);
      }
    }
    // Lamp pools.
    ctx.fillStyle = 'rgba(255,214,140,0.05)';
    for (const lamp of game.city.lamps) {
      const x = lamp.x - camX;
      const y = lamp.y - camY;
      if (x < -50 || y < -50 || x > w + 50 || y > h + 50) continue;
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.fill();
    }
    // The lighthouse beam, sweeping the harbor.
    const lh = game.city.zones.lighthouse;
    const lx = lh.x - camX;
    const ly = lh.y - camY;
    if (lx > -460 && ly > -460 && lx < w + 460 && ly < h + 460) {
      const ba = game.time * 0.45;
      const grad = ctx.createRadialGradient(lx, ly, 4, lx, ly, 430);
      grad.addColorStop(0, 'rgba(255,240,180,0.20)');
      grad.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + Math.cos(ba - 0.16) * 430, ly + Math.sin(ba - 0.16) * 430);
      ctx.lineTo(lx + Math.cos(ba + 0.16) * 430, ly + Math.sin(ba + 0.16) * 430);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Vignette.
    const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(5,4,14,0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // ---------- HUD ----------

  drawHud(game, view) {
    const { ctx } = this;
    const w = view.w;
    const h = view.h;
    this.drawMinimap(game, 14, 14);
    this.drawStarsAndCash(game, w);
    this.drawObjective(game, view);
    this.drawToasts(game, view);

    // Health, bottom-left above the controls card.
    const p = game.player;
    ctx.fillStyle = 'rgba(8,10,16,0.62)';
    rr(ctx, 14, h - 118, 208, 16, 8);
    ctx.fill();
    ctx.fillStyle = p.hp > 30 ? '#3ddc74' : '#ff4747';
    rr(ctx, 16, h - 116, 204 * Math.max(0, p.hp) / 100, 12, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('SALUD', 20, h - 107);

    // Controls card, bottom-left.
    ctx.fillStyle = 'rgba(8,10,16,0.55)';
    rr(ctx, 14, h - 96, 252, 82, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `11px ${FONT}`;
    const lines = p.car
      ? ['W A S D — conducir', 'ESPACIO — freno de mano', 'E — salir del coche', 'P — pausa']
      : ['W A S D — moverse · MAYÚS — correr', 'RATÓN — apuntar · CLIC — disparar', 'R — recargar · E — interactuar', 'P — pausa'];
    lines.forEach((line, i) => ctx.fillText(line, 24, h - 74 + i * 19));

    // Vehicle / weapon card, bottom-right.
    ctx.fillStyle = 'rgba(8,10,16,0.62)';
    rr(ctx, w - 222, h - 62, 208, 48, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'right';
    if (p.car) {
      const model = CAR_MODELS[p.car.model];
      ctx.fillText(model.name.toUpperCase(), w - 24, h - 40);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(w - 204, h - 30, 180, 7);
      ctx.fillStyle = p.car.hp > 30 ? '#ffb347' : '#ff4747';
      ctx.fillRect(w - 204, h - 30, 180 * Math.max(0, p.car.hp) / 100, 7);
    } else {
      ctx.fillText(game.reloadT > 0 ? 'RECARGANDO…' : `PISTOLA · ${game.ammo} / ∞`, w - 24, h - 40);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `11px ${FONT}`;
      ctx.fillText(p.hasPackage ? 'Llevas el paquete' : p.hasPassenger ? 'Pasajera: Marisol' : 'A pie', w - 24, h - 22);
    }

    // Context prompt, bottom-centre.
    if (game.prompt) {
      ctx.font = `bold 14px ${FONT}`;
      const tw = ctx.measureText(game.prompt).width + 30;
      ctx.fillStyle = 'rgba(8,10,16,0.72)';
      rr(ctx, w / 2 - tw / 2, h - 108, tw, 30, 15);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.textAlign = 'center';
      ctx.fillText(game.prompt, w / 2, h - 88);
    }

    // Bust meter.
    if (game.bustMeter > 0.02) {
      ctx.fillStyle = 'rgba(8,10,16,0.7)';
      rr(ctx, w / 2 - 130, h - 150, 260, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#ff4747';
      rr(ctx, w / 2 - 126, h - 146, 252 * Math.min(1, game.bustMeter), 18, 9);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('¡TE ESTÁN DETENIENDO!', w / 2, h - 133);
    }

    // Damage flash.
    if (game.hurtT > 3.4) {
      ctx.fillStyle = `rgba(200,20,30,${(game.hurtT - 3.4) * 0.22})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  drawMinimap(game, mx, my) {
    const { ctx } = this;
    const mw = 188;
    const mh = 178;
    const sx = mw / LAND_W;
    const sy = mh / WORLD_H;
    ctx.fillStyle = 'rgba(8,12,18,0.78)';
    rr(ctx, mx - 4, my - 4, mw + 8, mh + 8, 8);
    ctx.fill();
    ctx.fillStyle = '#175d7a';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#3a3f45';
    ctx.fillRect(mx, my, mw, LAND_H * sy);
    ctx.fillStyle = '#596068';
    for (let i = 0; i <= COLS; i++) ctx.fillRect(mx + roadCenterV(i) * sx - 1, my, 2, LAND_H * sy);
    for (let j = 0; j <= ROWS; j++) ctx.fillRect(mx, my + roadCenterH(j) * sy - 1, mw, 2);
    ctx.fillStyle = '#4e7a3a';
    for (const park of game.city.parks) {
      ctx.fillRect(mx + park.x * sx, my + park.y * sy, park.w * sx, park.h * sy);
    }
    for (const car of game.cars) {
      if (car.driver === 'police') continue;
      ctx.fillStyle = car === game.player.car ? '#ffffff' : 'rgba(220,224,230,0.55)';
      ctx.fillRect(mx + car.x * sx - 1.5, my + car.y * sy - 1.5, 3, 3);
    }
    const blink = Math.sin(game.time * 9) > 0;
    for (const car of game.cars) {
      if (car.driver !== 'police') continue;
      ctx.fillStyle = blink ? '#ff5147' : '#4f8dff';
      ctx.fillRect(mx + car.x * sx - 2, my + car.y * sy - 2, 4, 4);
    }
    const target = game.missions.currentTarget();
    if (target) {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(mx + target.x * sx, my + target.y * sy, 3.6 + Math.sin(game.time * 5) * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    const c = game.city.zones.contact;
    ctx.fillStyle = '#00e5ff';
    ctx.fillRect(mx + c.x * sx - 2, my + c.y * sy - 2, 4, 4);
    // Player arrow.
    const p = game.player;
    ctx.save();
    ctx.translate(mx + p.x * sx, my + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('SIRENA CITY', mx + 4, my + mh - 5);
  }

  drawStarsAndCash(game, w) {
    const { ctx } = this;
    const wanted = game.wanted;
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      const x = w - 168 + i * 32;
      const y = 34;
      ctx.font = `26px ${FONT}`;
      ctx.fillStyle = i < wanted ? '#ffd166' : 'rgba(255,255,255,0.22)';
      ctx.fillText('★', x, y);
    }
    if (wanted > 0) {
      ctx.font = `bold 11px ${FONT}`;
      ctx.fillStyle = game.sightT < 4.5 ? '#ff6b5e' : '#8aff5a';
      ctx.textAlign = 'right';
      ctx.fillText(game.sightT < 4.5 ? '¡TE HAN VISTO!' : 'Perdiendo el rastro…', w - 18, 56);
    }
    ctx.font = `bold 21px ${FONT}`;
    ctx.fillStyle = '#3ddc74';
    ctx.textAlign = 'right';
    const cash = `$${game.cash.toLocaleString('es-ES')}`;
    ctx.fillText(cash, w - 18, 84);
  }

  drawObjective(game, view) {
    const { ctx } = this;
    const w = view.w;
    const active = game.missions.active;
    let title;
    let label;
    let target = null;
    if (active) {
      title = active.def.title;
      const step = game.missions.currentStep();
      label = step ? step.label : '';
      target = game.missions.currentTarget();
    } else if (!game.missions.storyDone) {
      title = 'Historia';
      label = `Habla con ${CONTACT_NAME} en el paseo marítimo`;
      target = { ...game.city.zones.contact };
    } else {
      title = 'Sirena es tuya';
      label = `Marisol siempre tiene encargos en el paseo`;
      target = { ...game.city.zones.contact };
    }
    ctx.font = `bold 13px ${FONT}`;
    const tw = Math.max(ctx.measureText(title).width, ctx.measureText(label).width) + 36;
    ctx.fillStyle = 'rgba(8,10,16,0.66)';
    rr(ctx, w / 2 - tw / 2, 12, tw, 46, 9);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'center';
    ctx.fillText(title.toUpperCase(), w / 2, 31);
    ctx.fillStyle = '#ffffff';
    ctx.font = `12px ${FONT}`;
    let suffix = '';
    if (target) {
      const d = Math.hypot(target.x - game.player.x, target.y - game.player.y);
      suffix = ` · ${Math.round(d / 12)} m`;
    }
    ctx.fillText(label + suffix, w / 2, 50);

    // Edge arrow toward an off-screen target.
    if (target && game.mode === 'play') {
      const sx = target.x - this.camX;
      const sy = target.y - this.camY;
      if (sx < 30 || sy < 70 || sx > w - 30 || sy > view.h - 30) {
        const cx = Math.max(36, Math.min(w - 36, sx));
        const cy = Math.max(76, Math.min(view.h - 36, sy));
        const ang = Math.atan2(sy - cy, sx - cx);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(13, 0);
        ctx.lineTo(-8, -8);
        ctx.lineTo(-8, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  drawToasts(game, view) {
    const { ctx } = this;
    ctx.textAlign = 'center';
    game.toasts.forEach((toast, i) => {
      const y = 84 + i * 30;
      ctx.font = `bold 14px ${FONT}`;
      const tw = ctx.measureText(toast.text).width + 28;
      ctx.fillStyle = `rgba(8,10,16,${0.66 * Math.min(1, toast.t)})`;
      rr(ctx, view.w / 2 - tw / 2, y - 17, tw, 25, 12);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, toast.t)})`;
      ctx.fillText(toast.text, view.w / 2, y + 1);
    });
  }

  // ---------- screens ----------

  drawTitle(game, view) {
    const { ctx } = this;
    const w = view.w;
    const h = view.h;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(6,6,18,0.55)');
    grad.addColorStop(0.45, 'rgba(6,6,18,0.12)');
    grad.addColorStop(1, 'rgba(6,6,18,0.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = '#ff5d8f';
    ctx.shadowBlur = 34;
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 84px ${FONT}`;
    ctx.fillText('SIRENA', w / 2, h * 0.30);
    ctx.shadowColor = '#00e5ff';
    ctx.fillText('CITY', w / 2, h * 0.30 + 76);
    ctx.restore();
    ctx.fillStyle = '#ffd166';
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText('P U E R T O   D E   N E Ó N', w / 2, h * 0.30 + 112);

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `14px ${FONT}`;
    const blurb = wrapText(ctx, STORY_INTRO, Math.min(620, w - 80));
    blurb.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.30 + 148 + i * 20));

    const menuY = h * 0.30 + 148 + blurb.length * 20 + 42;
    ctx.font = `bold 19px ${FONT}`;
    ctx.fillStyle = '#3ddc74';
    ctx.fillText('▶  NUEVA PARTIDA', w / 2, menuY);
    if (game.hasSave()) {
      ctx.fillStyle = '#00e5ff';
      ctx.fillText('CONTINUAR  (tecla C)', w / 2, menuY + 30);
    }
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('ENTER — jugar · WASD — moverse/conducir · E — interactuar · Ratón — apuntar y disparar', w / 2, menuY + 66);
    if (Math.sin(game.time * 2.4) > -0.2) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText('PULSA ENTER', w / 2, h - 42);
    }
  }

  drawPause(game, view) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(5,6,14,0.66)';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 52px ${FONT}`;
    ctx.fillText('PAUSA', view.w / 2, view.h * 0.36);
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    const s = game.stats;
    const rows = [
      `Dinero: $${game.cash.toLocaleString('es-ES')} · Ganado: $${s.earned.toLocaleString('es-ES')}`,
      `Coches robados: ${s.stolen} · Disparos: ${s.shots} · Impactos: ${s.hits}`,
      `Detenciones: ${s.busts} · Hospital: ${s.wasted} · Misiones: ${game.missions.completedTotal}`,
      '',
      'P o ESC — seguir jugando',
    ];
    rows.forEach((row, i) => ctx.fillText(row, view.w / 2, view.h * 0.36 + 44 + i * 24));
  }

  drawOver(game, view) {
    const { ctx } = this;
    const busted = game.overKind === 'busted';
    if (busted) {
      const phase = Math.sin(game.time * 7) > 0;
      ctx.fillStyle = phase ? 'rgba(255,40,30,0.16)' : 'rgba(40,90,255,0.16)';
    } else {
      ctx.fillStyle = 'rgba(120,8,16,0.30)';
    }
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 64px ${FONT}`;
    ctx.fillText(busted ? 'DETENIDO' : 'ELIMINADO', view.w / 2, view.h * 0.42);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(
      busted ? 'La patrulla te ha ganado esta vez. Pagas la multa y vuelves al paseo.' : 'Despiertas en el hospital del puerto. La factura duele más que las balas.',
      view.w / 2, view.h * 0.42 + 42,
    );
    if (game.overT > 0.8) {
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText('Pulsa ENTER para seguir', view.w / 2, view.h * 0.42 + 78);
    }
  }
}
