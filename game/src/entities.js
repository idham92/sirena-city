// SIRENA CITY — the living traffic of the city: civilian cars that drive the
// street grid, parked cars waiting to be borrowed, pedestrians on the
// pavements, and the police who answer the wanted level. Cars share one
// arcade driving model; each kind just feeds it different steering.
import {
  CAR_LENGTH, CAR_MAX_HP, CAR_WIDTH, CITY_H, CITY_W, PED_COUNT, SPORTS_COLORS,
  CAR_COLORS, TRAFFIC_COUNT,
} from './config.js';

export const CAR_MODELS = ['Vela Compacto', 'Puerto Sedán', 'Maré Hatch', 'Brisa Furgoneta', 'Ondina Coupé', 'Faro Pickup', 'Taxi Sirena'];
let nextCarId = 1;

export function createCar(x, y, angle, opts = {}) {
  return {
    id: nextCarId++,
    x, y, angle,
    speed: 0,
    hp: CAR_MAX_HP,
    kind: opts.kind || 'traffic', // traffic | parked | police
    sports: !!opts.sports,
    color: opts.color || '#888',
    name: opts.name || 'Coche',
    driver: opts.driver !== false,
    leg: opts.leg || null,        // traffic: {axis, idx, dir, next}
    cruise: opts.cruise || 150,
    panic: 0,
    panicFrom: null,
    disabled: false,
    fire: 0,          // seconds burning before the explosion
    exploded: false,
    sunk: false,
    stuckTime: 0,
    reverseTime: 0,
    flash: Math.random() * Math.PI * 2, // police light phase
  };
}

/** The two circles (front/rear) that approximate a car for collisions. */
export function carCircles(car) {
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const off = CAR_LENGTH / 4;
  return [
    { x: car.x + c * off, y: car.y + s * off, r: 15 },
    { x: car.x - c * off, y: car.y - s * off, r: 15 },
  ];
}

/**
 * One step of the shared driving model. steer -1..1, throttle -1..1.
 * Returns the impact speed if the car struck a building, else 0.
 */
export function driveCar(world, car, dt, steer, throttle, handbrake) {
  const maxF = car.kind === 'police' ? 485 : car.sports ? 505 : 425;
  if (throttle > 0) car.speed += 300 * dt;
  else if (throttle < 0) car.speed += (car.speed > 12 ? -540 : -170) * dt;
  car.speed -= car.speed * (handbrake ? 2.4 : 0.55) * dt;
  if (car.speed > maxF) car.speed = maxF;
  if (car.speed < -150) car.speed = -150;
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;

  const grip = Math.min(1, Math.abs(car.speed) / 130);
  const turn = 2.5 * grip * (handbrake ? 1.45 : 1) * (car.speed < 0 ? -1 : 1);
  car.angle += steer * turn * dt;

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  let impact = 0;
  for (const circle of carCircles(car)) {
    const before = { x: circle.x, y: circle.y };
    if (world.city.collideCircle(circle, circle.r)) {
      const moved = Math.hypot(circle.x - before.x, circle.y - before.y);
      if (moved > 1.5) {
        car.x += circle.x - before.x;
        car.y += circle.y - before.y;
        if (Math.abs(car.speed) > 130) impact = Math.max(impact, Math.abs(car.speed));
        car.speed *= 0.4;
      }
    }
  }
  car.x = Math.max(20, Math.min(world.city.width - 20, car.x));
  car.y = Math.max(20, Math.min(world.city.height - 20, car.y));
  if (world.city.isWater(car.x, car.y) && !car.sunk) {
    car.sunk = true;
    car.speed = 0;
    car.hp = 0;
  }
  return impact;
}

function angleTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function steerToward(car, target, sharpness = 2.4) {
  const diff = angleDiff(angleTo(car, target), car.angle);
  return Math.max(-1, Math.min(1, diff * sharpness));
}

/** The lane-corrected point of the intersection a traffic leg is heading to. */
function legWaypoint(city, leg) {
  let cx;
  let cy;
  if (leg.axis === 'h') {
    cx = city.vRoads[leg.next];
    cy = city.hRoads[leg.idx] + (leg.dir > 0 ? 15 : -15);
  } else {
    cx = city.vRoads[leg.idx] + (leg.dir > 0 ? -15 : 15);
    cy = city.hRoads[leg.next];
  }
  return { x: cx, y: cy };
}

/** Pick the leg after an intersection: straight on, or a turn that stays in the city. */
function advanceLeg(city, leg, rng) {
  const maxV = city.vRoads.length - 1;
  const maxH = city.hRoads.length - 1;
  const options = [];
  if (leg.axis === 'h') {
    if (leg.next + leg.dir >= 0 && leg.next + leg.dir <= maxV) options.push({ ...leg, next: leg.next + leg.dir });
    // Turn onto the vertical road we are crossing (its index is leg.next).
    if (leg.next > 0) options.push({ axis: 'v', idx: leg.next, dir: 1, next: 1 });
    if (leg.next < maxH) options.push({ axis: 'v', idx: leg.next, dir: -1, next: maxH - 1 });
    // Fix the turn legs' next: one step along the new direction from the crossing row.
    return fixTurn(options, leg, rng, maxH);
  }
  if (leg.next + leg.dir >= 0 && leg.next + leg.dir <= maxH) options.push({ ...leg, next: leg.next + leg.dir });
  if (leg.next > 0) options.push({ axis: 'h', idx: leg.next, dir: 1, next: 1 });
  if (leg.next < maxV) options.push({ axis: 'h', idx: leg.next, dir: -1, next: maxV - 1 });
  return fixTurn(options, leg, rng, maxV);
}

function fixTurn(options, leg, rng, maxOther) {
  // A turn leg starts at the crossing: its `next` must be the adjacent crossing
  // along the new direction, counted from the road we are leaving.
  const crossing = leg.axis === 'h' ? leg.idx : leg.idx;
  for (const opt of options) {
    if (opt.axis !== leg.axis) {
      const from = leg.axis === 'h' ? leg.idx : leg.idx;
      opt.next = from + opt.dir;
      if (opt.next < 0 || opt.next > maxOther) opt.dead = true;
    }
  }
  const live = options.filter((o) => !o.dead);
  if (!live.length) return { ...leg, dir: -leg.dir, next: leg.next - leg.dir * 2 };
  return live[rng.int(0, live.length - 1)];
}

/** Something solid ahead of a car? Returns the gap in pixels, or Infinity. */
function obstacleAhead(world, car, self) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let gap = Infinity;
  const test = (ox, oy, r) => {
    const dx = ox - car.x;
    const dy = oy - car.y;
    const forward = dx * fx + dy * fy;
    const lateral = -dx * fy + dy * fx;
    if (forward > 4 && forward < 74 && Math.abs(lateral) < 17 + r * 0.4) gap = Math.min(gap, forward);
  };
  for (const other of world.cars) {
    if (other === self || other.exploded) continue;
    test(other.x, other.y, 20);
  }
  if (world.player.inCar !== self) test(world.player.x, world.player.y, 12);
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    test(ped.x, ped.y, 8);
  }
  return gap;
}

export function updateTrafficCar(world, car, dt) {
  if (car.disabled || car.sunk) return;
  const rng = world.rng;
  if (car.panic > 0) {
    car.panic -= dt;
    const from = car.panicFrom || world.player;
    const away = { x: car.x + (car.x - from.x), y: car.y + (car.y - from.y) };
    driveCar(world, car, dt, steerToward(car, away, 1.6), 1, false);
    return;
  }
  if (!car.leg) return;
  const wp = legWaypoint(world.city, car.leg);
  if (Math.hypot(wp.x - car.x, wp.y - car.y) < 40) {
    car.leg = advanceLeg(world.city, car.leg, rng);
  }
  const gap = obstacleAhead(world, car, car);
  let throttle = 0;
  const desired = gap < 30 ? 0 : gap < 62 ? car.cruise * 0.4 : car.cruise;
  if (car.speed < desired) throttle = 1;
  else if (car.speed > desired + 26) throttle = -1;
  driveCar(world, car, dt, steerToward(car, wp), throttle, false);
}

export function updatePoliceCar(world, car, dt) {
  if (car.disabled || car.sunk) {
    car.speed = 0;
    return;
  }
  const player = world.player;
  const lead = player.inCar
    ? { x: player.x + Math.cos(player.inCar.angle) * player.inCar.speed * 0.32, y: player.y + Math.sin(player.inCar.angle) * player.inCar.speed * 0.32 }
    : { x: player.x, y: player.y };
  const dist = Math.hypot(player.x - car.x, player.y - car.y);

  if (car.reverseTime > 0) {
    car.reverseTime -= dt;
    driveCar(world, car, dt, -steerToward(car, lead), -1, false);
    return;
  }
  if (Math.abs(car.speed) < 14 && dist > 90) {
    car.stuckTime += dt;
    if (car.stuckTime > 2.2) {
      car.stuckTime = 0;
      car.reverseTime = 0.7;
    }
  } else car.stuckTime = 0;

  let throttle = 0;
  const desired = dist > 130 ? 485 : dist > 55 ? 240 : 30;
  if (car.speed < desired) throttle = 1;
  else if (car.speed > desired + 30) throttle = -1;
  driveCar(world, car, dt, steerToward(car, lead, 3), throttle, false);
}

// --- Pedestrians ---------------------------------------------------------------

const PED_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#e67e22', '#ecf0f1', '#fd79a8', '#00cec9', '#fdcb6e', '#a29bfe'];

export function createPed(x, y, rng, opts = {}) {
  return {
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    walkSpeed: rng.range(52, 78),
    color: opts.color || PED_COLORS[rng.int(0, PED_COLORS.length - 1)],
    state: opts.state || 'walk', // walk | flee | down | stand
    target: null,
    fleeFrom: null,
    timer: rng.range(0, 2),
    hp: 30,
    contact: !!opts.contact,
    name: opts.name || null,
    phase: rng.range(0, Math.PI * 2),
  };
}

export function updatePed(world, ped, dt) {
  if (ped.state === 'down') {
    ped.timer -= dt;
    return;
  }
  if (ped.state === 'stand') return;
  let targetSpeed = ped.walkSpeed;
  if (ped.state === 'flee') {
    ped.timer -= dt;
    if (ped.timer <= 0) ped.state = 'walk';
    const from = ped.fleeFrom || world.player;
    const away = Math.atan2(ped.y - from.y, ped.x - from.x);
    ped.angle = away;
    targetSpeed = 158;
  } else {
    if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 9) {
      ped.target = world.city.randomSidewalkPoint(world.rng);
    }
    ped.angle = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
  }
  ped.speed = targetSpeed;
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  const pos = { x: ped.x, y: ped.y };
  world.city.collideCircle(pos, 9);
  ped.x = pos.x;
  ped.y = pos.y;
  if (world.city.isWater(ped.x, ped.y)) {
    // Pedestrians keep to the promenade: step back to the shore.
    ped.y = world.city.piers.length ? Math.min(ped.y, 2392 - 12) : ped.y;
    ped.state = 'walk';
    ped.target = null;
  }
}

/** Scare every pedestrian near a point (gunfire, explosions, a car mounting the pavement). */
export function scarePeds(world, x, y, radius) {
  for (const ped of world.peds) {
    if (ped.state === 'down' || ped.state === 'stand') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < radius) {
      ped.state = 'flee';
      ped.fleeFrom = { x, y };
      ped.timer = 2.6;
    }
  }
}

// --- Spawning ---------------------------------------------------------------------

function randomLeg(city, rng) {
  if (rng.chance(0.5)) {
    const idx = rng.int(0, city.hRoads.length - 1);
    const dir = rng.chance(0.5) ? 1 : -1;
    const next = dir > 0 ? rng.int(1, city.vRoads.length - 1) : rng.int(0, city.vRoads.length - 2);
    return { axis: 'h', idx, dir, next };
  }
  const idx = rng.int(0, city.vRoads.length - 1);
  const dir = rng.chance(0.5) ? 1 : -1;
  const next = dir > 0 ? rng.int(1, city.hRoads.length - 1) : rng.int(0, city.hRoads.length - 2);
  return { axis: 'v', idx, dir, next };
}

function legStartPoint(city, leg, rng) {
  // A point part-way along the leg, in its lane.
  if (leg.axis === 'h') {
    const fromX = city.vRoads[leg.next - leg.dir] ?? 0;
    const toX = city.vRoads[leg.next];
    return { x: fromX + (toX - fromX) * rng.range(0.25, 0.8), y: city.hRoads[leg.idx] + (leg.dir > 0 ? 15 : -15), angle: leg.dir > 0 ? 0 : Math.PI };
  }
  const fromY = city.hRoads[leg.next - leg.dir] ?? 0;
  const toY = city.hRoads[leg.next];
  return { x: city.vRoads[leg.idx] + (leg.dir > 0 ? -15 : 15), y: fromY + (toY - fromY) * rng.range(0.25, 0.8), angle: leg.dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
}

export function spawnTraffic(world, count = TRAFFIC_COUNT) {
  const { city, rng } = world;
  for (let i = 0; i < count; i += 1) {
    const leg = randomLeg(city, rng);
    const start = legStartPoint(city, leg, rng);
    if (Math.hypot(start.x - world.player.x, start.y - world.player.y) < 320) continue;
    const sports = rng.chance(0.14);
    world.cars.push(createCar(start.x, start.y, start.angle, {
      kind: 'traffic',
      leg,
      cruise: rng.range(125, 185),
      sports,
      color: sports ? SPORTS_COLORS[rng.int(0, SPORTS_COLORS.length - 1)] : CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)],
      name: sports ? 'Coral GT' : CAR_MODELS[rng.int(0, CAR_MODELS.length - 1)],
    }));
  }
}

export function spawnParked(world) {
  const { city, rng } = world;
  // Rows inside the parking lots.
  for (const lot of city.lots) {
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i += 1) {
      const x = lot.x + 34 + (i % 3) * 62;
      const y = lot.y + 40 + Math.floor(i / 3) * 74;
      if (x > lot.x + lot.w - 26 || y > lot.y + lot.h - 26) continue;
      const sports = rng.chance(0.12);
      world.cars.push(createCar(x, y, Math.PI / 2, {
        kind: 'parked', driver: false, sports,
        color: sports ? SPORTS_COLORS[rng.int(0, SPORTS_COLORS.length - 1)] : CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)],
        name: sports ? 'Coral GT' : CAR_MODELS[rng.int(0, CAR_MODELS.length - 1)],
      }));
    }
  }
  // Kerbside parking along a few streets.
  for (let i = 0; i < 10; i += 1) {
    const horizontal = rng.chance(0.5);
    if (horizontal) {
      const cy = city.hRoads[rng.int(1, city.hRoads.length - 2)];
      const x = rng.range(140, city.width - 140);
      const side = rng.chance(0.5) ? 1 : -1;
      world.cars.push(createCar(x, cy + side * 36, side > 0 ? 0 : Math.PI, {
        kind: 'parked', driver: false,
        color: CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)],
        name: CAR_MODELS[rng.int(0, CAR_MODELS.length - 1)],
      }));
    } else {
      const cx = city.vRoads[rng.int(1, city.vRoads.length - 2)];
      const y = rng.range(140, 2200);
      const side = rng.chance(0.5) ? 1 : -1;
      world.cars.push(createCar(cx + side * 36, y, side > 0 ? Math.PI / 2 : -Math.PI / 2, {
        kind: 'parked', driver: false,
        color: CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)],
        name: CAR_MODELS[rng.int(0, CAR_MODELS.length - 1)],
      }));
    }
  }
}

export function spawnPeds(world, count = PED_COUNT) {
  const { city, rng } = world;
  for (let i = 0; i < count; i += 1) {
    const p = city.randomSidewalkPoint(rng);
    world.peds.push(createPed(p.x, p.y, rng));
  }
}

export function spawnPoliceCar(world) {
  const { city, rng } = world;
  // Enter from a street a good way off, so the player hears the siren approach.
  for (let tries = 0; tries < 12; tries += 1) {
    const leg = randomLeg(city, rng);
    const start = legStartPoint(city, leg, rng);
    const d = Math.hypot(start.x - world.player.x, start.y - world.player.y);
    if (d > 520 && d < 980) {
      const car = createCar(start.x, start.y, start.angle, {
        kind: 'police', color: '#dfe6ee', name: 'Patrulla Sirena', cruise: 300,
      });
      world.cars.push(car);
      return car;
    }
  }
  const angle = rng.range(0, Math.PI * 2);
  const car = createCar(
    world.player.x + Math.cos(angle) * 640,
    Math.max(60, Math.min(2300, world.player.y + Math.sin(angle) * 640)),
    angle + Math.PI,
    { kind: 'police', color: '#dfe6ee', name: 'Patrulla Sirena', cruise: 300 },
  );
  world.cars.push(car);
  return car;
}

export { CAR_LENGTH, CAR_WIDTH };
