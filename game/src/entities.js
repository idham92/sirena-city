// entities.js — the moving things of Sirena City and their shared physics.
// Cars use a light drift model: velocity is split into forward and lateral
// parts along the heading, and the lateral part bleeds away at the grip
// rate, so a handbrake turn slides and a clean turn does not.

import { groundAt, pushOutOfRects, WORLD_W, WORLD_H } from './city.js';

export const CAR_MODELS = [
  { name: 'Pico', w: 44, h: 24, top: 300, accel: 260, colors: ['#d94f3d', '#3d7bd9', '#e8c832', '#7ac74f', '#e8e8e8'] },
  { name: 'Vega Familiar', w: 50, h: 26, top: 330, accel: 240, colors: ['#8899aa', '#445566', '#bb3344', '#336655', '#ddd6c3'] },
  { name: 'Coral GT', w: 52, h: 26, top: 430, accel: 360, colors: ['#ff6f61'] },
  { name: 'Taxi Sol', w: 50, h: 26, top: 320, accel: 250, colors: ['#f7b731'] },
  { name: 'Burro', w: 54, h: 28, top: 290, accel: 230, colors: ['#77815a', '#5a6e77', '#8a6d4b'] },
  { name: 'Cargo', w: 56, h: 30, top: 270, accel: 210, colors: ['#cfd4d8', '#9fb4c0', '#c2b280'] },
  { name: 'Patrulla', w: 52, h: 27, top: 395, accel: 330, colors: ['#20303e'] },
];

export const MODEL = { PICO: 0, VEGA: 1, CORAL: 2, TAXI: 3, BURRO: 4, CARGO: 5, POLICE: 6 };

let nextId = 1;

export function makeCar(x, y, angle, modelIndex, color) {
  const model = CAR_MODELS[modelIndex];
  return {
    id: nextId++,
    kind: 'car',
    x, y, angle,
    vx: 0, vy: 0,
    steer: 0,
    model: modelIndex,
    color: color ?? model.colors[0],
    radius: (model.w + model.h) / 4,
    hp: 100,
    driver: 'none', // 'ai' | 'player' | 'police' | 'none'
    ai: null,
    burning: 0,
    wrecked: false,
    honkT: 0,
  };
}

const PED_COLORS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#e84393', '#f5f6fa', '#00cec9', '#fd79a8'];

export function makePed(x, y, rng) {
  return {
    id: nextId++,
    kind: 'ped',
    x, y,
    angle: rng.range(0, Math.PI * 2),
    vx: 0, vy: 0,
    radius: 9,
    hp: 30,
    state: 'walk',
    tx: x, ty: y,
    waitT: rng.range(0, 2),
    fleeT: 0,
    downT: 0,
    color: rng.pick(PED_COLORS),
    speed: rng.range(42, 62),
  };
}

export function carSpeed(car) {
  return Math.hypot(car.vx, car.vy);
}

// One physics step for a car under a control {throttle -1..1, steer -1..1,
// brake bool}. Returns the impact speed lost to building hits this step.
export function stepCar(car, dt, city, control) {
  const model = CAR_MODELS[car.model];
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let vf = car.vx * fx + car.vy * fy;
  const lx = car.vx - fx * vf;
  const ly = car.vy - fy * vf;

  const ground = groundAt(city, car.x, car.y);
  const surfaceGrip = ground === 'grass' || ground === 'block' ? 5.5 : 8.5;
  const grip = control.brake && Math.abs(vf) > 60 ? 1.4 : surfaceGrip;
  const drag = ground === 'grass' ? 0.9 : 0.25;

  if (control.throttle > 0) vf += model.accel * control.throttle * dt;
  if (control.throttle < 0) vf += model.accel * 0.62 * control.throttle * dt;
  if (control.brake && vf > 0) vf -= 620 * dt;
  vf -= vf * drag * dt;
  const top = model.top * (car.hp < 30 ? 0.55 : 1);
  vf = Math.max(-model.top * 0.38, Math.min(top, vf));

  const steerAuthority = Math.min(1, Math.abs(vf) / 120) * (vf < 0 ? -1 : 1);
  car.angle += control.steer * 2.35 * steerAuthority * dt;
  car.steer = control.steer;

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  const keep = Math.exp(-grip * dt);
  car.vx = nfx * vf + lx * keep;
  car.vy = nfy * vf + ly * keep;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Water is a wall for cars: piers and land only.
  if (groundAt(city, car.x, car.y) === 'water') {
    car.x -= car.vx * dt;
    car.y -= car.vy * dt;
    car.vx *= 0.4;
    car.vy *= 0.4;
  }
  car.x = Math.max(20, Math.min(WORLD_W - 20, car.x));
  car.y = Math.max(20, Math.min(WORLD_H - 20, car.y));

  const before = Math.hypot(car.vx, car.vy);
  const pushed = pushOutOfRects(car.x, car.y, car.radius, city.colliders);
  if (pushed.x !== car.x || pushed.y !== car.y) {
    car.x = pushed.x;
    car.y = pushed.y;
    car.vx *= 0.45;
    car.vy *= 0.45;
    const after = Math.hypot(car.vx, car.vy);
    return Math.max(0, before - after);
  }
  return 0;
}

// Circle-pair resolution between cars; returns a list of impacts
// {a, b, force} strong enough for the game to price damage and noise.
export function collideCars(cars) {
  const impacts = [];
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = (min - d) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const rel = rvx * nx + rvy * ny;
      if (rel < 0) {
        const impulse = -rel * 0.72;
        a.vx -= nx * impulse;
        a.vy -= ny * impulse;
        b.vx += nx * impulse;
        b.vy += ny * impulse;
        if (-rel > 55) impacts.push({ a, b, force: -rel });
      }
    }
  }
  return impacts;
}

// The player and pedestrians move as simple velocity walkers.
export function stepWalker(w, dt, city, radius) {
  w.x += w.vx * dt;
  w.y += w.vy * dt;
  if (groundAt(city, w.x, w.y) === 'water') {
    w.x -= w.vx * dt;
    w.y -= w.vy * dt;
    w.vx = 0;
    w.vy = 0;
  }
  const pushed = pushOutOfRects(w.x, w.y, radius, city.colliders);
  w.x = pushed.x;
  w.y = pushed.y;
  w.x = Math.max(12, Math.min(WORLD_W - 12, w.x));
  w.y = Math.max(12, Math.min(WORLD_H - 12, w.y));
}
