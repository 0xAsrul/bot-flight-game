// Sky Courier: Aurora Run — tuning constants and the three legs (missions).
// All distances in feet, speeds in knots, angles in radians. One knot = 1.68781 ft/s.

export const KTS_TO_FPS = 1.68781;
export const WORLD = {
  viewDistance: 6500, // how far ahead the terrain renderer draws, in feet
  nearClip: 60, // camera-space depth closer than this is not drawn
  fovDeg: 68, // vertical field of view of the chase camera
  seaLevel: 0,
  groundClearance: 24, // feet above terrain before a touch counts as a crash
  ringRadius: 110, // feet; the glowing rings you fly through
  ringSpacing: 2600, // feet between rings along the course
  crateRadius: 55, // feet; how close you must come to grab a supply crate
  cloudCeiling: 5200, // feet; highest drifting clouds
};

export const PLANE = {
  maxSpeedKts: 265, // at full throttle, level flight
  cruiseKts: 185,
  stallKts: 58, // below this the wings stop flying and she sinks
  maxBank: 1.15, // radians of bank the pilot can command
  maxPitch: 0.42, // radians of climb/descent the pilot can command
  turnRate: 0.55, // heading change per second at full bank
  climbPower: 1.0, // pitch authority multiplier
  throttleStep: 0.55, // throttle change per second while held
  fuelBurnBase: 0.16, // fuel units per second at idle
  fuelBurnThrottle: 0.55, // extra fuel units per second at full throttle
  fuelPerRing: 9, // fuel refunded by each ring flown
  hull: 100,
  stormDamagePerSec: 9, // hull lost per second inside a storm cell
  scrapeDamagePerSec: 26, // hull lost per second while scraping terrain
};

export const SCORE = {
  ring: 100,
  ringCenterBonus: 50, // extra when the pass is within 40 ft of the ring centre
  crate: 50,
  legLanding: 250,
  legTimeBonusPerSec: 2, // per second under the leg's par time
  hullBonusPerPoint: 2, // per hull point left at landing
  fuelBonusPerPoint: 1, // per fuel point left at landing
};

// The three legs. Each is one sortie: fly its rings, then put her down on the strip.
// `seed` drives the island layout so every run of a leg is the same course.
export const LEGS = [
  {
    id: 0,
    name: 'Leg 1 — Dawn Delivery',
    short: 'Dawn Delivery',
    briefing:
      'First light over the Maraluna chain. Eight rings mark the mail route to Strip 07. ' +
      'Keep her above the palms, mind the fuel, and grease the landing.',
    rings: 8,
    courseLength: 21000,
    storms: 0,
    crates: 4,
    fuel: 100,
    parSeconds: 150,
    seed: 101,
    sky: { top: '#2e4a7a', mid: '#e8907c', low: '#ffd9a0', sun: '#fff3c4', haze: '#f7c489' },
    sea: '#2f6f8f',
    dayLabel: 'DAWN',
  },
  {
    id: 1,
    name: 'Leg 2 — Storm Run',
    short: 'Storm Run',
    briefing:
      'A squall line sits across the route. Ten rings, live storm cells, and gusty wind. ' +
      'Thread the rings, dodge the black cloud, and do not run dry over the water.',
    rings: 10,
    courseLength: 26000,
    storms: 5,
    crates: 5,
    fuel: 100,
    parSeconds: 175,
    seed: 207,
    sky: { top: '#232c3d', mid: '#5d6f88', low: '#9aa7b5', sun: '#e8e4d2', haze: '#8b98a8' },
    sea: '#274b63',
    dayLabel: 'SQUALL',
  },
  {
    id: 2,
    name: 'Leg 3 — Island Hop',
    short: 'Island Hop',
    briefing:
      'The long hop: twelve rings across the whole chain to a short coral strip. ' +
      'Fuel is tight — every ring tops the tank a little. Land her gentle and the run is yours.',
    rings: 12,
    courseLength: 32000,
    storms: 3,
    crates: 6,
    fuel: 100,
    parSeconds: 215,
    seed: 313,
    sky: { top: '#3b2a5e', mid: '#c65f74', low: '#ffb37a', sun: '#ffe9b0', haze: '#e08a6d' },
    sea: '#3d4f7d',
    dayLabel: 'DUSK',
  },
];

export const RUNWAY = {
  length: 2600, // feet of paved strip
  width: 180,
  headingDeg: 0, // the strip runs due north, along the course
  elevation: 60, // feet above sea level, on its island
};
