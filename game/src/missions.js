// missions.js — Marisol Vega's story chain and the courier work after it.
// A mission is a list of steps; each step names a target the HUD can point
// at and a condition the manager checks every frame. The game owns the
// world effects (spawning the marked car, raising the heat, paying out);
// this file owns the sequence and the words.

export const CONTACT_NAME = 'Marisol Vega';

export const STORY_INTRO =
  'Sirena amanece con neón y sal. Marisol Vega mueve paquetes por el puerto ' +
  'y necesita un conductor que no haga preguntas. Tres trabajos y la ciudad es tuya.';

const STORY = [
  {
    id: 'paquete',
    title: 'Un paquete para el faro',
    brief: 'Recoge el paquete en el almacén del muelle y llévalo al farero. Sin abrirlo.',
    reward: 250,
    steps: [
      { type: 'pickup', zone: 'warehouse', label: 'Recoge el paquete en el Almacén del Muelle' },
      { type: 'deliver', zone: 'lighthouse', label: 'Entrega el paquete en el faro' },
    ],
  },
  {
    id: 'coral',
    title: 'El Coral GT',
    brief: 'Hay un Coral GT esperando en un aparcamiento. Es mío, digan lo que digan los papeles. Tráelo al Taller Rueda.',
    reward: 400,
    steps: [
      { type: 'steal', label: 'Roba el Coral GT marcado' },
      { type: 'deliverCar', zone: 'garage', label: 'Lleva el Coral GT al Taller Rueda' },
    ],
  },
  {
    id: 'salida',
    title: 'Salida limpia',
    brief: 'Recógeme en el paseo, pierde a la patrulla y déjame en el taller. Esta noche salgo de Sirena.',
    reward: 600,
    steps: [
      { type: 'pickupPed', zone: 'contact', label: 'Recoge a Marisol en el paseo marítimo' },
      { type: 'escape', label: 'Pierde a la policía' },
      { type: 'deliver', zone: 'garage', label: 'Deja a Marisol en el Taller Rueda' },
    ],
  },
];

const COURIER_SPOTS = ['warehouse', 'lighthouse', 'garage', 'contact'];

export class Missions {
  constructor(game) {
    this.game = game;
    this.storyIndex = 0; // next story mission to offer; == STORY.length when done
    this.active = null; // { def, step, courier }
    this.completedTotal = 0;
  }

  get storyDone() {
    return this.storyIndex >= STORY.length;
  }

  nextOffer() {
    if (!this.storyDone) return STORY[this.storyIndex];
    return null;
  }

  startNext() {
    const def = this.nextOffer();
    if (def) this.begin(def, false);
    else this.startCourier();
  }

  begin(def, courier) {
    this.active = { def, step: 0, courier };
    const game = this.game;
    game.onMissionStart(def);
    if (def.steps[0].type === 'steal') game.spawnMissionCar();
  }

  startCourier() {
    const rng = this.game.rng;
    const zones = this.game.city.zones;
    let from = rng.pick(COURIER_SPOTS);
    let to = rng.pick(COURIER_SPOTS);
    if (to === from) to = COURIER_SPOTS[(COURIER_SPOTS.indexOf(from) + 1) % COURIER_SPOTS.length];
    const a = zones[from];
    const b = zones[to];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const def = {
      id: 'mensajero',
      title: 'Trabajo de mensajero',
      brief: 'Otro paquete, otro destino. El puerto nunca duerme.',
      reward: Math.round(60 + dist / 11),
      steps: [
        { type: 'pickup', zone: from, label: 'Recoge el paquete' },
        { type: 'deliver', zone: to, label: 'Entrega el paquete' },
      ],
    };
    this.begin(def, true);
  }

  currentStep() {
    if (!this.active) return null;
    return this.active.def.steps[this.active.step];
  }

  // The world position the minimap and edge arrow should point at.
  currentTarget() {
    const step = this.currentStep();
    if (!step) return null;
    if (step.type === 'steal') {
      const car = this.game.missionCar;
      return car ? { x: car.x, y: car.y, label: step.label } : null;
    }
    if (step.type === 'escape') return null; // nowhere to go but out of sight
    const zone = this.game.city.zones[step.zone];
    return zone ? { x: zone.x, y: zone.y, label: step.label } : null;
  }

  advance() {
    const game = this.game;
    this.active.step++;
    if (this.active.step >= this.active.def.steps.length) {
      const def = this.active.def;
      const wasCourier = this.active.courier;
      this.active = null;
      if (!wasCourier) this.storyIndex++;
      this.completedTotal++;
      game.onMissionComplete(def);
      return;
    }
    const step = this.currentStep();
    if (step.type === 'steal') game.spawnMissionCar();
    game.onMissionStep(step);
  }

  update() {
    const step = this.currentStep();
    if (!step) return;
    const game = this.game;
    const p = game.player;
    const zones = game.city.zones;
    const near = (zone) => Math.hypot(p.x - zone.x, p.y - zone.y) < zone.r + 26;

    switch (step.type) {
      case 'pickup':
        if (!p.car && near(zones[step.zone])) {
          p.hasPackage = true;
          game.audio.pickup();
          game.toast('Paquete recogido');
          this.advance();
        }
        break;
      case 'pickupPed':
        if (p.car && near(zones[step.zone])) {
          p.hasPassenger = true;
          game.toast('Marisol está dentro. ¡Corre!');
          game.addHeat(130, p.x, p.y, true); // the patrol spots the pickup
          this.advance();
        }
        break;
      case 'deliver':
        if (near(zones[step.zone])) {
          p.hasPackage = false;
          p.hasPassenger = false;
          this.advance();
        }
        break;
      case 'steal':
        if (game.missionCar && p.car === game.missionCar) this.advance();
        break;
      case 'deliverCar':
        if (game.missionCar && p.car === game.missionCar && near(zones[step.zone])) {
          game.deliverMissionCar();
          this.advance();
        }
        break;
      case 'escape':
        if (game.wanted <= 0) this.advance();
        break;
    }
  }

  serialize() {
    return { storyIndex: this.storyIndex, completedTotal: this.completedTotal };
  }

  restore(data) {
    if (!data) return;
    this.storyIndex = data.storyIndex ?? 0;
    this.completedTotal = data.completedTotal ?? 0;
  }
}
