// game.js — the state and rules of Sirena City.
// Owns the player, traffic, police pressure, the heat behind the wanted
// stars, combat, explosions, the camera, and the save. Rendering lives in
// render.js and sound in audio.js; this file only decides what happens.

import {
  buildCity, groundAt, lineBlocked, roadCenterV, roadCenterH,
  LAND_H, WORLD_W, WORLD_H, COLS, ROWS,
} from './city.js';
import { Rng } from './rng.js';
import {
  CAR_MODELS, MODEL, makeCar, makePed, stepCar, stepWalker, collideCars, carSpeed,
} from './entities.js';
import { initTraffic, updateTraffic, updatePolice, updatePed } from './ai.js';
import { Missions } from './missions.js';

const SAVE_KEY = 'sirena-city-save-v1';
const STAR_HEAT = 100; // heat per wanted star; heat caps at five stars

export class Game {
  constructor(seed, audio) {
    this.audio = audio;
    this.seed = seed;
    this.rng = new Rng(seed * 7919 + 13);
    this.city = buildCity(seed);
    this.missions = new Missions(this);
    this.mode = 'title'; // title | play | pause | over
    this.overKind = null; // 'busted' | 'wasted'
    this.overT = 0;
    this.time = 0;
    this.resetWorld();
  }

  resetWorld() {
    const rng = this.rng;
    this.cars = [];
    this.peds = [];
    this.particles = [];
    this.tracers = [];
    this.toasts = [];
    this.missionCar = null;
    this.heat = 0;
    this.sightT = 99; // seconds since a witness last saw the player
    this.bustMeter = 0;
    this.threat = { x: 0, y: 0, t: 0 };
    this.shake = 0;
    this.policeTimer = 0;
    this.prompt = null;
    this.cash = 80;
    this.stats = { stolen: 0, shots: 0, hits: 0, busts: 0, wasted: 0, earned: 0 };
    this.ammo = 12;
    this.reloadT = 0;
    this.fireT = 0;
    this.hurtT = 0;

    const spawn = this.city.zones.spawn;
    this.player = {
      x: spawn.x, y: spawn.y, vx: 0, vy: 0,
      angle: -Math.PI / 2, radius: 10, hp: 100,
      car: null, hasPackage: false, hasPassenger: false, walkPhase: 0,
    };
    this.camera = { x: spawn.x, y: spawn.y };

    this.spawnTraffic(26);
    this.spawnParked();
    this.spawnPeds(34);
  }

  // ---------- spawning ----------

  laneSnap(car) {
    if (car.ai.dx === 0) {
      const i = this.rng.int(0, COLS);
      car.x = roadCenterV(i) + (car.ai.dy > 0 ? -32 : 32);
      car.y = this.rng.range(80, LAND_H - 80);
    } else {
      const j = this.rng.int(0, ROWS);
      car.y = roadCenterH(j) + (car.ai.dx > 0 ? 32 : -32);
      car.x = this.rng.range(80, WORLD_W - 80);
    }
  }

  farFromOthers(x, y, min) {
    for (const c of this.cars) {
      if (Math.hypot(c.x - x, c.y - y) < min) return false;
    }
    return Math.hypot(this.player.x - x, this.player.y - y) > 190;
  }

  spawnTraffic(count) {
    for (let n = 0; n < count; n++) {
      for (let tries = 0; tries < 8; tries++) {
        const model = this.rng.pick([MODEL.PICO, MODEL.PICO, MODEL.VEGA, MODEL.VEGA, MODEL.TAXI, MODEL.BURRO, MODEL.CARGO]);
        const car = makeCar(0, 0, 0, model, this.rng.pick(CAR_MODELS[model].colors));
        initTraffic(car, this.rng);
        this.laneSnap(car);
        if (!this.farFromOthers(car.x, car.y, 84)) continue;
        car.driver = 'ai';
        this.cars.push(car);
        break;
      }
    }
  }

  spawnParked() {
    for (const lot of this.city.lots) {
      const count = this.rng.int(3, 6);
      for (let n = 0; n < count; n++) {
        const model = this.rng.pick([MODEL.PICO, MODEL.VEGA, MODEL.BURRO, MODEL.CARGO]);
        const x = lot.x + 40 + (n % 3) * 120 + this.rng.range(-8, 8);
        const y = lot.y + 60 + Math.floor(n / 3) * 150;
        const car = makeCar(x, y, Math.PI / 2, model, this.rng.pick(CAR_MODELS[model].colors));
        this.cars.push(car);
      }
    }
    // A Coral GT idles by the marina even before Marisol asks for it.
    const gt = makeCar(this.city.zones.contact.x - 260, LAND_H - 150, 0, MODEL.CORAL, '#ff6f61');
    this.cars.push(gt);
  }

  spawnPeds(count) {
    for (let n = 0; n < count; n++) {
      for (let tries = 0; tries < 10; tries++) {
        const x = this.rng.range(40, WORLD_W - 40);
        const y = this.rng.range(40, WORLD_H - 40);
        const g = groundAt(this.city, x, y);
        if (g !== 'sidewalk' && g !== 'grass' && g !== 'pier') continue;
        this.peds.push(makePed(x, y, this.rng));
        break;
      }
    }
  }

  spawnPolice() {
    for (let tries = 0; tries < 10; tries++) {
      const ang = this.rng.range(0, Math.PI * 2);
      const dist = this.rng.range(680, 940);
      let x = this.player.x + Math.cos(ang) * dist;
      let y = this.player.y + Math.sin(ang) * dist;
      const i = Math.max(0, Math.min(COLS, Math.round((x - 64) / 576)));
      const j = Math.max(0, Math.min(ROWS, Math.round((y - 64) / 576)));
      if (this.rng.chance(0.5)) x = roadCenterV(i);
      else y = roadCenterH(j);
      if (groundAt(this.city, x, y) === 'water') continue;
      if (Math.hypot(x - this.player.x, y - this.player.y) < 560) continue;
      const car = makeCar(x, y, Math.atan2(this.player.y - y, this.player.x - x), MODEL.POLICE, '#20303e');
      car.driver = 'police';
      car.ai = { dx: 0, dy: 0, stuckT: 0, reverseT: 0 };
      this.cars.push(car);
      return true;
    }
    return false;
  }

  spawnMissionCar() {
    const lot = this.city.lots.length ? this.rng.pick(this.city.lots) : null;
    const x = lot ? lot.x + lot.w / 2 : this.city.zones.contact.x - 260;
    const y = lot ? lot.y + lot.h / 2 : LAND_H - 150;
    const car = makeCar(x, y, 0, MODEL.CORAL, '#ff6f61');
    car.isMissionTarget = true;
    this.cars.push(car);
    this.missionCar = car;
  }

  deliverMissionCar() {
    const car = this.missionCar;
    if (car) {
      this.cars = this.cars.filter((c) => c !== car);
      if (this.player.car === car) this.player.car = null;
    }
    this.missionCar = null;
  }

  // ---------- heat and witnesses ----------

  get wanted() {
    return this.heat <= 0 ? 0 : Math.min(5, Math.ceil(this.heat / STAR_HEAT));
  }

  witnessed(x, y, radius = 330) {
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - x, ped.y - y) < radius && !lineBlocked(this.city, x, y, ped.x, ped.y)) return true;
    }
    for (const car of this.cars) {
      if (car.driver === 'police' && Math.hypot(car.x - x, car.y - y) < radius + 90) return true;
    }
    return false;
  }

  addHeat(amount, x, y, forced = false) {
    if (forced || this.witnessed(x, y)) {
      this.heat = Math.min(STAR_HEAT * 5, this.heat + amount);
      this.sightT = 0;
    }
  }

  carTopSpeed(car) {
    return CAR_MODELS[car.model].top * (car.hp < 30 ? 0.55 : 1);
  }

  // ---------- events from AI and physics ----------

  onAiCrash(car, impact) {
    if (Math.hypot(car.x - this.camera.x, car.y - this.camera.y) < 700) {
      this.audio.crash(Math.min(1, impact / 260));
    }
    car.hp -= impact * 0.12;
  }

  onHonk(car) {
    if (Math.hypot(car.x - this.camera.x, car.y - this.camera.y) < 520) {
      this.audio.honk();
    }
  }

  toast(text) {
    this.toasts.push({ text, t: 3.2 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  burst(x, y, opts) {
    const { count, color, speed, life, size, grav = 0 } = opts;
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const s = this.rng.range(speed * 0.3, speed);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: this.rng.range(life * 0.5, life),
        maxLife: life,
        size: this.rng.range(size * 0.6, size * 1.3),
        color, grav,
      });
    }
  }

  // ---------- missions ----------

  onMissionStart(def) {
    this.toast(`Misión: ${def.title}`);
    this.audio.jingle();
  }

  onMissionStep() {
    this.audio.pickup();
  }

  onMissionComplete(def) {
    this.cash += def.reward;
    this.stats.earned += def.reward;
    this.toast(`¡Misión cumplida! +$${def.reward}`);
    this.audio.jingle();
    this.save();
  }

  // ---------- save ----------

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash,
        stats: this.stats,
        missions: this.missions.serialize(),
      }));
    } catch { /* storage unavailable: play on without it */ }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  hasSave() {
    return this.loadSave() !== null;
  }

  newGame() {
    this.missions = new Missions(this);
    this.resetWorld();
    this.mode = 'play';
    this.audio.setMusic(true);
  }

  continueGame() {
    const data = this.loadSave();
    this.missions = new Missions(this);
    this.resetWorld();
    if (data) {
      this.cash = data.cash ?? this.cash;
      this.stats = { ...this.stats, ...(data.stats ?? {}) };
      this.missions.restore(data.missions);
    }
    this.mode = 'play';
    this.audio.setMusic(true);
  }

  // ---------- the update ----------

  update(dt, input, view) {
    if (this.mode !== 'play') return;
    this.time += dt;
    const p = this.player;

    if (this.threat.t > 0) this.threat.t -= dt;
    this.fireT -= dt;
    this.hurtT -= dt;
    if (this.hurtT <= 0 && p.hp > 0 && p.hp < 100) p.hp = Math.min(100, p.hp + 2.2 * dt);

    this.updatePlayer(dt, input, view);
    this.missions.update();

    for (const car of this.cars) {
      if (car.driver === 'ai') updateTraffic(car, dt, this);
      else if (car.driver === 'police') updatePolice(car, dt, this);
      this.updateCarDamage(car, dt);
    }
    for (const impact of collideCars(this.cars)) this.onCarImpact(impact);
    for (const ped of this.peds) updatePed(ped, dt, this);
    this.updatePedHits(dt);
    this.updatePolicePressure(dt);
    this.updateHeat(dt);
    this.updateBust(dt);
    this.updateFx(dt);

    // Camera: follow with a velocity lead, clamped to the world.
    const focus = p.car ?? p;
    const lead = 0.32;
    const tx = focus.x + (focus.vx || 0) * lead;
    const ty = focus.y + (focus.vy || 0) * lead;
    const k = Math.min(1, 5.2 * dt);
    this.camera.x += (tx - this.camera.x) * k;
    this.camera.y += (ty - this.camera.y) * k;
    this.camera.x = Math.max(view.w / 2 - 80, Math.min(WORLD_W - view.w / 2 + 80, this.camera.x));
    this.camera.y = Math.max(view.h / 2 - 80, Math.min(WORLD_H - view.h / 2 + 80, this.camera.y));
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 26);

    const anyPoliceNear = this.cars.some(
      (c) => c.driver === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 950,
    );
    this.audio.setSiren(anyPoliceNear && this.wanted > 0);
    this.audio.updateMusic(dt, this.wanted / 5);
  }

  // Title-screen life: traffic and pedestrians keep moving behind the
  // menu, but no player, police or missions are involved.
  updateAmbient(dt) {
    this.time += dt;
    for (const car of this.cars) {
      if (car.driver === 'ai') updateTraffic(car, dt, this);
    }
    for (const ped of this.peds) updatePed(ped, dt, this);
    this.updateFx(dt);
    // A slow harbour pan for the menu backdrop.
    this.camera.x = WORLD_W / 2 + Math.sin(this.time * 0.05) * 620;
    this.camera.y = LAND_H - 420 + Math.cos(this.time * 0.037) * 160;
  }

  updatePlayer(dt, input, view) {
    const p = this.player;
    if (p.car) {
      const car = p.car;
      const control = {
        throttle: (input.down('KeyW', 'ArrowUp') ? 1 : 0) + (input.down('KeyS', 'ArrowDown') ? -1 : 0),
        steer: (input.down('KeyA', 'ArrowLeft') ? -1 : 0) + (input.down('KeyD', 'ArrowRight') ? 1 : 0),
        brake: input.down('Space'),
      };
      const impact = stepCar(car, dt, this.city, control);
      if (impact > 60) {
        this.audio.crash(Math.min(1, impact / 240));
        car.hp -= impact * 0.11;
        this.shake = Math.min(9, impact / 22);
        if (impact > 120) this.addHeat(14, car.x, car.y);
      }
      p.x = car.x;
      p.y = car.y;
      p.vx = car.vx;
      p.vy = car.vy;
      p.angle = car.angle;
      const ratio = Math.min(1, carSpeed(car) / CAR_MODELS[car.model].top);
      this.audio.setEngine(ratio, Math.abs(control.throttle));
      if (input.hit('KeyE')) this.exitCar();
      this.prompt = 'E — Salir del coche';
      return;
    }

    // On foot.
    let mx = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    let my = (input.down('KeyS', 'ArrowDown') ? 1 : 0) - (input.down('KeyW', 'ArrowUp') ? 1 : 0);
    const running = input.down('ShiftLeft', 'ShiftRight');
    const mag = Math.hypot(mx, my);
    if (mag > 0) {
      mx /= mag;
      my /= mag;
      const speed = running ? 172 : 102;
      p.vx = mx * speed;
      p.vy = my * speed;
      p.walkPhase += dt * (running ? 11 : 8);
    } else {
      p.vx = 0;
      p.vy = 0;
    }
    stepWalker(p, dt, this.city, p.radius);

    // Aim at the mouse; face movement only while not aiming.
    const aim = Math.atan2(view.mouseWorld.y - p.y, view.mouseWorld.x - p.x);
    if (input.mouseDown || mag === 0) p.angle = aim;
    else if (mag > 0) p.angle = Math.atan2(my, mx);

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.ammo = 12;
    }
    if (input.hit('KeyR') && this.ammo < 12 && this.reloadT <= 0) this.reloadT = 1.1;
    if (input.mouseDown && this.fireT <= 0 && this.reloadT <= 0) {
      if (this.ammo <= 0) {
        this.reloadT = 1.1;
        this.fireT = 0.3;
      } else {
        this.shoot(aim);
      }
    }

    // Context interaction: a car door first, then Marisol.
    const nearCar = this.nearestEnterableCar();
    const contact = this.city.zones.contact;
    const nearContact = Math.hypot(p.x - contact.x, p.y - contact.y) < contact.r + 20;
    if (nearCar) {
      this.prompt = nearCar.driver === 'ai' ? 'E — Robar el coche' : 'E — Subir al coche';
      if (input.hit('KeyE')) this.enterCar(nearCar);
    } else if (nearContact && !this.missions.active) {
      const offer = this.missions.nextOffer();
      this.prompt = offer ? `E — Hablar con Marisol: ${offer.title}` : 'E — Pedir un encargo';
      if (input.hit('KeyE')) this.missions.startNext();
    } else if (nearContact && this.missions.active) {
      this.prompt = 'Marisol: «Termina el encargo y vuelve.»';
    } else {
      this.prompt = null;
    }
  }

  nearestEnterableCar() {
    const p = this.player;
    let best = null;
    let bestD = 46;
    for (const car of this.cars) {
      if (car.wrecked) continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  enterCar(car) {
    const p = this.player;
    if (car.driver === 'ai') {
      // Yank the driver out: they land on the street as a very upset pedestrian.
      const ped = makePed(car.x + 26, car.y + 10, this.rng);
      ped.state = 'flee';
      ped.fleeT = 2.4;
      this.peds.push(ped);
      this.threat = { x: car.x, y: car.y, t: 1.2 };
      this.addHeat(65, car.x, car.y);
      this.toast('¡Coche robado!');
    } else if (car.driver === 'none') {
      this.addHeat(38, car.x, car.y);
    } else if (car.driver === 'police') {
      this.addHeat(120, car.x, car.y, true);
    }
    car.driver = 'player';
    car.ai = null;
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    this.stats.stolen++;
    this.audio.startEngine();
  }

  exitCar() {
    const p = this.player;
    const car = p.car;
    if (!car) return;
    car.driver = 'none';
    p.car = null;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
    p.vx = 0;
    p.vy = 0;
    this.audio.stopEngine();
    this.audio.setSiren(false);
  }

  shoot(angle) {
    const p = this.player;
    this.fireT = 0.17;
    this.ammo--;
    this.stats.shots++;
    this.audio.gunshot();
    this.threat = { x: p.x, y: p.y, t: 2.2 };
    const range = 560;
    let bestT = range;
    let hitThing = null;
    const rayHit = (o, r) => {
      const rx = o.x - p.x;
      const ry = o.y - p.y;
      const along = rx * Math.cos(angle) + ry * Math.sin(angle);
      if (along < 0 || along > bestT) return;
      const side = Math.abs(rx * -Math.sin(angle) + ry * Math.cos(angle));
      if (side < r) {
        bestT = along;
        hitThing = o;
      }
    };
    for (const car of this.cars) rayHit(car, car.radius + 4);
    for (const ped of this.peds) if (ped.state !== 'down') rayHit(ped, 11);
    const hx = p.x + Math.cos(angle) * bestT;
    const hy = p.y + Math.sin(angle) * bestT;
    this.tracers.push({ x1: p.x, y1: p.y, x2: hx, y2: hy, t: 0.07 });
    this.burst(p.x + Math.cos(angle) * 16, p.y + Math.sin(angle) * 16, {
      count: 3, color: '#ffd166', speed: 60, life: 0.12, size: 3,
    });
    if (hitThing) {
      this.stats.hits++;
      if (hitThing.kind === 'car') {
        hitThing.hp -= 9;
        this.burst(hx, hy, { count: 4, color: '#ffe08a', speed: 120, life: 0.25, size: 3 });
        this.addHeat(55, p.x, p.y);
      } else {
        hitThing.hp -= 34;
        if (hitThing.hp <= 0) {
          hitThing.state = 'down';
          hitThing.downT = 9999;
          this.addHeat(150, p.x, p.y);
        } else {
          hitThing.state = 'flee';
          hitThing.fleeT = 2.5;
          this.addHeat(110, p.x, p.y);
        }
      }
    } else {
      this.addHeat(45, p.x, p.y);
    }
  }

  onCarImpact({ a, b, force }) {
    a.hp -= force * 0.16;
    b.hp -= force * 0.16;
    const near = Math.hypot(a.x - this.camera.x, a.y - this.camera.y) < 720;
    if (near) this.audio.crash(Math.min(1, force / 230));
    const playerInvolved = this.player.car === a || this.player.car === b;
    if (playerInvolved) {
      this.shake = Math.min(10, force / 18);
      if (force > 95) this.addHeat(20, this.player.x, this.player.y);
      if ((a.driver === 'police' || b.driver === 'police') && force > 60) {
        this.addHeat(35, this.player.x, this.player.y, true);
      }
    }
  }

  updateCarDamage(car, dt) {
    if (car.hp <= 0 && !car.wrecked) {
      car.wrecked = true;
      if (car.driver === 'ai') {
        const ped = makePed(car.x + 24, car.y, this.rng);
        ped.state = 'flee';
        ped.fleeT = 3;
        this.peds.push(ped);
        car.driver = 'none';
      } else if (car.driver === 'player') {
        this.player.hp -= 12;
        this.hurtT = 4;
        this.exitCar();
        this.toast('¡El coche está acabado!');
      } else if (car.driver === 'police') {
        car.driver = 'none';
      }
      this.explode(car.x, car.y, car);
      return;
    }
    if (car.wrecked) return;
    if (car.hp < 30) {
      car.burning += dt;
      if (this.rng.chance(dt * 8)) {
        this.burst(car.x, car.y - 6, {
          count: 1, color: car.burning > 1.4 ? '#ff7b33' : '#555c66',
          speed: 26, life: 0.8, size: car.burning > 1.4 ? 6 : 8, grav: -30,
        });
      }
      if (car.burning > 2.4) car.hp = 0;
    }
  }

  explode(x, y, sourceCar) {
    this.burst(x, y, { count: 34, color: '#ff8c42', speed: 320, life: 0.7, size: 7 });
    this.burst(x, y, { count: 20, color: '#ffd166', speed: 200, life: 0.5, size: 5 });
    this.burst(x, y, { count: 14, color: '#3a3f47', speed: 90, life: 1.6, size: 11, grav: -24 });
    this.audio.crash(1);
    this.threat = { x, y, t: 3 };
    if (Math.hypot(x - this.camera.x, y - this.camera.y) < 500) this.shake = 12;
    for (const car of this.cars) {
      if (car === sourceCar) continue;
      const d = Math.hypot(car.x - x, car.y - y);
      if (d < 100) car.hp -= 58 * (1 - d / 130);
    }
    for (const ped of this.peds) {
      const d = Math.hypot(ped.x - x, ped.y - y);
      if (d < 84 && ped.state !== 'down') {
        ped.hp -= 45;
        ped.state = 'down';
        ped.downT = ped.hp > 0 ? 6 : 9999;
      }
    }
    const p = this.player;
    if (!p.car) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < 88) {
        p.hp -= 42;
        this.hurtT = 5;
      }
    }
    this.addHeat(70, x, y);
  }

  updatePedHits() {
    for (const car of this.cars) {
      const speed = carSpeed(car);
      if (speed < 40) continue;
      for (const ped of this.peds) {
        if (ped.state === 'down') continue;
        const d = Math.hypot(ped.x - car.x, ped.y - car.y);
        if (d > car.radius + 9) continue;
        if (speed > 130) {
          ped.hp -= 40;
          ped.state = 'down';
          ped.downT = ped.hp > 0 ? 7 : 9999;
          ped.vx = car.vx * 0.7;
          ped.vy = car.vy * 0.7;
          this.audio.crash(0.5);
          if (car.driver === 'player') {
            this.addHeat(120, car.x, car.y);
            this.shake = Math.min(8, this.shake + 3);
          }
        } else {
          // A nudge: the pedestrian stumbles aside, unharmed but furious.
          const away = Math.atan2(ped.y - car.y, ped.x - car.x);
          ped.x += Math.cos(away) * 14;
          ped.y += Math.sin(away) * 14;
          ped.state = 'flee';
          ped.fleeT = 1.2;
          this.threat = { x: ped.x, y: ped.y, t: 0.8 };
        }
      }
    }
  }

  updatePolicePressure(dt) {
    const want = this.wanted;
    const police = this.cars.filter((c) => c.driver === 'police');
    this.policeTimer -= dt;
    if (want > 0 && police.length < want + 1 && this.policeTimer <= 0) {
      if (this.spawnPolice()) this.policeTimer = 1.6;
      else this.policeTimer = 0.5;
    }
    if (want === 0) {
      // Heat is gone: units that are far away give up and leave the world.
      this.cars = this.cars.filter((c) => {
        if (c.driver !== 'police') return true;
        return Math.hypot(c.x - this.player.x, c.y - this.player.y) < 1250;
      });
    }
  }

  updateHeat(dt) {
    const p = this.player;
    let seen = false;
    for (const car of this.cars) {
      if (car.driver !== 'police') continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < 470 && !lineBlocked(this.city, car.x, car.y, p.x, p.y)) {
        seen = true;
        break;
      }
    }
    if (seen) this.sightT = 0;
    else this.sightT += dt;
    if (this.heat > 0 && this.sightT > 4.5) {
      this.heat = Math.max(0, this.heat - 7.5 * dt);
    }
    if (p.hp <= 0 && this.mode === 'play') this.onWasted();
  }

  updateBust(dt) {
    const p = this.player;
    if (this.wanted === 0) {
      this.bustMeter = Math.max(0, this.bustMeter - dt * 0.6);
      return;
    }
    const pSpeed = p.car ? carSpeed(p.car) : Math.hypot(p.vx, p.vy);
    let nearCop = false;
    for (const car of this.cars) {
      if (car.driver !== 'police') continue;
      if (Math.hypot(car.x - p.x, car.y - p.y) < 78) {
        nearCop = true;
        break;
      }
    }
    if (nearCop && pSpeed < 42) this.bustMeter += dt / 2.1;
    else this.bustMeter = Math.max(0, this.bustMeter - dt * 0.5);
    if (this.bustMeter >= 1) this.onBusted();
  }

  onBusted() {
    const fine = 50 + this.wanted * 45;
    this.cash = Math.max(0, this.cash - fine);
    this.stats.busts++;
    this.finishIncident('busted');
    this.toast(`Detenido. Multa de $${fine}`);
  }

  onWasted() {
    this.cash = Math.max(0, this.cash - 85);
    this.stats.wasted++;
    this.finishIncident('wasted');
    this.toast('Sales del hospital. Factura: $85');
  }

  finishIncident(kind) {
    this.mode = 'over';
    this.overKind = kind;
    this.overT = 0;
    this.heat = 0;
    this.bustMeter = 0;
    this.audio.sting();
    this.audio.stopEngine();
    this.audio.setSiren(false);
    if (this.player.car) {
      this.player.car.driver = 'none';
      this.player.car = null;
    }
    this.cars = this.cars.filter((c) => c.driver !== 'police');
    this.save();
  }

  respawn() {
    const spawn = this.city.zones.spawn;
    this.player.x = spawn.x;
    this.player.y = spawn.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.hp = 100;
    this.player.hasPackage = false;
    this.player.hasPassenger = false;
    this.mode = 'play';
  }

  updateFx(dt) {
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += (pt.grav || 0) * dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const tr of this.tracers) tr.t -= dt;
    this.tracers = this.tracers.filter((tr) => tr.t > 0);
    for (const toast of this.toasts) toast.t -= dt;
    this.toasts = this.toasts.filter((toast) => toast.t > 0);
  }
}
