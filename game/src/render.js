// SIRENA CITY — everything the player sees: the dusk city from above, its
// traffic and people, the neon signs, the HUD with its minimap, and the menu
// and end screens. The simulation lives in game.js; this module only reads
// the world and paints it, one clear job per function.
import {
  BLOCK, CAR_LENGTH, CAR_WIDTH, CITY_H, CITY_W, COLORS, PITCH, PLAYER_MAX_HP,
  ROAD, SHORE_Y,
} from './config.js';
import { hash2 } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 1280;
  let H = 720;
  let dpr = 1;

  function resize() {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  function text(str, x, y, size, color, align = 'left', weight = 400, alpha = 1) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.globalAlpha = alpha;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }

  // --- The city -----------------------------------------------------------------

  function drawCity(world, view) {
    const { city } = world;
    // Land base, then the sea with its moving sparkle.
    ctx.fillStyle = '#3a3f4c';
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(view.x0, SHORE_Y, view.x1 - view.x0, CITY_H - SHORE_Y);
    ctx.fillStyle = COLORS.waterDeep;
    for (let x = Math.floor(view.x0 / 90) * 90; x < view.x1; x += 90) {
      for (let y = SHORE_Y + 30; y < CITY_H; y += 70) {
        const off = Math.sin(world.time * 0.9 + hash2(x, y) * 9) * 9;
        ctx.fillRect(x + off, y, 34, 3);
      }
    }
    ctx.fillStyle = '#8a7a56';
    ctx.fillRect(view.x0, SHORE_Y - 6, view.x1 - view.x0, 6);

    // Streets: asphalt slabs with dashed centre lines.
    ctx.fillStyle = COLORS.asphalt;
    for (const cx of city.vRoads) ctx.fillRect(cx - ROAD / 2, 0, ROAD, SHORE_Y);
    for (const cy of city.hRoads) ctx.fillRect(0, cy - ROAD / 2, CITY_W, ROAD);
    ctx.fillStyle = COLORS.asphaltEdge;
    for (const cx of city.vRoads) {
      ctx.fillRect(cx - ROAD / 2, 0, 3, SHORE_Y);
      ctx.fillRect(cx + ROAD / 2 - 3, 0, 3, SHORE_Y);
    }
    ctx.strokeStyle = COLORS.lane;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 20]);
    ctx.beginPath();
    for (const cx of city.vRoads) {
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, SHORE_Y);
    }
    for (const cy of city.hRoads) {
      ctx.moveTo(0, cy);
      ctx.lineTo(CITY_W, cy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Block pavements.
    ctx.fillStyle = COLORS.sidewalk;
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const x = col * PITCH + ROAD;
        const y = row * PITCH + ROAD;
        if (x + BLOCK < view.x0 || y + BLOCK < view.y0 || x > view.x1 || y > view.y1) continue;
        ctx.fillRect(x, y, BLOCK, BLOCK);
      }
    }

    // Parks: grass, a path cross, and trees.
    for (const park of city.parks) {
      if (!inView(park, view)) continue;
      ctx.fillStyle = COLORS.grass;
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.fillStyle = COLORS.parkPath;
      ctx.fillRect(park.x, park.y + park.h / 2 - 7, park.w, 14);
      ctx.fillRect(park.x + park.w / 2 - 7, park.y, 14, park.h);
      const trees = 5 + Math.floor(hash2(park.seed, 1) * 5);
      for (let i = 0; i < trees; i += 1) {
        const tx = park.x + 22 + hash2(park.seed, i * 2 + 3) * (park.w - 44);
        const ty = park.y + 22 + hash2(park.seed, i * 2 + 4) * (park.h - 44);
        drawTree(tx, ty, 13 + hash2(park.seed, i) * 6);
      }
    }

    // Parking lots.
    for (const lot of city.lots) {
      if (!inView(lot, view)) continue;
      ctx.fillStyle = '#333743';
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.strokeStyle = 'rgba(230,230,220,0.35)';
      ctx.lineWidth = 2;
      for (let x = lot.x + 16; x < lot.x + lot.w - 20; x += 34) {
        ctx.strokeRect(x, lot.y + 14, 26, 44);
        ctx.strokeRect(x, lot.y + lot.h - 58, 26, 44);
      }
      if (lot.name) drawSign(lot.name, lot.x + lot.w / 2, lot.y + lot.h / 2, lot.neon, 17);
    }

    // Piers: planks over the water, and the lighthouse at the far one.
    for (const pier of city.piers) {
      ctx.fillStyle = '#6d5136';
      ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
      ctx.fillStyle = '#7d5f40';
      for (let y = pier.y + 6; y < pier.y + pier.h; y += 16) ctx.fillRect(pier.x + 3, y, pier.w - 6, 3);
    }
    const far = city.piers[city.piers.length - 1];
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(far.x + far.w / 2 - 9, far.y + far.h - 26, 18, 26);
    ctx.fillStyle = '#ff4040';
    ctx.fillRect(far.x + far.w / 2 - 9, far.y + far.h - 26, 18, 6);
    const glow = 0.5 + Math.sin(world.time * 2.4) * 0.3;
    ctx.fillStyle = `rgba(255,220,120,${glow})`;
    ctx.beginPath();
    ctx.arc(far.x + far.w / 2, far.y + far.h - 30, 6, 0, Math.PI * 2);
    ctx.fill();

    // Buildings: shadow, roof, lit windows, neon name.
    for (const b of city.buildings) {
      if (!inView(b, view)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = COLORS.buildingEdge;
      ctx.lineWidth = 5;
      ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(b.x + 16, b.y + 16, b.w * 0.32, b.h * 0.22);
      const cols = Math.floor(b.w / 17);
      const rows = Math.floor(b.h / 17);
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          const lit = hash2(b.seed * 3 + i, j * 7 + b.seed);
          if (lit > 0.52) {
            ctx.fillStyle = lit > 0.9 ? 'rgba(160,220,255,0.85)' : 'rgba(255,205,110,0.8)';
            ctx.fillRect(b.x + 9 + i * 17, b.y + 9 + j * 17, 7, 5);
          }
        }
      }
      drawSign(b.name, b.x + b.w / 2, b.y + 22, b.neon, 13);
    }

    // Street lamps at the intersections.
    ctx.fillStyle = '#20222b';
    for (const cx of city.vRoads) {
      for (const cy of city.hRoads) {
        if (cx < view.x0 - 20 || cy < view.y0 - 20 || cx > view.x1 + 20 || cy > view.y1 + 20) continue;
        ctx.beginPath();
        ctx.arc(cx - ROAD / 2 + 6, cy - ROAD / 2 + 6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function inView(rect, view) {
    return rect.x + rect.w >= view.x0 && rect.y + rect.h >= view.y0 && rect.x <= view.x1 && rect.y <= view.y1;
  }

  function drawTree(x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(x + 3, y + 4, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#274d2c';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#356b3a';
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSign(name, x, y, color, size) {
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.fillStyle = color;
    ctx.fillText(name.toUpperCase(), x, y);
    ctx.shadowBlur = 0;
  }

  // --- Actors ---------------------------------------------------------------------

  function drawCar(world, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow, then the body.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(4 - CAR_LENGTH / 2, 4 - CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH, 6);
    ctx.fill();
    ctx.fillStyle = car.exploded ? '#1c1c20' : car.color;
    if (car.kind === 'police') ctx.fillStyle = car.exploded ? '#1c1c20' : '#20242e';
    roundRect(-CAR_LENGTH / 2, -CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH, 6);
    ctx.fill();
    if (car.kind === 'police' && !car.exploded) {
      ctx.fillStyle = '#e8edf4';
      roundRect(-CAR_LENGTH * 0.22, -CAR_WIDTH / 2, CAR_LENGTH * 0.44, CAR_WIDTH, 4);
      ctx.fill();
    }
    // Cabin and glass.
    ctx.fillStyle = car.exploded ? '#101013' : '#1d2733';
    roundRect(-CAR_LENGTH * 0.16, -CAR_WIDTH * 0.38, CAR_LENGTH * 0.4, CAR_WIDTH * 0.76, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,210,255,0.5)';
    ctx.fillRect(CAR_LENGTH * 0.2, -CAR_WIDTH * 0.34, 4, CAR_WIDTH * 0.68);
    // Lights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(CAR_LENGTH / 2 - 3, -CAR_WIDTH * 0.36, 3, 5);
    ctx.fillRect(CAR_LENGTH / 2 - 3, CAR_WIDTH * 0.36 - 5, 3, 5);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-CAR_LENGTH / 2, -CAR_WIDTH * 0.36, 3, 5);
    ctx.fillRect(-CAR_LENGTH / 2, CAR_WIDTH * 0.36 - 5, 3, 5);
    if (car.kind === 'police' && !car.exploded && !car.disabled) {
      const phase = Math.sin(world.time * 11 + car.flash) > 0;
      ctx.fillStyle = phase ? '#ff2e4d' : '#2e7dff';
      ctx.fillRect(-6, -7, 12, 5);
      ctx.fillStyle = phase ? '#2e7dff' : '#ff2e4d';
      ctx.fillRect(-6, 2, 12, 5);
    }
    if (car.sports && !car.exploded) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(-CAR_LENGTH / 2 + 2, -CAR_WIDTH / 2, 5, CAR_WIDTH);
    }
    ctx.restore();

    if (car.marked) {
      const bob = Math.sin(world.time * 4) * 4;
      ctx.fillStyle = '#ffd23e';
      ctx.strokeStyle = 'rgba(255,210,62,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(car.x, car.y, 34 + bob * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      drawMarker(car.x, car.y - 52 + bob, '#ffd23e', '!');
    }
    if (car === world.player.inCar) {
      const bob = Math.sin(world.time * 5) * 3;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(world.player.x - 7, world.player.y - 40 + bob);
      ctx.lineTo(world.player.x + 7, world.player.y - 40 + bob);
      ctx.lineTo(world.player.x, world.player.y - 31 + bob);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawMarker(x, y, color, label) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + 12);
    ctx.lineTo(x - 8, y - 4);
    ctx.lineTo(x + 8, y - 4);
    ctx.closePath();
    ctx.fill();
    text(label, x, y - 8, 13, '#10131a', 'center', 800);
  }

  function drawPed(world, ped) {
    if (ped.state === 'down') {
      ctx.fillStyle = 'rgba(120,10,20,0.5)';
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 15, 9, ped.phase, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a3f4a';
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 11, 5, ped.phase, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const bob = ped.speed > 4 ? Math.sin(world.time * 11 + ped.phase) * 1.6 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(ped.x + 2, ped.y + 3, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y + bob * 0.3, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98d';
    ctx.beginPath();
    ctx.arc(ped.x + Math.cos(ped.angle) * 2, ped.y + bob * 0.3 + Math.sin(ped.angle) * 2, 4.4, 0, Math.PI * 2);
    ctx.fill();
    if (ped.contact) {
      const bobY = Math.sin(world.time * 3.4) * 4;
      drawMarker(ped.x, ped.y - 34 + bobY, '#ff5da2', 'M');
      text('Marina Sol', ped.x, ped.y - 46 + bobY, 12, '#ffb3d1', 'center', 700);
    }
  }

  function drawPlayer(world) {
    const p = world.player;
    if (p.inCar) return;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(p.x + 2, p.y + 3, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1d2733';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98d';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 3, p.y + Math.sin(p.angle) * 3, 4.2, 0, Math.PI * 2);
    ctx.fill();
    // The pistol, when aiming or freshly fired.
    if (world.aiming || p.fireT > 0) {
      ctx.strokeStyle = '#14161c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.angle) * 8, p.y + Math.sin(p.angle) * 8);
      ctx.lineTo(p.x + Math.cos(p.angle) * 17, p.y + Math.sin(p.angle) * 17);
      ctx.stroke();
    }
    // Bust meter over the head while the police close in.
    if (world.wanted.bust > 0.02) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(p.x - 22, p.y - 30, 44, 6);
      ctx.fillStyle = '#ff2e4d';
      ctx.fillRect(p.x - 21, p.y - 29, 42 * world.wanted.bust, 4);
    }
  }

  function drawEffects(world) {
    for (const t of world.tracers) {
      ctx.strokeStyle = 'rgba(255,230,150,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
    for (const p of world.particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.ttl);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Dusk: a blue wash, headlight cones and police glows over the world. */
  function drawDusk(world, view) {
    ctx.fillStyle = 'rgba(16,18,54,0.20)';
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    ctx.globalCompositeOperation = 'lighter';
    for (const car of world.cars) {
      if (car.exploded || car.sunk) continue;
      if (car.x < view.x0 - 140 || car.x > view.x1 + 140 || car.y < view.y0 - 140 || car.y > view.y1 + 140) continue;
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const grad = ctx.createRadialGradient(car.x + fx * 26, car.y + fy * 26, 4, car.x + fx * 26, car.y + fy * 26, 96);
      grad.addColorStop(0, 'rgba(255,230,160,0.16)');
      grad.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(car.x + fx * 26, car.y + fy * 26, 96, 0, Math.PI * 2);
      ctx.fill();
      if (car.kind === 'police' && !car.disabled) {
        const phase = Math.sin(world.time * 11 + car.flash) > 0;
        const g2 = ctx.createRadialGradient(car.x, car.y, 2, car.x, car.y, 54);
        const col = phase ? 'rgba(255,46,77,0.20)' : 'rgba(46,125,255,0.20)';
        g2.addColorStop(0, col);
        g2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(car.x, car.y, 54, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // --- HUD ---------------------------------------------------------------------------

  function drawMinimap(world) {
    const mw = 176;
    const mh = Math.round(mw * CITY_H / CITY_W);
    const x0 = 14;
    const y0 = 14;
    const s = mw / CITY_W;
    ctx.fillStyle = 'rgba(10,13,20,0.82)';
    ctx.fillRect(x0 - 4, y0 - 4, mw + 8, mh + 8);
    ctx.fillStyle = '#14405f';
    ctx.fillRect(x0, y0 + SHORE_Y * s, mw, (CITY_H - SHORE_Y) * s);
    ctx.fillStyle = '#3a3f4c';
    ctx.fillRect(x0, y0, mw, SHORE_Y * s);
    ctx.strokeStyle = 'rgba(200,178,90,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const cx of world.city.vRoads) {
      ctx.moveTo(x0 + cx * s, y0);
      ctx.lineTo(x0 + cx * s, y0 + SHORE_Y * s);
    }
    for (const cy of world.city.hRoads) {
      ctx.moveTo(x0, y0 + cy * s);
      ctx.lineTo(x0 + mw, y0 + cy * s);
    }
    ctx.stroke();
    for (const car of world.cars) {
      if (car.exploded) continue;
      ctx.fillStyle = car.kind === 'police'
        ? (Math.sin(world.time * 11 + car.flash) > 0 ? '#ff2e4d' : '#2e7dff')
        : car.marked ? '#ffd23e' : 'rgba(230,230,230,0.75)';
      ctx.fillRect(x0 + car.x * s - 1.6, y0 + car.y * s - 1.6, 3.2, 3.2);
    }
    const obj = world.missions.objective(world);
    if (obj && obj.x !== null) {
      ctx.fillStyle = obj.marker === 'contact' ? '#ff5da2' : '#ffd23e';
      ctx.beginPath();
      ctx.arc(x0 + obj.x * s, y0 + obj.y * s, 3.6 + Math.sin(world.time * 5) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a white arrow.
    const p = world.player;
    ctx.save();
    ctx.translate(x0 + p.x * s, y0 + p.y * s);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Camera frame.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(
      x0 + (world.camera.x - world.view.w / 2) * s,
      y0 + (world.camera.y - world.view.h / 2) * s,
      world.view.w * s, world.view.h * s,
    );
    return { w: mw, h: mh };
  }

  function drawHud(world, map) {
    const p = world.player;
    const leftX = 14;
    const topY = 14 + map.h + 12;
    text(`$${p.cash}`, leftX, topY + 16, 22, '#7dff6a', 'left', 800);
    // Health bar.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(leftX, topY + 26, 150, 11);
    ctx.fillStyle = p.hp > 32 ? '#3ddc62' : '#ff2e4d';
    ctx.fillRect(leftX + 1, topY + 27, 148 * Math.max(0, p.hp) / PLAYER_MAX_HP, 9);
    text(`Salud ${Math.max(0, Math.ceil(p.hp))}`, leftX, topY + 52, 12, '#cfd6dd', 'left', 600);

    // Wanted stars, top right.
    const stars = Math.ceil(world.wanted.stars - 0.001);
    for (let i = 0; i < 5; i += 1) {
      const x = W - 34 - i * 34;
      text('★', x, 36, 30, i < stars ? '#ffd23e' : 'rgba(255,255,255,0.22)', 'center', 800);
    }
    if (world.wanted.stars > 0 && !world.wanted.seen && world.wanted.unseenTime > 2) {
      text('La policía te está buscando…', W - 24, 62, 13, '#ffd23e', 'right', 600);
    }

    // Objective banner, top centre.
    const obj = world.missions.objective(world);
    if (obj) {
      ctx.font = `600 15px ${FONT}`;
      const label = obj.text;
      const wText = ctx.measureText(label).width + 30;
      ctx.fillStyle = 'rgba(10,13,20,0.78)';
      roundRectPath((W - wText) / 2, 12, wText, 30, 8);
      ctx.fill();
      ctx.fillStyle = obj.marker === 'contact' ? '#ff5da2' : '#ffd23e';
      ctx.beginPath();
      ctx.arc((W - wText) / 2 + 15, 27, 5, 0, Math.PI * 2);
      ctx.fill();
      text(label, W / 2 + 8, 32, 15, '#f2f4f8', 'center', 600);
      const timer = world.missions.timerText();
      if (timer) text(timer, W / 2, 58, 14, '#ffb3b3', 'center', 700);
      // An edge arrow when the objective is off-screen.
      if (obj.x !== null) {
        const dx = obj.x - p.x;
        const dy = obj.y - p.y;
        const dist = Math.hypot(dx, dy);
        const sx = p.x - world.camera.x + W / 2;
        const sy = p.y - world.camera.y + H / 2;
        const ox = obj.x - world.camera.x + W / 2;
        const oy = obj.y - world.camera.y + H / 2;
        if (ox < 20 || ox > W - 20 || oy < 20 || oy > H - 20) {
          const ang = Math.atan2(dy, dx);
          const ex = Math.max(36, Math.min(W - 36, sx + Math.cos(ang) * 130));
          const ey = Math.max(90, Math.min(H - 60, sy + Math.sin(ang) * 130));
          ctx.save();
          ctx.translate(ex, ey);
          ctx.rotate(ang);
          ctx.fillStyle = '#ffd23e';
          ctx.beginPath();
          ctx.moveTo(13, 0);
          ctx.lineTo(-8, -8);
          ctx.lineTo(-8, 8);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          text(`${Math.round(dist / 10)} m`, ex, ey + 26, 12, '#ffd23e', 'center', 700);
        }
      }
    }

    // Bottom left: what you drive or carry.
    if (p.inCar) {
      text(p.inCar.name, 16, H - 44, 17, '#f2f4f8', 'left', 700);
      text(`${Math.round(Math.abs(p.inCar.speed) * 0.36)} km/h · Chapa ${Math.max(0, Math.ceil(p.inCar.hp))}%`, 16, H - 20, 13, '#aeb8c4', 'left', 400);
    } else {
      text(p.reloadT > 0 ? 'Pistola · recargando…' : `Pistola · ${p.mag}/12`, 16, H - 20, 14, '#aeb8c4', 'left', 600);
    }

    // Context prompt, bottom centre.
    let prompt = '';
    if (!p.inCar) {
      const nearCar = world.cars.some((c) => !c.exploded && !c.sunk && Math.hypot(c.x - p.x, c.y - p.y) < 54);
      const nearContact = Math.hypot(world.contact.x - p.x, world.contact.y - p.y) < 56;
      if (nearContact) prompt = 'E — Hablar con Marina';
      else if (nearCar) prompt = 'E — Subir al coche';
    } else prompt = 'E — Bajar del coche · Espacio — freno de mano';
    if (prompt) text(prompt, W / 2, H - 20, 15, '#ffffff', 'center', 700);

    text('WASD conducir/andar · E entrar/salir · Ratón apuntar · Clic disparar · R recargar · P pausa · M sonido', W - 16, H - 20, 11.5, 'rgba(230,236,244,0.55)', 'right', 400);

    // Toasts, stacked under the banner.
    let ty = 84;
    for (const toast of world.toasts) {
      if (toast.t < 0) continue;
      const alpha = Math.min(1, (toast.ttl - toast.t) / 0.6, toast.t / 0.25 + 0.2);
      ctx.font = `600 15px ${FONT}`;
      const wText = ctx.measureText(toast.text).width + 26;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = 'rgba(10,13,20,0.8)';
      roundRectPath((W - wText) / 2, ty - 17, wText, 26, 7);
      ctx.fill();
      text(toast.text, W / 2, ty + 3, 15, '#ffe9a8', 'center', 600);
      ctx.globalAlpha = 1;
      ty += 32;
    }
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function roundRect(x, y, w, h, r) {
    roundRectPath(x, y, w, h, r);
  }

  // --- Screens -------------------------------------------------------------------------

  function drawTitle(world, ui) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(8,8,28,0.55)');
    grad.addColorStop(0.55, 'rgba(8,8,28,0.25)');
    grad.addColorStop(1, 'rgba(8,8,28,0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    const pulse = 0.85 + Math.sin(world.time * 2.2) * 0.15;
    ctx.save();
    ctx.shadowColor = '#ff5da2';
    ctx.shadowBlur = 34 * pulse;
    text('SIRENA CITY', W / 2, H * 0.3, 84, '#ffd9ec', 'center', 900);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = '#39d0ff';
    ctx.shadowBlur = 18;
    text('— NOCHES DE NEÓN · PUERTO DE SIRENA —', W / 2, H * 0.3 + 44, 17, '#bfeaff', 'center', 700);
    ctx.restore();
    text('Marina Sol, dueña del Café Litoral, tiene un plan para dejar la ciudad atrás,', W / 2, H * 0.48, 16.5, '#e8ecf4', 'center', 400);
    text('y tú eres quien conduce. Haz sus encargos, roba coches, pierde a la policía', W / 2, H * 0.48 + 23, 16.5, '#e8ecf4', 'center', 400);
    text('y llénate los bolsillos en una ciudad que nunca duerme.', W / 2, H * 0.48 + 46, 16.5, '#e8ecf4', 'center', 400);

    const blink = Math.sin(world.time * 4) > -0.2;
    if (ui.hasSave) {
      text('ENTER — Continuar la partida', W / 2, H * 0.66, 21, '#7dff6a', 'center', 800);
      text('N — Nueva partida', W / 2, H * 0.66 + 30, 15, '#aeb8c4', 'center', 600);
    } else if (blink) {
      text('ENTER o CLIC — Empezar', W / 2, H * 0.66, 21, '#7dff6a', 'center', 800);
    }
    text('WASD / Flechas — moverse y conducir · E — entrar, salir y hablar · Shift — correr', W / 2, H * 0.8, 14, '#aeb8c4', 'center', 400);
    text('Ratón — apuntar · Clic — disparar · R — recargar · Espacio — freno de mano · P — pausa · M — sonido', W / 2, H * 0.8 + 22, 14, '#aeb8c4', 'center', 400);
    text('Completa los encargos de Marina en el Café Litoral. Las estrellas atraen patrullas: escóndete para perderlas.', W / 2, H * 0.8 + 48, 13, 'rgba(230,236,244,0.6)', 'center', 400);
  }

  function drawCenterPanel(title, lines, color) {
    ctx.fillStyle = 'rgba(5,6,14,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
    text(title, W / 2, H * 0.42, 62, '#ffffff', 'center', 900);
    ctx.restore();
    lines.forEach((line, i) => text(line, W / 2, H * 0.42 + 52 + i * 26, 17, '#e8ecf4', 'center', 500));
  }

  /** Paint one frame. `screen` is one of the SCREEN_* values; `ui` carries {hasSave}. */
  function draw(world, screen, ui = {}) {
    world.view.w = W;
    world.view.h = H;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0e18';
    ctx.fillRect(0, 0, W, H);

    const shakeX = world.shake ? (Math.random() - 0.5) * world.shake : 0;
    const shakeY = world.shake ? (Math.random() - 0.5) * world.shake : 0;
    const camX = world.camera.x + shakeX;
    const camY = world.camera.y + shakeY;
    const view = {
      x0: camX - W / 2 - 60, y0: camY - H / 2 - 60,
      x1: camX + W / 2 + 60, y1: camY + H / 2 + 60,
    };
    ctx.save();
    ctx.translate(W / 2 - camX, H / 2 - camY);
    drawCity(world, view);
    // The objective beacon: a pillar of gold light on the map point.
    const obj = screen === SCREEN_PLAY || screen === SCREEN_PAUSED ? world.missions.objective(world) : null;
    if (obj && obj.x !== null) {
      const grad = ctx.createLinearGradient(0, obj.y - 190, 0, obj.y);
      grad.addColorStop(0, 'rgba(255,210,62,0)');
      grad.addColorStop(1, 'rgba(255,210,62,0.30)');
      ctx.fillStyle = grad;
      ctx.fillRect(obj.x - 13, obj.y - 190, 26, 190);
      ctx.fillStyle = 'rgba(255,210,62,0.25)';
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, 26 + Math.sin(world.time * 4) * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const sortedCars = [...world.cars].sort((a, b) => a.y - b.y);
    for (const car of sortedCars) {
      if (car.sunk) continue; // under the harbour water, gone from sight
      if (car.x < view.x0 - 80 || car.x > view.x1 + 80 || car.y < view.y0 - 80 || car.y > view.y1 + 80) continue;
      drawCar(world, car);
    }
    for (const ped of world.peds) drawPed(world, ped);
    if (screen !== SCREEN_TITLE) drawPlayer(world);
    drawEffects(world);
    drawDusk(world, view);
    ctx.restore();

    // Vignette.
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,8,0)');
    vg.addColorStop(1, 'rgba(0,0,8,0.4)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (screen === SCREEN_TITLE) {
      drawTitle(world, ui);
      return;
    }
    const map = drawMinimap(world);
    drawHud(world, map);
    if (screen === SCREEN_PAUSED) drawCenterPanel('PAUSA', ['La ciudad te espera.', 'P o Esc — seguir jugando'], '#39d0ff');
    else if (screen === SCREEN_BUSTED) drawCenterPanel('¡DETENIDO!', ['La Patrulla Sirena te ha echado el guante.', 'Multa pagada. Estrellas limpias. No vuelvas a caer.'], '#ff2e4d');
    else if (screen === SCREEN_WASTED) drawCenterPanel('¡HECHO POLVO!', ['Despiertas en el Hospital San Roque.', 'Las curas cuestan dinero. La próxima vez, frena.'], '#ff8c42');
  }

  return { draw };
}
