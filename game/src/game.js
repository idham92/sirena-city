// SIRENA CITY — the world simulation: the player on foot and behind the
// wheel, the wanted level and the police who answer it, gunfire, collisions,
// explosions, busts and hospital trips. Rendering and menus live elsewhere;
// this module is only the rules, stepped at a fixed 60 Hz.
import {
  BUST_DRAIN, BUST_FILL, BUST_RADIUS, CRIME, DECAY_PER_SECOND, GUN_COOLDOWN,
  GUN_DAMAGE, GUN_MAG, GUN_RANGE, GUN_RELOAD, HIDE_SECONDS, PLAYER_MAX_HP,
  PLAYER_RADIUS, RUN_SPEED, SAVE_KEY, SIGHT_RADIUS, WALK_SPEED, WITNESS_RADIUS,
} from './config.js';
import { createCity } from './city.js';
import { createAudio } from './audio.js';
import {
  carCircles, createCar, createPed, driveCar, scarePeds, spawnParked, spawnPeds,
  spawnPoliceCar, spawnTraffic, updatePed, updatePoliceCar, updateTrafficCar,
} from './entities.js';
import { ACTION_INTERACT, ACTION_MUTE, ACTION_RELOAD } from './input.js';
import { createMissions } from './missions.js';

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function createGame(random, rng, continueSave) {
  const city = createCity(random);
  const saved = continueSave ? loadSave() : null;
  const audio = createAudio();

  const world = {
    city,
    rng,
    audio,
    time: 0,
    cars: [],
    peds: [],
    particles: [],
    tracers: [],
    toasts: [],
    markedCar: null,
    camera: { x: city.pois.cafe.front.x, y: city.pois.cafe.front.y },
    view: { w: 1280, h: 720 },
    shake: 0,
    frozen: 0,
    justBusted: false,
    justWasted: false,
    saveTimer: 0,
    policeSpawnT: 0,
    stats: saved?.stats || { stolen: 0, busted: 0, wasted: 0 },
    player: {
      x: city.pois.cafe.front.x,
      y: city.pois.cafe.front.y,
      angle: -Math.PI / 2,
      vx: 0, vy: 0,
      hp: PLAYER_MAX_HP,
      cash: saved ? saved.cash : 150,
      inCar: null,
      mag: GUN_MAG,
      reloadT: 0,
      fireT: 0,
      hurtT: 0,
      walkPhase: 0,
    },
    wanted: { stars: 0, unseenTime: 99, bust: 0, seen: false },
    missions: null,

    toast(text, ttl = 3.5, delay = 0) {
      this.toasts.push({ text, ttl, t: -delay });
      if (this.toasts.length > 5) this.toasts.shift();
    },

    markDirty() {
      try {
        window.localStorage.setItem(SAVE_KEY, JSON.stringify({
          cash: this.player.cash,
          missionIndex: this.missions ? this.missions.nextIndex : 0,
          stats: this.stats,
        }));
      } catch {
        // Private windows: the save then lasts this visit only.
      }
    },

    /** A crime the city may have seen: stars rise only with a witness near. */
    crime(amount, x, y) {
      const wx = x ?? this.player.x;
      const wy = y ?? this.player.y;
      let witnessed = this.wanted.stars > 0.05;
      if (!witnessed) {
        for (const ped of this.peds) {
          if (ped.state !== 'down' && Math.hypot(ped.x - wx, ped.y - wy) < WITNESS_RADIUS) { witnessed = true; break; }
        }
      }
      if (!witnessed) {
        for (const car of this.cars) {
          if (car.kind === 'police' && !car.disabled && Math.hypot(car.x - wx, car.y - wy) < WITNESS_RADIUS) { witnessed = true; break; }
        }
      }
      if (witnessed) this.wanted.stars = Math.min(5, this.wanted.stars + amount);
      return witnessed;
    },

    /** Scripted heat (missions, alarms): the stars rise, witnesses or not. */
    addWanted(n) {
      this.wanted.stars = Math.min(5, this.wanted.stars + n);
    },

    spawnMarkedCar() {
      if (this.markedCar && !this.markedCar.exploded && !this.markedCar.sunk) return;
      const gym = this.city.pois.gym;
      const car = createCar(gym.door.x, gym.door.y - 30, Math.PI / 2, {
        kind: 'parked', driver: false, sports: true, color: '#ff2e63', name: 'Coral GT',
      });
      car.marked = true;
      this.cars.push(car);
      this.markedCar = car;
    },
  };

  world.missions = createMissions(saved ? saved.missionIndex : 0);

  // Marina Sol, the contact, waits outside her café in a pink jacket.
  const marina = createPed(city.pois.cafe.front.x + 26, city.pois.cafe.front.y + 6, rng, {
    state: 'stand', color: '#ff5da2', contact: true, name: 'Marina Sol',
  });
  world.peds.push(marina);
  world.contact = marina;

  spawnTraffic(world);
  spawnParked(world);
  spawnPeds(world);
  return world;
}

// --- Particles and tracers -------------------------------------------------------

function spawnParticles(world, x, y, opts) {
  const n = opts.n || 6;
  for (let i = 0; i < n; i += 1) {
    if (world.particles.length > 320) return;
    const a = world.rng.range(0, Math.PI * 2);
    const sp = world.rng.range(opts.spMin ?? 12, opts.spMax ?? 60);
    world.particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (opts.rise || 0),
      t: 0, ttl: world.rng.range(opts.ttlMin ?? 0.3, opts.ttlMax ?? 0.7),
      color: opts.color, size: world.rng.range(1.5, opts.size ?? 3.5),
    });
  }
}

function updateEffects(world, dt) {
  for (let i = world.particles.length - 1; i >= 0; i -= 1) {
    const p = world.particles[i];
    p.t += dt;
    if (p.t >= p.ttl) {
      world.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
  }
  for (let i = world.tracers.length - 1; i >= 0; i -= 1) {
    world.tracers[i].t -= dt;
    if (world.tracers[i].t <= 0) world.tracers.splice(i, 1);
  }
  for (let i = world.toasts.length - 1; i >= 0; i -= 1) {
    const toast = world.toasts[i];
    toast.t += dt;
    if (toast.t > toast.ttl) world.toasts.splice(i, 1);
  }
}

// --- The player --------------------------------------------------------------------

function nearestCar(world, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of world.cars) {
    if (car.exploded || car.sunk) continue;
    const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function interact(world) {
  const player = world.player;
  if (player.inCar) {
    const car = player.inCar;
    player.inCar = null;
    car.driver = false;
    if (car.kind === 'traffic') car.kind = 'parked';
    const side = car.angle + Math.PI / 2;
    player.x = car.x + Math.cos(side) * 30;
    player.y = car.y + Math.sin(side) * 30;
    const pos = { x: player.x, y: player.y };
    world.city.collideCircle(pos, PLAYER_RADIUS);
    player.x = pos.x;
    player.y = pos.y;
    world.audio.door();
    return;
  }
  // Marina first: her marker is where missions begin.
  const contactDist = Math.hypot(world.contact.x - player.x, world.contact.y - player.y);
  const car = nearestCar(world, 54);
  if (contactDist < 56 && (!car || contactDist < 44)) {
    if (world.missions.tryStart(world)) return;
    world.toast(world.missions.active ? 'Marina: «Termina lo que empezaste.»' : 'Marina: «Vuelve cuando quieras trabajo.»', 2.6);
    return;
  }
  if (!car) return;
  // Climb in. A driver gets yanked out and runs.
  if (car.driver && car.kind === 'traffic') {
    const driver = createPed(car.x + 20, car.y + 14, world.rng, {});
    driver.state = 'flee';
    driver.fleeFrom = { x: player.x, y: player.y };
    driver.timer = 3;
    world.peds.push(driver);
    car.driver = false;
  }
  const wasOwned = car.owned;
  player.inCar = car;
  car.driver = true;
  if (car.kind === 'parked') car.kind = 'traffic';
  car.leg = null;
  world.audio.door();
  if (!wasOwned) {
    car.owned = true;
    world.stats.stolen += 1;
    if (world.crime(car.kind === 'police' ? 1.5 : CRIME.stealCar, car.x, car.y)) {
      world.toast('¡Robo de coche! La policía está en camino.', 3);
    }
    world.markDirty();
  }
}

function updatePlayerOnFoot(world, dt, input, actions) {
  const player = world.player;
  const axis = input.moveAxis();
  const speed = input.running() ? RUN_SPEED : WALK_SPEED;
  let mx = axis.x;
  let my = axis.y;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
    player.angle = Math.atan2(my, mx);
  }
  const nx = player.x + mx * speed * dt;
  const ny = player.y + my * speed * dt;
  if (!world.city.isWater(nx, player.y)) player.x = nx;
  if (!world.city.isWater(player.x, ny)) player.y = ny;
  const pos = { x: player.x, y: player.y };
  world.city.collideCircle(pos, PLAYER_RADIUS);
  player.x = pos.x;
  player.y = pos.y;
  player.vx = mx * speed * (len > 0 ? 1 : 0);
  player.vy = my * speed * (len > 0 ? 1 : 0);
  player.walkPhase += Math.hypot(player.vx, player.vy) * dt * 0.09;

  // Aim at the mouse while it is held; shots come from combat below.
  world.aiming = input.mouse.down;
  const mouseWorld = {
    x: world.camera.x + (input.mouse.x - world.view.w / 2),
    y: world.camera.y + (input.mouse.y - world.view.h / 2),
  };
  if (input.mouse.down) player.angle = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);

  if (actions & ACTION_INTERACT) interact(world);
  if (player.inCar) return; // just climbed in: driving takes over next step

  if (player.reloadT > 0) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) player.mag = GUN_MAG;
  }
  if ((actions & ACTION_RELOAD) && player.mag < GUN_MAG && player.reloadT <= 0) {
    player.reloadT = GUN_RELOAD;
    world.audio.reload();
  }
  if (player.fireT > 0) player.fireT -= dt;
  if (input.mouse.down) shoot(world, mouseWorld);
}

function shoot(world, target) {
  const player = world.player;
  if (player.fireT > 0 || player.reloadT > 0) return;
  if (player.mag <= 0) {
    player.fireT = GUN_COOLDOWN * 2;
    world.audio.dryFire();
    player.reloadT = GUN_RELOAD;
    world.audio.reload();
    return;
  }
  player.fireT = GUN_COOLDOWN;
  player.mag -= 1;
  world.audio.shot();
  world.shake = Math.min(6, world.shake + 1.2);
  const angle = Math.atan2(target.y - player.y, target.x - player.x);
  player.angle = angle;
  scarePeds(world, player.x, player.y, 300);
  world.crime(CRIME.shotFired, player.x, player.y);

  // March the ray until it meets a building, a car or a person.
  let hx = player.x + Math.cos(angle) * GUN_RANGE;
  let hy = player.y + Math.sin(angle) * GUN_RANGE;
  let hitSomething = false;
  for (let d = 14; d < GUN_RANGE; d += 7) {
    const x = player.x + Math.cos(angle) * d;
    const y = player.y + Math.sin(angle) * d;
    let stop = false;
    for (const rect of world.city.colliders) {
      if (x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h) { stop = true; break; }
    }
    if (stop) {
      hx = x; hy = y; hitSomething = true;
      spawnParticles(world, x, y, { n: 3, color: '#cfd6dd', size: 2.4 });
      break;
    }
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - x, ped.y - y) < 11) {
        hx = ped.x; hy = ped.y; hitSomething = true; stop = true;
        damagePed(world, ped, GUN_DAMAGE, true);
        break;
      }
    }
    if (stop) break;
    for (const car of world.cars) {
      if (car.exploded || car.sunk) continue;
      for (const circle of carCircles(car)) {
        if (Math.hypot(circle.x - x, circle.y - y) < 17) {
          hx = x; hy = y; hitSomething = true; stop = true;
          damageCar(world, car, 13, true);
          spawnParticles(world, x, y, { n: 4, color: '#ffd23e', size: 2.6 });
          break;
        }
      }
      if (stop) break;
    }
    if (stop) break;
  }
  world.tracers.push({ x1: player.x + Math.cos(angle) * 16, y1: player.y + Math.sin(angle) * 16, x2: hx, y2: hy, t: 0.07 });
  if (player.mag === 0) {
    player.reloadT = GUN_RELOAD;
    world.audio.reload();
  }
  return hitSomething;
}

function damagePed(world, ped, amount, byPlayer) {
  if (ped.state === 'down') return;
  ped.hp -= amount;
  spawnParticles(world, ped.x, ped.y, { n: 5, color: '#a31621', size: 3 });
  if (ped.hp <= 0) {
    ped.state = 'down';
    ped.timer = 24;
    if (byPlayer) {
      world.crime(CRIME.shotPed, ped.x, ped.y);
      scarePeds(world, ped.x, ped.y, 380);
    }
  } else {
    ped.state = 'flee';
    ped.fleeFrom = { x: world.player.x, y: world.player.y };
    ped.timer = 3;
  }
}

function damageCar(world, car, amount, byPlayer) {
  if (car.exploded || car.sunk) return;
  car.hp -= amount;
  if (byPlayer) {
    car.damagedByPlayer = true;
    if (car.kind === 'traffic' && car.driver) {
      car.panic = 3.2;
      car.panicFrom = { x: world.player.x, y: world.player.y };
    }
    world.crime(CRIME.shotCar, car.x, car.y);
  }
  if (car.hp <= 22 && !car.disabled) {
    // Wrecked: it coasts to a stop wherever it is.
    if (car.hp <= 0) car.disabled = true;
  }
}

function explodeCar(world, car) {
  car.exploded = true;
  car.disabled = true;
  world.audio.crash(1);
  world.shake = Math.min(16, world.shake + 11);
  spawnParticles(world, car.x, car.y, { n: 30, color: '#ff8c42', size: 5, ttlMax: 0.9, spMax: 190 });
  spawnParticles(world, car.x, car.y, { n: 16, color: '#555c66', size: 6, ttlMax: 1.4, spMax: 60, rise: -26 });
  const R = 98;
  for (const other of world.cars) {
    if (other === car || other.exploded) continue;
    if (Math.hypot(other.x - car.x, other.y - car.y) < R) damageCar(world, other, 62, car.damagedByPlayer);
  }
  for (const ped of world.peds) {
    if (Math.hypot(ped.x - car.x, ped.y - car.y) < R && ped.state !== 'down') damagePed(world, ped, 80, car.damagedByPlayer);
  }
  const pd = Math.hypot(world.player.x - car.x, world.player.y - car.y);
  if (pd < R && world.player.inCar !== car) {
    world.player.hp -= 46 * (1 - pd / (R + 30));
    world.player.hurtT = 0.7;
  }
  if (car.damagedByPlayer) world.crime(CRIME.explosion, car.x, car.y);
  scarePeds(world, car.x, car.y, 420);
}

// --- Collisions between cars, and cars meeting people ------------------------------

function carCarCollisions(world, dt) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.exploded || a.sunk) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.exploded || b.sunk) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 46 || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const push = (46 - d) / 2;
      const aStatic = a.kind === 'parked' && !a.driver;
      const bStatic = b.kind === 'parked' && !b.driver;
      if (!aStatic) { a.x -= nx * push; a.y -= ny * push; }
      if (!bStatic) { b.x += nx * push; b.y += ny * push; }
      const relSpeed = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.2;
      if (relSpeed > 55) {
        const dmg = relSpeed * 0.075;
        damageCar(world, a, dmg, world.player.inCar === b);
        damageCar(world, b, dmg, world.player.inCar === a);
        if (world.player.inCar === a || world.player.inCar === b) {
          world.audio.crash(relSpeed / 480);
          world.shake = Math.min(12, world.shake + relSpeed * 0.012);
          if (relSpeed > 300) {
            world.player.hp -= (relSpeed - 300) * 0.03;
            world.player.hurtT = 0.6;
          }
          world.crime(CRIME.hitCar, world.player.x, world.player.y);
        }
      }
      const exchange = (a.speed - b.speed) * 0.4;
      if (!aStatic) a.speed -= exchange * 0.5;
      if (!bStatic) b.speed += exchange * 0.5;
    }
  }
}

function carHitsPeople(world, dt) {
  const player = world.player;
  for (const car of world.cars) {
    if (car.exploded || car.sunk || Math.abs(car.speed) < 26) continue;
    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);
    const testBody = (px, py) => {
      const lx = (px - car.x) * cos + (py - car.y) * sin;
      const ly = -(px - car.x) * sin + (py - car.y) * cos;
      return Math.abs(lx) < 27 && Math.abs(ly) < 16;
    };
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      if (testBody(ped.x, ped.y)) {
        const dmg = Math.abs(car.speed) * 0.24;
        const wasAlive = ped.hp > 0;
        damagePed(world, ped, dmg, world.player.inCar === car);
        if (world.player.inCar === car) {
          world.audio.thud();
          world.crime(CRIME.hitPed + (ped.hp <= 0 && wasAlive ? CRIME.killPed : 0), ped.x, ped.y);
          world.shake = Math.min(8, world.shake + 2);
        }
      }
    }
    // The player, on foot, in the road.
    if (!player.inCar && player.hurtT <= 0 && testBody(player.x, player.y)) {
      player.hp -= (Math.abs(car.speed) - 30) * 0.13;
      player.hurtT = 0.7;
      player.x += cos * Math.sign(car.speed) * 20;
      player.y += sin * Math.sign(car.speed) * 20;
      world.audio.thud();
      world.shake = Math.min(10, world.shake + 4);
    }
  }
}

// --- Wanted, police, busts ------------------------------------------------------------

function updateWanted(world, dt) {
  const wanted = world.wanted;
  const player = world.player;
  let seen = false;
  let nearestCop = Infinity;
  for (const car of world.cars) {
    if (car.kind !== 'police' || car.disabled || car.sunk) continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    nearestCop = Math.min(nearestCop, d);
    if (d < 150) seen = true;
    else if (d < SIGHT_RADIUS && world.city.lineOfSight(car.x, car.y, player.x, player.y)) seen = true;
  }
  wanted.seen = seen;
  if (seen) wanted.unseenTime = 0;
  else {
    wanted.unseenTime += dt;
    if (wanted.unseenTime > HIDE_SECONDS && wanted.stars > 0) {
      wanted.stars = Math.max(0, wanted.stars - DECAY_PER_SECOND * dt);
    }
  }

  // Police strength follows the stars.
  const stars = Math.ceil(wanted.stars - 0.001);
  const target = wanted.stars <= 0.02 ? 0 : Math.min(5, 1 + stars);
  let cops = 0;
  for (const car of world.cars) if (car.kind === 'police' && !car.disabled && !car.exploded) cops += 1;
  world.policeSpawnT -= dt;
  if (cops < target && world.policeSpawnT <= 0) {
    spawnPoliceCar(world);
    world.policeSpawnT = 1.4;
  }
  // When the heat dies, distant police give up and leave the world.
  if (target === 0) {
    for (let i = world.cars.length - 1; i >= 0; i -= 1) {
      const car = world.cars[i];
      if (car.kind === 'police' && Math.hypot(car.x - player.x, car.y - player.y) > 760) world.cars.splice(i, 1);
    }
  }

  // The bust meter: a cop close by while the player is slow or cornered.
  const playerSpeed = player.inCar ? Math.abs(player.inCar.speed) : Math.hypot(player.vx, player.vy);
  if (wanted.stars > 0.02 && nearestCop < BUST_RADIUS && playerSpeed < 55) {
    wanted.bust = Math.min(1, wanted.bust + BUST_FILL * dt);
  } else {
    wanted.bust = Math.max(0, wanted.bust - BUST_DRAIN * dt);
  }
  if (wanted.bust >= 1) doBusted(world);

  const closeness = nearestCop === Infinity ? 0 : Math.max(0, 1 - nearestCop / 620);
  world.audio.siren(closeness, world.time);
}

function respawnAt(world, poiName) {
  const player = world.player;
  if (player.inCar) {
    player.inCar.driver = false;
    if (player.inCar.kind === 'traffic') player.inCar.kind = 'parked';
    player.inCar = null;
  }
  const poi = world.city.pois[poiName];
  player.x = poi.front.x;
  player.y = poi.front.y;
  player.vx = 0;
  player.vy = 0;
  world.camera.x = player.x;
  world.camera.y = player.y;
}

function doBusted(world) {
  const player = world.player;
  const fine = Math.min(player.cash, Math.max(60, Math.round(player.cash * 0.15)));
  player.cash -= fine;
  world.stats.busted += 1;
  world.wanted.stars = 0;
  world.wanted.bust = 0;
  world.justBusted = true;
  world.frozen = 2.4;
  world.audio.sting();
  world.toast(`Detenido. Multa de $${fine}.`, 4);
  respawnAt(world, 'police');
  world.markDirty();
}

function doWasted(world) {
  const player = world.player;
  const cost = Math.min(player.cash, Math.max(40, Math.round(player.cash * 0.1)));
  player.cash -= cost;
  player.hp = PLAYER_MAX_HP;
  world.stats.wasted += 1;
  world.wanted.stars = 0;
  world.wanted.bust = 0;
  world.justWasted = true;
  world.frozen = 2.4;
  world.audio.sting();
  world.toast(`Hospital San Roque: $${cost} por las curas.`, 4);
  respawnAt(world, 'hospital');
  world.markDirty();
}

// --- The step ---------------------------------------------------------------------------

export function stepWorld(world, dt, input, actions) {
  world.time += dt;
  const player = world.player;
  if (player.hurtT > 0) player.hurtT -= dt;
  if (player.fireT > 0 && player.inCar) player.fireT -= dt;
  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 26);

  if (actions & ACTION_MUTE) {
    const muted = world.audio.toggleMute();
    world.toast(muted ? 'Sonido desactivado' : 'Sonido activado', 1.6);
  }

  world.missions.update(world, dt);

  if (world.frozen <= 0) {
    if (player.inCar) {
      const car = player.inCar;
      const impact = driveCar(world, car, dt, input.steer(), input.throttle(), input.handbrake());
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      player.vx = Math.cos(car.angle) * car.speed;
      player.vy = Math.sin(car.angle) * car.speed;
      if (actions & ACTION_INTERACT) interact(world);
      if (impact > 120) {
        damageCar(world, car, impact * 0.055, false);
        world.audio.crash(impact / 480);
        world.shake = Math.min(12, world.shake + impact * 0.014);
        if (impact > 320) {
          player.hp -= (impact - 320) * 0.035;
          player.hurtT = 0.6;
        }
      }
      if (car.sunk) {
        // Out of the water, wet and hurt, on the nearest shore.
        player.inCar = null;
        let y = car.y;
        while (world.city.isWater(car.x, y) && y > 0) y -= 8;
        player.x = car.x;
        player.y = y - 14;
        player.hp -= 14;
        world.audio.splash();
        world.toast('¡Al agua! Has salido nadando.', 3);
      }
      world.audio.engine(car.speed / 480);
    } else {
      updatePlayerOnFoot(world, dt, input, actions);
      world.audio.engine(null);
    }
  } else {
    world.frozen -= dt;
    world.audio.engine(null);
  }

  for (const car of world.cars) {
    if (car === player.inCar || car.exploded) continue;
    if (car.kind === 'police') updatePoliceCar(world, car, dt);
    else if (car.driver && car.kind === 'traffic') updateTrafficCar(world, car, dt);
    // Burning wrecks count down to their explosion.
    if (car.hp <= 0 && !car.sunk) {
      car.disabled = true;
      car.fire += dt;
      if (car.fire > 0.5) {
        spawnParticles(world, car.x, car.y - 6, { n: 1, color: world.rng.chance(0.5) ? '#ff8c42' : '#555c66', size: 4.5, ttlMax: 0.8, spMax: 22, rise: -30 });
      }
      if (car.fire > 1.15) explodeCar(world, car);
    }
  }
  for (const ped of world.peds) updatePed(world, ped, dt);

  carCarCollisions(world, dt);
  carHitsPeople(world, dt);
  updateWanted(world, dt);

  // Keep the city populated: replace wrecks and fallen pedestrians, far away.
  for (let i = world.peds.length - 1; i >= 0; i -= 1) {
    const ped = world.peds[i];
    if (ped.state === 'down' && ped.timer <= 0 && !ped.contact) {
      world.peds.splice(i, 1);
      const p = world.city.randomSidewalkPoint(world.rng);
      if (Math.hypot(p.x - player.x, p.y - player.y) > 500) {
        world.peds.push(createPed(p.x, p.y, world.rng));
      } else {
        ped.state = 'walk';
        ped.hp = 30;
        ped.x = p.x;
        ped.y = p.y;
        ped.target = null;
        world.peds.push(ped);
      }
    }
  }
  let trafficAlive = 0;
  for (const car of world.cars) if (car.kind === 'traffic' && car.driver && !car.disabled) trafficAlive += 1;
  if (trafficAlive < 9 && world.rng.chance(0.02)) spawnTraffic(world, 1);

  updateEffects(world, dt);

  // Camera: follow the player with a little lookahead in a car.
  const lead = player.inCar ? 0.34 : 0.12;
  const tx = player.x + player.vx * lead;
  const ty = player.y + player.vy * lead;
  world.camera.x += (tx - world.camera.x) * Math.min(1, dt * 5.5);
  world.camera.y += (ty - world.camera.y) * Math.min(1, dt * 5.5);
  const hw = world.view.w / 2;
  const hh = world.view.h / 2;
  world.camera.x = Math.max(hw, Math.min(world.city.width - hw, world.camera.x));
  world.camera.y = Math.max(hh, Math.min(world.city.height - hh, world.camera.y));

  if (player.hp <= 0 && world.frozen <= 0) doWasted(world);
}

/** Ambient step for menu backdrops: traffic and people live, nobody plays. */
export function stepAmbient(world, dt) {
  world.time += dt;
  for (const car of world.cars) {
    if (car.driver && car.kind === 'traffic') updateTrafficCar(world, car, dt);
  }
  for (const ped of world.peds) updatePed(world, ped, dt);
  updateEffects(world, dt);
  // A slow pan across the downtown blocks.
  world.camera.x = world.city.width * 0.5 + Math.sin(world.time * 0.05) * 620;
  world.camera.y = world.city.height * 0.42 + Math.cos(world.time * 0.037) * 380;
}
