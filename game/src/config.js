// SIRENA CITY — tuning constants for the whole game.
// One place for the numbers every other module shares: city geometry, speeds,
// the price of crime, and the dusk palette the renderer paints with.

export const STEP = 1 / 60;

// --- City geometry (pixels) ---------------------------------------------------
export const ROAD = 96;            // width of every street
export const BLOCK = 232;          // city block between streets
export const PITCH = ROAD + BLOCK; // distance from one street start to the next
export const COLS = 8;             // blocks across
export const ROWS = 7;             // blocks down
export const WATER_DEPTH = 260;    // the sea along the south edge
export const CITY_W = COLS * PITCH + ROAD;
export const CITY_H = ROWS * PITCH + ROAD + WATER_DEPTH;
export const SHORE_Y = ROWS * PITCH + ROAD; // first pixel of water

// --- Player -------------------------------------------------------------------
export const PLAYER_RADIUS = 11;
export const WALK_SPEED = 150;
export const RUN_SPEED = 245;
export const PLAYER_MAX_HP = 100;

// --- Cars ---------------------------------------------------------------------
export const CAR_LENGTH = 46;
export const CAR_WIDTH = 22;
export const CAR_MAX_HP = 100;
export const TRAFFIC_COUNT = 13;
export const PED_COUNT = 22;

// --- Wanted system --------------------------------------------------------------
// Wanted is a float; the HUD shows ceil() stars. Crimes add, hiding decays.
export const CRIME = {
  stealCar: 1.0,
  hitPed: 1.2,
  killPed: 0.8,     // on top of hitPed when the pedestrian goes down
  hitCar: 0.35,
  shotFired: 0.25,
  shotPed: 1.5,
  shotCar: 0.4,
  explosion: 1.0,
};
export const WITNESS_RADIUS = 500; // a crime counts if a ped or cop is this close
export const SIGHT_RADIUS = 560;   // police "see" the player inside this
export const HIDE_SECONDS = 9;     // unseen this long before the stars decay
export const DECAY_PER_SECOND = 1 / 13;
export const BUST_RADIUS = 88;     // a cop this close can fill the bust meter
export const BUST_FILL = 0.38;     // per second while the player is slow
export const BUST_DRAIN = 0.55;

// --- Combat ---------------------------------------------------------------------
export const GUN_RANGE = 430;
export const GUN_DAMAGE = 34;
export const GUN_MAG = 12;
export const GUN_RELOAD = 1.15;   // seconds
export const GUN_COOLDOWN = 0.16; // seconds between shots

// --- Palette (dusk over a neon port city) ---------------------------------------
export const COLORS = {
  water: '#14405f',
  waterDeep: '#0d2c47',
  sidewalk: '#565d6e',
  sidewalkEdge: '#6a7185',
  asphalt: '#2c303c',
  asphaltEdge: '#22252e',
  lane: '#c8b25a',
  grass: '#2e4d33',
  parkPath: '#4c5548',
  buildingEdge: '#14161d',
  player: '#ffd23e',
};

// Roof colours, muted at dusk; the signs get the neon set.
export const ROOF_COLORS = ['#4a4f63', '#5d4a52', '#42505a', '#57503f', '#4f4258', '#3f5a52', '#63564a', '#51465e'];
export const NEON_COLORS = ['#ff5da2', '#39d0ff', '#ffd23e', '#7dff6a', '#ff8c42', '#c792ff', '#4affd8'];
export const CAR_COLORS = ['#c0392b', '#2471a3', '#b7950b', '#229954', '#7d3c98', '#ba4a00', '#5d6d7e', '#aab7b8', '#e67e22', '#16a085', '#ecf0f1', '#2e4053'];
export const SPORTS_COLORS = ['#ff2e63', '#ffd23e', '#08d9d6', '#ff8c42'];

export const SAVE_KEY = 'sirena-city-save-v1';
