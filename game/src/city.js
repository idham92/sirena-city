// SIRENA CITY — the city itself: a grid of streets and blocks on a harbour.
// Builds every building (with its neon sign, roof colour and lit windows), the
// parks and parking lots between them, the piers reaching into the sea, and the
// named places the story visits. Also answers the geometry questions the rest
// of the game asks: what is solid, what is water, where are the road lanes.
import {
  BLOCK, CITY_H, CITY_W, COLS, NEON_COLORS, PITCH, ROAD, ROOF_COLORS, ROWS, SHORE_Y,
} from './config.js';
import { hash2 } from './random.js';

// Original Sirena businesses; the special ones below anchor the story.
const BUSINESS_NAMES = [
  'Pizzería Nona', 'Bar La Boia', 'Tienda Maré', 'Banco del Puerto', 'Cine Ondas',
  'Librería Salitre', 'Floristería Alba', 'Dulces Miramar', 'Tatuajes Coral',
  'Peluquería Brisa', 'Mercado Sirena', 'Hotel Faro Alto', 'Residencial Ondina',
  'Oficinas Puerto', 'Gimnasio Marea', 'Café Del Mar', 'Bar El Ancla', 'Joyas Perla',
  'Farmacia Litoral', 'Panadería Trigo', 'Hotel Las Olas', 'Clínica Brisa',
  'Taller Hermanos Paz', 'Ropa Vela', 'Disco Marea Alta', 'Bar El Timón',
];

// Story locations, by block [col, row].
const SPECIALS = {
  cafe: { block: [1, 1], name: 'Café Litoral', color: '#ff5da2' },
  hotel: { block: [5, 1], name: 'Hotel Brisa', color: '#39d0ff' },
  police: { block: [4, 3], name: 'Comisaría Sirena', color: '#4a6cff' },
  hospital: { block: [1, 4], name: 'Hospital San Roque', color: '#e8e8f0' },
  gym: { block: [6, 3], name: 'Neon Gym', color: '#7dff6a', parking: true },
  taller: { block: [2, 5], name: 'Taller Vera', color: '#ff8c42' },
  casino: { block: [6, 5], name: 'Casino Coral', color: '#c792ff' },
};

const SIDEWALK = 26; // pavement ring inside every block

function blockOrigin(col, row) {
  return { x: col * PITCH + ROAD, y: row * PITCH + ROAD };
}

export function createCity(random) {
  const buildings = [];
  const parks = [];
  const lots = [];
  const pois = {};
  let nameIndex = 0;

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const { x, y } = blockOrigin(col, row);
      const specialKey = Object.keys(SPECIALS).find((key) => {
        const s = SPECIALS[key];
        return s.block[0] === col && s.block[1] === row;
      });
      const special = specialKey ? SPECIALS[specialKey] : null;
      const roll = hash2(col * 7 + 3, row * 13 + 5);

      if (special && !special.parking) {
        const rect = { x: x + SIDEWALK, y: y + SIDEWALK, w: BLOCK - SIDEWALK * 2, h: BLOCK - SIDEWALK * 2 };
        const building = {
          ...rect, name: special.name, neon: special.color,
          roof: '#3d4356', seed: col * 100 + row, special: specialKey,
        };
        buildings.push(building);
        pois[specialKey] = {
          name: special.name,
          door: { x: rect.x + rect.w / 2, y: rect.y + rect.h + 20 },
          front: { x: rect.x + rect.w / 2, y: rect.y + rect.h + 52 },
        };
        continue;
      }
      if (special && special.parking) {
        // The gym's open lot: the story's marked sports car waits here.
        const lot = { x: x + 10, y: y + 10, w: BLOCK - 20, h: BLOCK - 20, name: special.name, neon: special.color };
        lots.push(lot);
        pois[specialKey] = {
          name: special.name,
          door: { x: lot.x + lot.w / 2, y: lot.y + lot.h - 24 },
          front: { x: lot.x + lot.w / 2, y: lot.y + lot.h + 30 },
        };
        continue;
      }
      if (roll < 0.16) {
        parks.push({ x: x + 8, y: y + 8, w: BLOCK - 16, h: BLOCK - 16, seed: col * 100 + row });
      } else if (roll < 0.34) {
        lots.push({ x: x + 10, y: y + 10, w: BLOCK - 20, h: BLOCK - 20, name: null, neon: null });
      } else {
        const inset = SIDEWALK + Math.floor(hash2(col, row) * 10);
        const rect = { x: x + inset, y: y + inset, w: BLOCK - inset * 2, h: BLOCK - inset * 2 };
        buildings.push({
          ...rect,
          name: BUSINESS_NAMES[nameIndex % BUSINESS_NAMES.length],
          neon: NEON_COLORS[Math.floor(hash2(col + 40, row + 9) * NEON_COLORS.length)],
          roof: ROOF_COLORS[Math.floor(hash2(col + 9, row + 40) * ROOF_COLORS.length)],
          seed: col * 100 + row,
          special: null,
        });
        nameIndex += 1;
      }
    }
  }

  // Piers: three wooden fingers into the sea, ground you can walk and drive on.
  const piers = [0.18, 0.5, 0.82].map((f) => ({
    x: Math.floor(CITY_W * f) - 34, y: SHORE_Y, w: 68, h: 190,
  }));
  pois.dock = { name: 'Muelle Norte', door: { x: piers[0].x + 34, y: SHORE_Y + 120 }, front: { x: piers[0].x + 34, y: SHORE_Y - 30 } };
  pois.dockEnd = { name: 'Faro de Sirena', door: { x: piers[2].x + 34, y: SHORE_Y + 168 }, front: { x: piers[2].x + 34, y: SHORE_Y - 30 } };

  // Street centre lines for the traffic graph.
  const vRoads = [];
  for (let i = 0; i <= COLS; i += 1) vRoads.push(i * PITCH + ROAD / 2);
  const hRoads = [];
  for (let j = 0; j <= ROWS; j += 1) hRoads.push(j * PITCH + ROAD / 2);

  const colliders = buildings.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));

  function isWater(x, y) {
    if (y < SHORE_Y) return false;
    for (const pier of piers) {
      if (x >= pier.x && x <= pier.x + pier.w && y >= pier.y && y <= pier.y + pier.h) return false;
    }
    return y < CITY_H;
  }

  /** Push a circle out of every building; returns true if it touched anything. */
  function collideCircle(pos, radius) {
    let hit = false;
    for (const rect of colliders) {
      const nearX = Math.max(rect.x, Math.min(pos.x, rect.x + rect.w));
      const nearY = Math.max(rect.y, Math.min(pos.y, rect.y + rect.h));
      const dx = pos.x - nearX;
      const dy = pos.y - nearY;
      const d2 = dx * dx + dy * dy;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = nearX + (dx / d) * radius;
          pos.y = nearY + (dy / d) * radius;
        } else {
          // Centre inside the rect: leave by the nearest face.
          const left = pos.x - rect.x;
          const right = rect.x + rect.w - pos.x;
          const top = pos.y - rect.y;
          const bottom = rect.y + rect.h - pos.y;
          const min = Math.min(left, right, top, bottom);
          if (min === left) pos.x = rect.x - radius;
          else if (min === right) pos.x = rect.x + rect.w + radius;
          else if (min === top) pos.y = rect.y - radius;
          else pos.y = rect.y + rect.h + radius;
        }
      }
    }
    pos.x = Math.max(radius, Math.min(CITY_W - radius, pos.x));
    pos.y = Math.max(radius, Math.min(CITY_H - radius, pos.y));
    return hit;
  }

  /** Is the segment a→b free of buildings? (Cheap line-of-sight for police vision.) */
  function lineOfSight(ax, ay, bx, by) {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 26);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      for (const rect of colliders) {
        if (x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h) return false;
      }
    }
    return true;
  }

  /** A random point on a random block's pavement ring — where pedestrians stroll. */
  function randomSidewalkPoint(rng) {
    const col = rng.int(0, COLS - 1);
    const row = rng.int(0, ROWS - 1);
    const { x, y } = blockOrigin(col, row);
    const inset = 13;
    const side = rng.int(0, 3);
    if (side === 0) return { x: x + inset + rng.next() * (BLOCK - inset * 2), y: y + inset };
    if (side === 1) return { x: x + inset + rng.next() * (BLOCK - inset * 2), y: y + BLOCK - inset };
    if (side === 2) return { x: x + inset, y: y + inset + rng.next() * (BLOCK - inset * 2) };
    return { x: x + BLOCK - inset, y: y + inset + rng.next() * (BLOCK - inset * 2) };
  }

  return {
    width: CITY_W, height: CITY_H, buildings, parks, lots, piers, pois,
    vRoads, hRoads, colliders, isWater, collideCircle, lineOfSight, randomSidewalkPoint,
    random,
  };
}

/** The lane offset from a street centre for the direction of travel (right-hand traffic). */
export function laneOffset(angle) {
  return { x: -Math.sin(angle) * 15, y: Math.cos(angle) * 15 };
}
