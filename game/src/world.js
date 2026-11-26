// The world: the Maraluna island chain, the ring course, supply crates, clouds,
// storm cells and the runway strip. Everything is generated from the leg's seed,
// so a leg is the same course every time it is flown.

import { LEGS, RUNWAY, WORLD } from './config.js';
import { clamp, lerp, makeNoise2D, makeRng } from './random.js';

export function buildWorld(legIndex) {
  const leg = LEGS[legIndex];
  const rng = makeRng(leg.seed);
  const noise = makeNoise2D(leg.seed * 7 + 3);

  // The route's centreline: a gentle S-curve north along +z.
  const phaseA = rng() * 6.28;
  const phaseB = rng() * 6.28;
  const courseX = (z) => 950 * Math.sin(z * 0.00011 + phaseA) + 420 * Math.sin(z * 0.000041 + phaseB);

  // Islands: gaussian hills dotted along and beside the route, plus a few tall peaks.
  const islands = [];
  const islandCount = 11 + legIndex * 2;
  for (let i = 0; i < islandCount; i++) {
    const z = 800 + (i / islandCount) * (leg.courseLength + 2600) + rng() * 500;
    const offCourse = (rng() - 0.5) * 5200;
    islands.push({
      cx: courseX(z) + offCourse,
      cz: z,
      r: 1400 + rng() * 2400,
      h: 260 + rng() * 620,
    });
  }
  const peaks = [];
  const peakCount = 3 + legIndex;
  for (let i = 0; i < peakCount; i++) {
    const z = 5000 + rng() * (leg.courseLength - 6000);
    const side = rng() < 0.5 ? -1 : 1;
    peaks.push({
      cx: courseX(z) + side * (1500 + rng() * 2200),
      cz: z,
      r: 1300 + rng() * 900,
      h: 1150 + rng() * 800,
    });
  }

  const runwayZ = leg.courseLength + 3500; // a proper final: room to descend after the last ring
  const runwayX = courseX(runwayZ);
  // The runway sits on its own flat coral island.
  islands.push({ cx: runwayX, cz: runwayZ, r: 2600, h: 260 });

  /** Height of the ground (feet above sea level) at world (x, z). */
  function terrainHeight(x, z) {
    let h = -40; // the sea floor, below the waterline
    for (const isl of islands) {
      const dx = (x - isl.cx) / isl.r;
      const dz = (z - isl.cz) / isl.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < 9) h += isl.h * Math.exp(-d2 * 1.6);
    }
    for (const pk of peaks) {
      const dx = (x - pk.cx) / pk.r;
      const dz = (z - pk.cz) / pk.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < 9) h += pk.h * Math.exp(-d2 * 2.2);
    }
    // Rolling hills on the land only (never near the waterline, so the shore stays clean).
    const land = clamp((h - 40) / 200, 0, 1);
    h += land * (noise(x * 0.0016, z * 0.0016) * 130 + noise(x * 0.005, z * 0.005) * 42);
    // A clear climb-out corridor along the whole course, so the route itself is
    // a flyable valley: gentle rolling ground beside the route, the islands
    // and peaks rising beyond it. Without this a hill can sit right behind a
    // ring where the plane cannot climb over it in time.
    const dCourse = Math.abs(x - courseX(z));
    if (z > -800 && z < leg.courseLength + 3200 && dCourse < 1400) {
      const corridorFloor = 90 + 40 * noise(x * 0.0016, z * 0.0016);
      h = lerp(corridorFloor, h, clamp((dCourse - 700) / 700, 0, 1));
    }
    // Flatten the home island (takeoff) and the runway island (landing).
    const dHome = Math.hypot(x - courseX(0), z);
    if (dHome < 2200) h = lerp(90, h, clamp((dHome - 900) / 1300, 0, 1));
    const dRwy = Math.hypot(x - runwayX, z - runwayZ);
    if (dRwy < 2400) h = lerp(RUNWAY.elevation, h, clamp((dRwy - 1500) / 900, 0, 1));
    return h;
  }

  // Rings along the course, each at a flyable altitude above the ground, with a
  // clear approach: try a few lateral offsets and keep the one whose approach
  // (the 2400 ft before the ring) stays lowest, so the ring never hides
  // behind a hill the plane cannot climb over in time.
  const rings = [];
  for (let i = 0; i < leg.rings; i++) {
    const z = 2400 + i * WORLD.ringSpacing;
    const baseX = courseX(z);
    let best = null;
    for (const off of [-600, -300, 0, 300, 600]) {
      const x = baseX + off;
      let approachMax = terrainHeight(x, z);
      for (let az = z - 2400; az < z; az += 400) {
        approachMax = Math.max(approachMax, terrainHeight(x, az));
      }
      const score = approachMax + Math.abs(off) * 0.15;
      if (best === null || score < best.score) best = { x, approachMax, score };
    }
    const ground = terrainHeight(best.x, z);
    const y = Math.min(
      1600,
      Math.max(ground + 260, best.approachMax + 220, 520 + Math.sin(i * 1.7 + leg.seed) * 420),
    );
    rings.push({ x: best.x, y, z, radius: WORLD.ringRadius, passed: false, centre: false });
  }

  // Supply crates drift on little parachutes between the rings.
  const crates = [];
  for (let i = 0; i < leg.crates; i++) {
    const z = 3600 + i * ((leg.courseLength - 5000) / leg.crates) + rng() * 900;
    const x = courseX(z) + (rng() - 0.5) * 1100;
    crates.push({
      x,
      y: 620 + rng() * 700,
      z,
      taken: false,
      bobPhase: rng() * 6.28,
      bobAmp: 18 + rng() * 26,
    });
  }

  // Drifting fair-weather clouds, high up and well spread.
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    const z = rng() * (leg.courseLength + 5000) - 1000;
    clouds.push({
      x: courseX(z) + (rng() - 0.5) * 15000,
      y: 2600 + rng() * (WORLD.cloudCeiling - 2600),
      z,
      size: 260 + rng() * 420,
      drift: (rng() - 0.5) * 14,
      puffs: 4 + Math.floor(rng() * 4),
      seed: rng() * 100,
    });
  }

  // Storm cells: black anvils sitting on the route. Flying through one hurts.
  const storms = [];
  for (let i = 0; i < leg.storms; i++) {
    const z = 7000 + i * ((leg.courseLength - 11000) / Math.max(1, leg.storms)) + rng() * 1600;
    storms.push({
      x: courseX(z) + (rng() - 0.5) * 900,
      y: 1500 + rng() * 900,
      z,
      radius: 620 + rng() * 260,
      flashAt: 2 + rng() * 5, // seconds until the next lightning flash
      flash: 0, // remaining flash brightness, 0..1
    });
  }

  const runway = {
    x: runwayX,
    z: runwayZ,
    y: RUNWAY.elevation,
    length: RUNWAY.length,
    width: RUNWAY.width,
  };

  // Where the plane starts: on the home island's strip, facing north up the course.
  const start = { x: courseX(0), y: 120, z: -200 };

  return {
    leg,
    legIndex,
    courseX,
    terrainHeight,
    rings,
    crates,
    clouds,
    storms,
    runway,
    start,
    nextRing() {
      return rings.find((r) => !r.passed) ?? null;
    },
    ringsLeft() {
      return rings.filter((r) => !r.passed).length;
    },
  };
}
