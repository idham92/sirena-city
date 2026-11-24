// shots.js — staged, frozen scenes for the entry screenshots.
// Each scene arranges the real game state (never a mock-up): the cover is
// a drive through the centre with a mission on the HUD, then an on-foot
// pickup, a three-star chase, and the title screen. main.js turns these
// into the ?shot=<name>&seed=<n> URLs listed in shots.json.

import { roadCenterV, roadCenterH, LAND_H } from './city.js';
import { makeCar, MODEL } from './entities.js';

function snapCamera(game) {
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
}

export function setupShot(game, name) {
  const zones = game.city.zones;
  game.mode = 'play';
  game.cash = 640;

  if (name === 'title') {
    game.mode = 'title';
    return 'title';
  }

  if (name === 'drive') {
    game.missions.startNext();
    const car = game.cars.find((c) => c.driver === 'none' && c.model === MODEL.VEGA)
      ?? game.cars.find((c) => c.driver === 'none');
    car.x = roadCenterV(3) + 32;
    car.y = LAND_H - 560;
    car.angle = -Math.PI / 2;
    car.vx = 0;
    car.vy = -190;
    car.driver = 'player';
    game.player.car = car;
    game.player.x = car.x;
    game.player.y = car.y;
    snapCamera(game);
    return 'drive';
  }

  if (name === 'mission') {
    game.missions.startNext();
    game.player.x = zones.warehouse.x - 120;
    game.player.y = zones.warehouse.y + 26;
    game.player.angle = 0.4;
    snapCamera(game);
    return 'mission';
  }

  if (name === 'chase') {
    const gt = game.cars.find((c) => c.model === MODEL.CORAL && c.driver === 'none');
    gt.x = roadCenterV(2) + 190;
    gt.y = roadCenterH(3) + 32;
    gt.angle = 0;
    gt.vx = 300;
    gt.vy = 0;
    gt.driver = 'player';
    game.player.car = gt;
    game.player.x = gt.x;
    game.player.y = gt.y;
    game.heat = 265; // three stars
    game.sightT = 0;
    for (let i = 0; i < 3; i++) {
      const cop = makeCar(gt.x - 150 - i * 95, gt.y + (i - 1) * 44, 0, MODEL.POLICE, '#20303e');
      cop.driver = 'police';
      cop.ai = { dx: 1, dy: 0, stuckT: 0, reverseT: 0 };
      cop.vx = 285;
      game.cars.push(cop);
    }
    snapCamera(game);
    return 'chase';
  }

  return 'title';
}
