// ai.js — the drivers and walkers of Sirena City.
// Traffic follows right-hand lanes on the road grid and picks a new heading
// at each intersection; pedestrians stroll the sidewalks and run from
// danger; the police drive straight at the player, with lead, and back up
// when they nose into a wall.

import { groundAt, roadCenterV, roadCenterH, COLS, ROWS } from './city.js';
import { stepCar, stepWalker, carSpeed } from './entities.js';

const LANE = 32;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function steerToward(car, tx, ty, dt) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(want, car.angle);
  return { steer: Math.max(-1, Math.min(1, diff * 2.4)), diff };
}

function laneTarget(car) {
  const { dx, dy } = car.ai;
  if (dy !== 0) {
    const i = Math.round((car.x - 64) / 576);
    const cx = roadCenterV(Math.max(0, Math.min(COLS, i)));
    return { x: cx + (dy > 0 ? -LANE : LANE), y: car.y + dy * 160 };
  }
  const j = Math.round((car.y - 64) / 576);
  const cy = roadCenterH(Math.max(0, Math.min(ROWS, j)));
  return { x: car.x + dx * 160, y: cy + (dx > 0 ? LANE : -LANE) };
}

// Is something solid in the lane just ahead of this car?
function blockedAhead(car, game, reach) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const test = (o, r) => {
    const rx = o.x - car.x;
    const ry = o.y - car.y;
    const ahead = rx * fx + ry * fy;
    if (ahead < 6 || ahead > reach) return false;
    const side = Math.abs(rx * -fy + ry * fx);
    return side < r;
  };
  for (const other of game.cars) {
    if (other !== car && test(other, 30)) return true;
  }
  if (game.player.car !== car && test(game.player, 22)) return true;
  for (const ped of game.peds) {
    if (ped.state !== 'down' && test(ped, 20)) return true;
  }
  return false;
}

function chooseTurn(car, rng) {
  const { dx, dy } = car.ai;
  const options = [[dx, dy], [-dy, dx], [dy, -dx]];
  // Never steer off the map: at the rim, drop the headings that leave it.
  const i = Math.round((car.x - 64) / 576);
  const j = Math.round((car.y - 64) / 576);
  const legal = options.filter(([ox, oy]) => {
    if (oy > 0 && j >= ROWS) return false;
    if (oy < 0 && j <= 0) return false;
    if (ox > 0 && i >= COLS) return false;
    if (ox < 0 && i <= 0) return false;
    return true;
  });
  const pick = legal.length ? legal[rng.int(0, legal.length - 1)] : [-dx, -dy];
  car.ai.dx = pick[0];
  car.ai.dy = pick[1];
}

export function initTraffic(car, rng) {
  const vertical = rng.chance(0.5);
  const s = rng.chance(0.5) ? 1 : -1;
  car.ai = { dx: vertical ? 0 : s, dy: vertical ? s : 0, decided: false, cruise: rng.range(0.42, 0.6) };
  car.angle = Math.atan2(car.ai.dy, car.ai.dx);
}

export function updateTraffic(car, dt, game) {
  const city = game.city;
  const rng = game.rng;
  // Intersection bookkeeping: decide a heading once per crossing.
  const jx = Math.round((car.x - 64) / 576);
  const jy = Math.round((car.y - 64) / 576);
  const nearCross = Math.abs(car.x - roadCenterV(jx)) < 58 && Math.abs(car.y - roadCenterH(jy)) < 58;
  if (nearCross && !car.ai.decided) {
    car.ai.decided = true;
    if (rng.chance(0.55)) chooseTurn(car, rng);
  } else if (!nearCross) {
    car.ai.decided = false;
  }

  const target = laneTarget(car);
  const { steer } = steerToward(car, target.x, target.y, dt);
  const speed = carSpeed(car);
  const fromModel = game.carTopSpeed(car);
  let desired = fromModel * car.ai.cruise;

  const threatNear = game.threat.t > 0
    && Math.hypot(game.threat.x - car.x, game.threat.y - car.y) < 280;
  if (threatNear) desired = fromModel * 0.95;
  if (blockedAhead(car, game, 95) && !threatNear) desired = 0;
  else if (blockedAhead(car, game, 55)) desired = Math.min(desired, 60);

  const vf = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
  let throttle = Math.max(-1, Math.min(1, (desired - vf) / 110));
  if (desired === 0 && vf > 4) throttle = -1;
  const control = { throttle, steer, brake: desired === 0 && vf > 30 };
  car.braking = desired < vf - 12;
  const impact = stepCar(car, dt, city, control);
  if (impact > 90) game.onAiCrash(car, impact);
  if (threatNear && car.honkT <= 0) {
    car.honkT = rng.range(0.7, 1.6);
    game.onHonk(car);
  }
  car.honkT -= dt;
  return speed;
}

export function updatePolice(car, dt, game) {
  const city = game.city;
  const p = game.player;
  const lead = Math.min(0.9, Math.hypot(p.x - car.x, p.y - car.y) / 700);
  const tx = p.x + (p.vx || 0) * lead;
  const ty = p.y + (p.vy || 0) * lead;
  const { steer, diff } = steerToward(car, tx, ty, dt);
  const speed = carSpeed(car);

  if (car.ai.stuckT === undefined) car.ai.stuckT = 0;
  if (car.ai.reverseT === undefined) car.ai.reverseT = 0;
  if (speed < 24 && car.ai.reverseT <= 0) car.ai.stuckT += dt;
  else car.ai.stuckT = 0;
  if (car.ai.stuckT > 1.1) {
    car.ai.reverseT = 0.65;
    car.ai.stuckT = 0;
  }

  let control;
  if (car.ai.reverseT > 0) {
    car.ai.reverseT -= dt;
    control = { throttle: -1, steer: -steer, brake: false };
  } else {
    control = {
      throttle: Math.abs(diff) > 1.25 ? 0.15 : 1,
      steer,
      brake: false,
    };
  }
  car.braking = false;
  const impact = stepCar(car, dt, city, control);
  if (impact > 120) game.onAiCrash(car, impact);
}

export function updatePed(ped, dt, game) {
  const city = game.city;
  const rng = game.rng;
  if (ped.state === 'down') {
    ped.vx = 0;
    ped.vy = 0;
    ped.downT -= dt;
    if (ped.downT <= 0 && ped.hp > 0) ped.state = 'walk';
    return;
  }
  const threatD = Math.hypot(game.threat.x - ped.x, game.threat.y - ped.y);
  if (game.threat.t > 0 && threatD < 250) {
    ped.state = 'flee';
    ped.fleeT = 1.6;
  }
  if (ped.state === 'flee') {
    ped.fleeT -= dt;
    const away = Math.atan2(ped.y - game.threat.y, ped.x - game.threat.x);
    ped.vx = Math.cos(away) * 155;
    ped.vy = Math.sin(away) * 155;
    ped.angle = away;
    if (ped.fleeT <= 0) {
      ped.state = 'walk';
      ped.tx = ped.x;
      ped.ty = ped.y;
    }
  } else if (ped.waitT > 0) {
    ped.waitT -= dt;
    ped.vx = 0;
    ped.vy = 0;
  } else {
    const dx = ped.tx - ped.x;
    const dy = ped.ty - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 12) {
      ped.waitT = rng.range(0.4, 3.2);
      for (let tries = 0; tries < 6; tries++) {
        const cx = ped.x + rng.range(-290, 290);
        const cy = ped.y + rng.range(-290, 290);
        const g = groundAt(city, cx, cy);
        if (g === 'sidewalk' || g === 'grass' || g === 'pier') {
          ped.tx = cx;
          ped.ty = cy;
          break;
        }
      }
    } else {
      ped.vx = (dx / d) * ped.speed;
      ped.vy = (dy / d) * ped.speed;
      ped.angle = Math.atan2(dy, dx);
    }
  }
  stepWalker(ped, dt, city, ped.radius);
}
