// SIRENA CITY — staged scenes for the screenshots. The screenshot runner
// loads the game with ?shot=<name>&seed=<n>; main.js builds a fresh world
// from the seed and this module poses it: the hero mid-drive, a mission
// moment with Marina, a three-star chase, or the untouched title backdrop.
// Everything here only arranges pieces the simulation already knows how to
// make — no fake imagery, just the real game, posed.
import { createCar, spawnPoliceCar } from './entities.js';

export const SHOT_NAMES = ['drive', 'mission', 'chase', 'title'];

/** Put the player behind the wheel of `car`. */
function board(world, car) {
  car.driver = true;
  world.cars.push(car);
  world.player.inCar = car;
  world.player.x = car.x;
  world.player.y = car.y;
  world.player.angle = car.angle;
}

/** Pose `world` for the named shot. Returns how many settle steps to run. */
export function stageShot(world, name) {
  const { city, player } = world;
  const cx = city.vRoads[3];
  const cy = city.hRoads[3];
  if (name === 'drive') {
    const hero = createCar(cx - 120, cy + 21, 0, {
      kind: 'traffic', name: 'Maré Hatch', color: '#2471a3', cruise: 200,
    });
    hero.speed = 250;
    board(world, hero);
    world.camera.x = hero.x + 60;
    world.camera.y = hero.y;
    return 14;
  }
  if (name === 'mission') {
    // On foot with Marina outside the café, her marker up, a car waiting.
    player.x = world.contact.x + 34;
    player.y = world.contact.y + 10;
    player.angle = Math.PI;
    const car = createCar(world.contact.x - 70, world.contact.y + 80, Math.PI / 2, {
      kind: 'parked', driver: false, name: 'Vela Compacto', color: '#c0392b',
    });
    world.cars.push(car);
    world.camera.x = world.contact.x;
    world.camera.y = world.contact.y + 20;
    return 4;
  }
  if (name === 'chase') {
    const hero = createCar(cx + 40, cy - 21, 0, {
      kind: 'traffic', name: 'Coral GT', sports: true, color: '#ff2e63',
    });
    hero.speed = 330;
    hero.hp = 55;
    board(world, hero);
    world.wanted.stars = 3;
    world.wanted.seen = true;
    world.wanted.unseenTime = 0;
    const offsets = [[-110, -24], [-190, 22], [-290, -20]];
    for (const [ox, oy] of offsets) {
      const cop = spawnPoliceCar(world);
      cop.x = hero.x + ox;
      cop.y = hero.y + oy;
      cop.angle = 0;
      cop.speed = 320;
    }
    world.camera.x = hero.x + 30;
    world.camera.y = hero.y;
    return 10;
  }
  // 'title': the menu backdrop; the ambient step pans the camera on its own.
  world.camera.x = city.pois.cafe.front.x + 120;
  world.camera.y = city.pois.cafe.front.y + 60;
  return 30;
}
