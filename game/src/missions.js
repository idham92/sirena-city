// SIRENA CITY — Marina Sol's story: three missions of favours, theft and a
// getaway, then open-ended courier jobs once the story is done. A mission is
// a list of stages; each stage knows its kind, its map point and its words.
// The world calls update() every step; stages complete by where the player
// is, what they drive, and how hot the police are.
import { CRIME } from './config.js';

const STORY = [
  {
    title: 'El encargo de Marina',
    intro: 'Marina: «Un paquete me espera en el Muelle Norte. Recógelo y llévalo al Hotel Brisa. Sin preguntas.»',
    reward: 300,
    stages: [
      { kind: 'pickup', poi: 'dock', text: 'Recoge el paquete en el Muelle Norte' },
      { kind: 'deliver', poi: 'hotel', text: 'Entrega el paquete en el Hotel Brisa', time: 160 },
    ],
  },
  {
    title: 'El Coral GT',
    intro: 'Marina: «Hay un Coral GT en el aparcamiento del Neon Gym. Vera te lo compra en su taller. Ni un rasguño… bueno, casi.»',
    reward: 650,
    stages: [
      { kind: 'enterMarked', poi: 'gym', text: 'Roba el Coral GT marcado en el Neon Gym' },
      { kind: 'deliverCar', poi: 'taller', text: 'Lleva el Coral GT al Taller Vera' },
    ],
  },
  {
    title: 'La fuga de Marina',
    intro: 'Marina: «Debo salir de Sirena esta noche. Recógeme en el Casino Coral, pierde a la policía y déjame en el Faro.»',
    reward: 1100,
    stages: [
      { kind: 'pickupPax', poi: 'casino', text: 'Recoge a Marina en el Casino Coral (en coche)' },
      { kind: 'escape', poi: null, text: 'Pierde a la policía' },
      { kind: 'dropPax', poi: 'dockEnd', text: 'Deja a Marina en el Faro de Sirena', time: 260 },
    ],
  },
];

export function createMissions(savedIndex = 0) {
  return {
    nextIndex: Math.min(savedIndex, STORY.length), // story missions still to do
    active: null,        // {def, stageIndex, timer, isJob}
    jobCount: 0,

    get storyDone() {
      return this.nextIndex >= STORY.length;
    },

    /** The map point and words of the current stage, or null. */
    objective(world) {
      if (!this.active) {
        const cafe = world.city.pois.cafe;
        return { x: cafe.front.x, y: cafe.front.y, text: this.storyDone ? 'Trabajos con Marina — Café Litoral' : 'Habla con Marina — Café Litoral', marker: 'contact' };
      }
      const stage = this.active.def.stages[this.active.stageIndex];
      if (stage.kind === 'escape') return { x: null, y: null, text: stage.text, marker: 'none' };
      const poi = world.city.pois[stage.poi];
      const point = stage.kind === 'pickup' || stage.kind === 'dropPax' ? poi.door : poi.front;
      return { x: point.x, y: point.y, text: stage.text, marker: 'objective' };
    },

    /** Start the next story mission, or a courier job when the story is done. */
    tryStart(world) {
      if (this.active) return false;
      if (!this.storyDone) {
        const def = STORY[this.nextIndex];
        this.active = { def, stageIndex: 0, timer: def.stages[0].time || 0, isJob: false };
        world.toast(def.title, 3.4);
        world.toast(def.intro, 5.5, 3.4);
        if (def.stages[0].kind === 'enterMarked') world.spawnMarkedCar();
        return true;
      }
      // Courier job: a package across town, paid by distance.
      const pois = world.city.pois;
      const spots = ['dock', 'hotel', 'casino', 'taller', 'gym'];
      const from = spots[world.rng.int(0, spots.length - 1)];
      let to = spots[world.rng.int(0, spots.length - 1)];
      if (to === from) to = 'hotel';
      const a = pois[from].front;
      const b = pois[to].front;
      const reward = Math.round(120 + Math.hypot(b.x - a.x, b.y - a.y) * 0.14);
      const def = {
        title: 'Trabajo de mensajería',
        reward,
        stages: [
          { kind: 'pickup', poi: from, text: `Recoge el paquete en ${pois[from].name}` },
          { kind: 'deliver', poi: to, text: `Entrégalo en ${pois[to].name}`, time: 200 },
        ],
      };
      this.active = { def, stageIndex: 0, timer: 0, isJob: true };
      world.toast(`Nuevo trabajo: $${reward}`, 3.4);
      return true;
    },

    fail(world, why) {
      world.toast(`Misión fallida: ${why}. Vuelve con Marina.`, 4.5);
      world.audio.sting();
      if (world.markedCar) world.markedCar.marked = false;
      world.markedCar = null;
      this.active = null;
    },

    completeStage(world) {
      const act = this.active;
      act.stageIndex += 1;
      if (act.stageIndex >= act.def.stages.length) {
        world.player.cash += act.def.reward;
        world.audio.jingle();
        world.audio.cash();
        world.toast(`¡Misión cumplida! +$${act.def.reward}`, 4.5);
        if (act.isJob) this.jobCount += 1;
        else {
          this.nextIndex += 1;
          if (this.storyDone) world.toast('Marina se ha ido de Sirena. Los trabajos siguen en el Café Litoral.', 5.5, 4.6);
        }
        if (world.markedCar) world.markedCar.marked = false;
        world.markedCar = null;
        this.active = null;
        world.markDirty();
        return;
      }
      const stage = act.def.stages[act.stageIndex];
      act.timer = stage.time || 0;
      world.toast(stage.text, 4);
      if (stage.kind === 'enterMarked') world.spawnMarkedCar();
      if (stage.kind === 'escape') {
        world.addWanted(3);
        world.toast('¡La policía te pisa los talones!', 3.5, 4.1);
      }
      if (stage.kind === 'pickupPax') world.audio.pickup();
    },

    update(world, dt) {
      const act = this.active;
      if (!act) return;
      const stage = act.def.stages[act.stageIndex];
      const player = world.player;

      if (stage.time) {
        act.timer -= dt;
        if (act.timer <= 0) {
          this.fail(world, 'se acabó el tiempo');
          return;
        }
      }

      const poi = stage.poi ? world.city.pois[stage.poi] : null;
      const near = (point, r) => Math.hypot(player.x - point.x, player.y - point.y) < r;

      switch (stage.kind) {
        case 'pickup':
          if (!player.inCar && near(poi.door, 44)) {
            world.audio.pickup();
            world.toast('Paquete recogido.', 2.5);
            this.completeStage(world);
          }
          break;
        case 'deliver':
          if (near(poi.front, 58)) {
            this.completeStage(world);
          }
          break;
        case 'enterMarked':
          if (world.markedCar && player.inCar === world.markedCar) {
            world.addWanted(2);
            world.toast('¡Es este! ¡Acelera, la alarma ha saltado!', 3.5);
            this.completeStage(world);
          }
          break;
        case 'deliverCar':
          if (world.markedCar && player.inCar === world.markedCar && near(poi.front, 66)) {
            this.completeStage(world);
          } else if (world.markedCar && (world.markedCar.disabled || world.markedCar.sunk)) {
            this.fail(world, 'el Coral GT ha quedado inservible');
          }
          break;
        case 'pickupPax':
          if (player.inCar && near(poi.front, 62)) {
            world.toast('Marina: «¡Vamos, vamos! ¡Ya vienen!»', 3.5);
            this.completeStage(world);
          }
          break;
        case 'escape':
          if (world.wanted.stars <= 0.01 && world.wanted.unseenTime > 1) {
            world.toast('Marina: «Los hemos perdido. Al Faro, rápido.»', 3.5);
            this.completeStage(world);
          }
          break;
        case 'dropPax':
          if (player.inCar && near(poi.door, 58)) {
            this.completeStage(world);
          }
          break;
        default:
          break;
      }
    },

    /** HUD line for the mission timer, or empty. */
    timerText() {
      const act = this.active;
      if (!act) return '';
      const stage = act.def.stages[act.stageIndex];
      if (!stage.time) return '';
      const s = Math.max(0, Math.ceil(act.timer));
      return `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    },
  };
}

export { CRIME };
