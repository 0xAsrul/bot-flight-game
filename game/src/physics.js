// The flight model: how the Kestrel answers the stick, burns fuel, takes damage
// and meets the ground. All speeds in knots, distances in feet.

import { KTS_TO_FPS, PLANE, RUNWAY, WORLD } from './config.js';
import { approach, clamp } from './random.js';

export function createPlane(world) {
  const ground = world.terrainHeight(world.start.x, world.start.z);
  return {
    x: world.start.x,
    y: ground + 8, // parked on her home strip
    z: world.start.z,
    heading: 0, // radians, 0 = due north (+z)
    bank: 0,
    pitch: 0,
    speedKts: 0,
    throttle: 0,
    fuel: world.leg.fuel,
    hull: PLANE.hull,
    vsFps: 0, // vertical speed, feet per second
    onGround: true,
    engineOut: false,
    time: 0,
    gust: 0,
  };
}

/** Steering toward a target point: used by the attract-mode autopilot. */
export function autopilotSteer(plane, target, world) {
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const wantHeading = Math.atan2(dx, dz);
  let diff = wantHeading - plane.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  // Gentle banks: a wide turn re-approaches a missed ring cleanly instead of spiralling.
  const roll = clamp(diff * 1.2, -0.75, 0.75);
  // Stay above the ground on the actual path to the target, not on the heading:
  // the ring's approach corridor is clear by construction, so this only fires
  // for a hill the flight path itself would cross. A landing target (below
  // 150 ft) skips the floor entirely: the strip's approach is flat by
  // construction, and the floor would hold the plane above the runway forever.
  let wantY = target.y;
  if (world && target.y >= 150) {
    let pathMax = -Infinity;
    for (let s = 0.15; s <= 1; s += 0.17) {
      const px = plane.x + dx * s;
      const pz = plane.z + dz * s;
      pathMax = Math.max(pathMax, world.terrainHeight(px, pz));
    }
    wantY = Math.max(wantY, pathMax + 180);
  }
  const altError = wantY - plane.y;
  const pitch = clamp(altError / 380, -1, 1);
  return { roll, pitch, throttle: 0.8 };
}

/**
 * Advance the plane one step. `steer` is { roll, pitch, throttle } where throttle
 * is -1/0/1 (held keys) or null to leave the throttle alone. Events are pushed
 * into `events` for the game to score, sound and display.
 */
export function updatePlane(plane, steer, world, dt, events) {
  const leg = world.leg;
  plane.time += dt;

  // Gusts on the stormier legs push the wings around.
  const gustAmp = leg.storms > 0 ? 0.35 : 0.12;
  plane.gust = Math.sin(plane.time * 0.9) * gustAmp + Math.sin(plane.time * 2.7) * gustAmp * 0.4;

  const stalled = plane.speedKts < PLANE.stallKts && !plane.onGround;
  const authority = stalled ? 0.45 : 1;

  // Bank and pitch ease toward what the pilot commands.
  const bankTarget = clamp(steer.roll, -1, 1) * PLANE.maxBank + plane.gust * 0.1;
  plane.bank = approach(plane.bank, bankTarget, 2.4 * authority, dt);
  const pitchTarget = clamp(steer.pitch, -1, 1) * PLANE.maxPitch;
  plane.pitch = approach(plane.pitch, pitchTarget, 1.9 * authority, dt);

  // Throttle.
  if (steer.throttle !== null && steer.throttle !== undefined) {
    plane.throttle = clamp(plane.throttle + steer.throttle * PLANE.throttleStep * dt, 0, 1);
  }
  if (plane.fuel <= 0 && !plane.engineOut) {
    plane.engineOut = true;
    events.push({ type: 'fuelEmpty' });
  }
  if (plane.engineOut) plane.throttle = 0;

  // Speed: throttle pulls toward its speed, climbing bleeds it, diving adds it.
  const speedTarget = plane.throttle * PLANE.maxSpeedKts;
  let accel = (speedTarget - plane.speedKts) * 0.35;
  accel -= Math.sin(plane.pitch) * 34;
  plane.speedKts = clamp(plane.speedKts + accel * dt, 0, PLANE.maxSpeedKts + 25);
  if (plane.onGround && plane.throttle < 0.45) plane.speedKts = Math.max(0, plane.speedKts - 26 * dt);

  // Heading follows the bank.
  const speedFactor = clamp(plane.speedKts / 130, 0.25, 1.15);
  plane.heading += plane.bank * PLANE.turnRate * speedFactor * dt;

  // Vertical speed from pitch; a stalled wing sinks.
  let vs = Math.sin(plane.pitch) * plane.speedKts * KTS_TO_FPS * PLANE.climbPower;
  if (stalled) vs -= (PLANE.stallKts - plane.speedKts) * 1.6;
  plane.vsFps = vs;

  // Fuel burn.
  if (!plane.onGround || plane.speedKts > 5) {
    plane.fuel = Math.max(0, plane.fuel - (PLANE.fuelBurnBase + plane.throttle * PLANE.fuelBurnThrottle) * dt);
  }
  if (plane.fuel < 20 && !plane._lowFuelWarned) {
    plane._lowFuelWarned = true;
    events.push({ type: 'lowFuel' });
  }

  // Move.
  const fps = plane.speedKts * KTS_TO_FPS;
  const prevZ = plane.z;
  const prevY = plane.y;
  plane.x += Math.sin(plane.heading) * fps * dt;
  plane.z += Math.cos(plane.heading) * fps * dt;
  plane.y += plane.vsFps * dt;
  if (plane.y < 6) plane.y = 6;

  const ground = world.terrainHeight(plane.x, plane.z);
  const rwy = world.runway;
  const overRunway =
    Math.abs(plane.x - rwy.x) < rwy.width / 2 + 40 && Math.abs(plane.z - rwy.z) < rwy.length / 2 + 40;

  // --- rings ---------------------------------------------------------------
  for (const ring of world.rings) {
    if (ring.passed) continue;
    if (prevZ < ring.z && plane.z >= ring.z) {
      const dx = plane.x - ring.x;
      const dy = plane.y - ring.y;
      const dist = Math.hypot(dx, dy);
      if (dist < ring.radius) {
        ring.passed = true;
        ring.centre = dist < 40;
        plane.fuel = Math.min(100, plane.fuel + PLANE.fuelPerRing);
        events.push({ type: 'ring', ring, centre: ring.centre });
      } else {
        events.push({ type: 'ringMissed', ring });
      }
    }
  }

  // --- supply crates --------------------------------------------------------
  for (const crate of world.crates) {
    if (crate.taken) continue;
    const bobY = crate.y + Math.sin(plane.time * 0.8 + crate.bobPhase) * crate.bobAmp;
    const d = Math.hypot(plane.x - crate.x, plane.y - bobY, plane.z - crate.z);
    if (d < WORLD.crateRadius) {
      crate.taken = true;
      events.push({ type: 'crate', crate });
    }
  }

  // --- storm cells ----------------------------------------------------------
  let inStorm = false;
  for (const storm of world.storms) {
    const d = Math.hypot(plane.x - storm.x, plane.z - storm.z);
    if (d < storm.radius && Math.abs(plane.y - storm.y) < 520) {
      inStorm = true;
      plane.hull -= PLANE.stormDamagePerSec * dt;
      plane.bank += (Math.random() - 0.5) * 0.9 * dt; // turbulence shoves the wings
      plane.pitch += (Math.random() - 0.5) * 0.5 * dt;
      events.push({ type: 'storm' });
    }
    storm.flashAt -= dt;
    if (storm.flashAt <= 0) {
      storm.flash = 1;
      storm.flashAt = 3 + Math.random() * 6;
    }
    storm.flash = Math.max(0, storm.flash - dt * 2.2);
  }
  plane.inStorm = inStorm;

  // --- ground contact -------------------------------------------------------
  // Touching down on the strip: descending onto it, or already rolling on it.
  const onStrip =
    overRunway && plane.y <= rwy.y + 26 && plane.vsFps < 14 && (plane.onGround || plane.vsFps < 0);
  if (onStrip) {
    if (!plane.onGround) {
      plane.onGround = true;
      events.push({ type: 'touchdown', speedKts: plane.speedKts });
    }
    plane.y = rwy.y + 8;
    plane.pitch = approach(plane.pitch, 0, 3, dt);
    plane.bank = approach(plane.bank, 0, 3, dt);
    plane.speedKts = Math.max(0, plane.speedKts - (plane.throttle > 0.4 ? 6 : 34) * dt);
    if (plane.speedKts > 72 && plane.throttle >= 0.5) {
      plane.onGround = false; // lift off again
      events.push({ type: 'takeoff' });
    } else if (plane.speedKts < 24 && world.ringsLeft() === 0) {
      events.push({ type: 'landed' });
    }
    return;
  }

  if (plane.onGround) {
    // Rolling along the ground: a takeoff roll or a field rollout.
    if (ground < 4) {
      events.push({ type: 'crash', reason: 'ditched' });
      return;
    }
    plane.y = ground + 8;
    plane.pitch = approach(plane.pitch, 0, 3, dt);
    plane.bank = approach(plane.bank, 0, 3, dt);
    plane.speedKts = Math.max(0, plane.speedKts - (plane.throttle > 0.4 ? 6 : 34) * dt);
    if (plane.speedKts > 72 && plane.throttle >= 0.5) {
      plane.onGround = false;
      events.push({ type: 'takeoff' });
    }
    return;
  }

  if (plane.y <= ground + 6) {
    if (plane.vsFps >= -14 && plane.speedKts <= 120) {
      // A gentle field landing: roll out on the grass.
      plane.onGround = true;
      plane.y = ground + 8;
      return;
    }
    // A hard impact with the ground.
    events.push({ type: 'crash', reason: ground < 4 ? 'ditched' : 'terrain' });
    return;
  }

  // Open water has no ground to roll on: touching it ends the flight.
  if (ground < 4 && plane.y <= 10) {
    events.push({ type: 'crash', reason: 'ditched' });
    return;
  }

  if (plane.hull <= 0) events.push({ type: 'crash', reason: 'hull' });
  void prevY;
}
