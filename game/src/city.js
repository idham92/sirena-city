// city.js — builds Sirena City: a neon port city on a strict road grid.
// Pure data and geometry: no DOM, no canvas, so Node can build the world
// for the smoke test exactly as the browser does.
//
// Layout, in pixels. Roads run on a pitch of 576: a 128-wide road, a 32-wide
// sidewalk, a 384-square block interior, another sidewalk. Six block columns
// and five block rows make the land; south of the land lies the harbor:
// a boardwalk, three piers over open water, and the lighthouse at the end
// of the middle pier.

import { Rng } from './rng.js';

export const PITCH = 576;
export const ROAD_W = 128;
export const WALK_W = 32;
export const BLOCK_IN = 384;
export const BLOCK_OFF = ROAD_W + WALK_W; // 160: block interior starts here in pitch space
export const COLS = 6;
export const ROWS = 5;
export const LAND_W = COLS * PITCH + ROAD_W; // 3584
export const LAND_H = ROWS * PITCH + ROAD_W; // 3008
export const WATER_H = 384;
export const WORLD_W = LAND_W;
export const WORLD_H = LAND_H + WATER_H; // 3392
export const PIER_W = 96;
export const PIER_LEN = 300;

const BUILDING_COLORS = [
  '#f2d5a0', '#e8a87c', '#d98880', '#f0e1c6', '#c9d6a3',
  '#a8c5d6', '#e6b8c8', '#f5e6b8', '#deb887', '#b5c99a',
];
const ROOF_COLORS = ['#8a5a44', '#4f6e6b', '#7d5a50', '#5d6e5a', '#946b54', '#4f5e6b', '#a08b62', '#6b4a5e'];
const SIGN_COLORS = ['#ff5d8f', '#00e5ff', '#ffd166', '#8aff5a', '#ff8c42', '#c792ff'];

const SHOP_NAMES = [
  'HOTEL FARO', 'MERCADO SOL', 'FARMACIA LUNA',
  'BAR LA OLA', 'PELUQUERÍA REY', 'TIENDA NORTE', 'BANCO DEL PUERTO', 'CINE MAR',
  'GIMNASIO TORO', 'FLORISTERÍA AZAHAR', 'PANADERÍA TRIGO', 'LIBRERÍA MAREA',
  'TATUAJES EL ANCLA', 'JOYERÍA PERLA', 'BRASA Y HUMO', 'HELADERÍA COCO',
  'DISCOS SUR', 'ÓPTICA CLARA', 'FERRETERÍA CLAVO',
  'LAVANDERÍA AZUL', 'ZAPATERÍA PASO', 'DULCES CANELA', 'VIAJES ALISIO',
];

export function roadCenterV(i) {
  return ROAD_W / 2 + i * PITCH;
}

export function roadCenterH(j) {
  return ROAD_W / 2 + j * PITCH;
}

// Where a point sits, for movement friction, rendering and AI decisions.
export function groundAt(city, x, y) {
  if (y >= LAND_H) {
    for (const pier of city.piers) {
      if (x >= pier.x && x <= pier.x + pier.w && y <= pier.y + pier.h) return 'pier';
    }
    return 'water';
  }
  const mx = ((x % PITCH) + PITCH) % PITCH;
  const my = ((y % PITCH) + PITCH) % PITCH;
  const onRoadX = mx < ROAD_W;
  const onRoadY = my < ROAD_W;
  if (onRoadX || onRoadY) return 'road';
  const inBlockX = mx >= BLOCK_OFF && mx < BLOCK_OFF + BLOCK_IN;
  const inBlockY = my >= BLOCK_OFF && my < BLOCK_OFF + BLOCK_IN;
  if (inBlockX && inBlockY) {
    for (const park of city.parks) {
      if (x >= park.x && x <= park.x + park.w && y >= park.y && y <= park.y + park.h) return 'grass';
    }
    for (const lot of city.lots) {
      if (x >= lot.x && x <= lot.x + lot.w && y >= lot.y && y <= lot.y + lot.h) return 'lot';
    }
    return 'block';
  }
  return 'sidewalk';
}

export function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// Push a circle out of every rect it overlaps; returns the corrected point.
// Cars and the player both move as circles against the building rects.
export function pushOutOfRects(x, y, radius, rects) {
  for (const r of rects) {
    const nx = Math.max(r.x, Math.min(x, r.x + r.w));
    const ny = Math.max(r.y, Math.min(y, r.y + r.h));
    let dx = x - nx;
    let dy = y - ny;
    let d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * radius;
      y = ny + (dy / d) * radius;
    } else {
      // Centre inside the rect: leave through the nearest face.
      const left = x - r.x;
      const right = r.x + r.w - x;
      const top = y - r.y;
      const bottom = r.y + r.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = r.x - radius;
      else if (m === right) x = r.x + r.w + radius;
      else if (m === top) y = r.y - radius;
      else y = r.y + r.h + radius;
    }
  }
  return { x, y };
}

// True when a building blocks the straight line between two points.
// Sampled every 24 px: cheap, and honest enough for witness checks.
export function lineBlocked(city, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.floor(dist / 24));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    for (const b of city.buildings) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return true;
    }
  }
  return false;
}

function blockRect(i, j) {
  return {
    x: i * PITCH + BLOCK_OFF,
    y: j * PITCH + BLOCK_OFF,
    w: BLOCK_IN,
    h: BLOCK_IN,
  };
}

export function buildCity(seed) {
  const rng = new Rng(seed);
  const city = {
    seed,
    buildings: [],
    parks: [],
    lots: [],
    piers: [],
    lamps: [],
    palms: [],
    colliders: [],
    zones: {},
  };

  let nameIndex = 0;
  const nextName = () => SHOP_NAMES[nameIndex++ % SHOP_NAMES.length];

  const addBuilding = (x, y, w, h, name) => {
    const b = {
      x, y, w, h,
      color: rng.pick(BUILDING_COLORS),
      roof: rng.pick(ROOF_COLORS),
      sign: rng.pick(SIGN_COLORS),
      name: name ?? nextName(),
      floors: Math.max(2, Math.round(h / 34)),
      cols: Math.max(2, Math.round(w / 30)),
      id: city.buildings.length,
    };
    city.buildings.push(b);
    city.colliders.push(b);
    return b;
  };

  // Forced blocks first: the café Marisol works from, the garage that takes
  // stolen cars, and the dock warehouse where the packages wait.
  const forced = new Map();
  forced.set('2,4', 'cafe');
  forced.set('0,0', 'garage');
  forced.set('5,4', 'warehouse');

  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      const blk = blockRect(i, j);
      const kind = forced.get(`${i},${j}`) ?? rng.pick(
        ['tower', 'shops', 'houses', 'mixed', 'shops', 'lot', 'park', 'lot', 'houses'],
      );
      if (kind === 'park') {
        const trees = [];
        for (let t = 0; t < 14; t++) {
          trees.push({
            x: blk.x + rng.range(28, blk.w - 28),
            y: blk.y + rng.range(28, blk.h - 28),
            r: rng.range(13, 22),
          });
        }
        city.parks.push({ ...blk, trees });
        continue;
      }
      if (kind === 'lot') {
        city.lots.push({ ...blk });
        continue;
      }
      if (kind === 'tower') {
        const w = rng.range(210, 260);
        const h = rng.range(210, 260);
        addBuilding(blk.x + (blk.w - w) / 2, blk.y + (blk.h - h) / 2, w, h);
      } else if (kind === 'shops' || kind === 'cafe') {
        const count = 3;
        const sw = (blk.w - 32) / count;
        for (let s = 0; s < count; s++) {
          const name = kind === 'cafe' && s === 1 ? 'CAFÉ BRISA' : undefined;
          addBuilding(blk.x + 16 + s * sw + 4, blk.y + blk.h - 128, sw - 8, 112, name);
        }
        addBuilding(blk.x + 30, blk.y + 24, 130, 100);
      } else if (kind === 'garage') {
        const g = addBuilding(blk.x + 60, blk.y + 60, 264, 180, 'TALLER RUEDA');
        city.zones.garage = { x: g.x + g.w / 2, y: g.y + g.h + 52, r: 62, building: g };
        addBuilding(blk.x + 40, blk.y + 290, 110, 80);
      } else if (kind === 'warehouse') {
        const w = addBuilding(blk.x + 42, blk.y + 90, 300, 200, 'ALMACÉN DEL MUELLE');
        city.zones.warehouse = { x: w.x + w.w / 2, y: w.y + w.h + 50, r: 60, building: w };
      } else if (kind === 'houses') {
        for (let hx = 0; hx < 2; hx++) {
          for (let hy = 0; hy < 2; hy++) {
            addBuilding(blk.x + 22 + hx * 186, blk.y + 22 + hy * 186, 140, 130);
          }
        }
      } else {
        // mixed
        addBuilding(blk.x + 24, blk.y + 24, 190, 150);
        addBuilding(blk.x + 236, blk.y + 40, 124, 118);
        addBuilding(blk.x + 90, blk.y + 226, 210, 128);
      }
    }
  }

  // The harbor: three piers marching into the water, the middle one longer
  // and crowned with the lighthouse.
  for (const ci of [1, 3, 5]) {
    const cx = roadCenterV(ci);
    const len = ci === 3 ? PIER_LEN + 60 : PIER_LEN;
    city.piers.push({ x: cx - PIER_W / 2, y: LAND_H, w: PIER_W, h: len });
  }
  const midPier = city.piers[1];
  city.zones.lighthouse = {
    x: midPier.x + PIER_W / 2,
    y: midPier.y + midPier.h - 26,
    r: 58,
  };
  city.colliders.push({
    x: city.zones.lighthouse.x - 20,
    y: city.zones.lighthouse.y - 20,
    w: 40, h: 40,
  });

  // Marisol waits on the boardwalk in front of her café.
  city.zones.contact = { x: roadCenterV(3), y: LAND_H - 58, r: 54 };
  city.zones.spawn = { x: roadCenterV(3) - 70, y: LAND_H - 58 };

  // Palms along the boardwalk and lamps at every intersection corner.
  for (let x = 90; x < LAND_W; x += 150) {
    if (Math.abs(((x % PITCH) + PITCH) % PITCH) < ROAD_W) continue;
    city.palms.push({ x: x + rng.range(-8, 8), y: LAND_H - 18, r: rng.range(12, 17) });
  }
  for (let i = 0; i <= COLS; i++) {
    for (let j = 0; j <= ROWS; j++) {
      const cx = roadCenterV(i);
      const cy = roadCenterH(j);
      city.lamps.push(
        { x: cx - ROAD_W / 2 - 10, y: cy - ROAD_W / 2 - 10 },
        { x: cx + ROAD_W / 2 + 10, y: cy + ROAD_W / 2 + 10 },
      );
    }
  }

  return city;
}
