// Sky Courier: Aurora Run — the game loop, state machine, scoring, particles
// and the deterministic screenshot modes (?shot=start|play|end&leg=N).

import { LEGS, SCORE } from './config.js';
import { buildWorld } from './world.js';
import { createPlane, updatePlane, autopilotSteer } from './physics.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  drawHUD,
  drawTitle,
  drawBriefing,
  drawLegComplete,
  drawGameOver,
  drawWin,
  drawPaused,
} from './hud.js';
import { clamp } from './random.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot'); // start | play | end | null
const shotLeg = clamp(parseInt(params.get('leg') ?? '0', 10) || 0, 0, LEGS.length - 1);

const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

const BEST_KEY = 'skycourier-best';
let best = 0;
try {
  best = parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
} catch {
  best = 0;
}

const game = {
  state: 'title', // title | briefing | flying | legComplete | gameOver | win | paused
  legIndex: 0,
  world: null,
  plane: null,
  score: 0,
  legScore: 0,
  legTime: 0,
  legStats: null,
  crashReason: 'terrain',
  message: '',
  messageAt: -99,
  rwyMsgAt: -99,
  particles: [],
  smokeAt: 0,
  pausedFrom: null,
};

function setMessage(text) {
  game.message = text;
  game.messageAt = game.plane ? game.plane.time : 0;
  if (statusEl) statusEl.textContent = text;
}

function burst(x, y, z, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const b = (Math.random() - 0.5) * Math.PI;
    game.particles.push({
      x,
      y,
      z,
      vx: Math.cos(a) * Math.cos(b) * speed * (0.4 + Math.random() * 0.8),
      vy: Math.sin(b) * speed * (0.4 + Math.random() * 0.8),
      vz: Math.sin(a) * Math.cos(b) * speed * (0.4 + Math.random() * 0.8),
      life: 1.1,
      maxLife: 1.1,
      color,
      size: 5 + Math.random() * 7,
    });
  }
}

function updateParticles(dt) {
  for (const p of game.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vy -= 6 * dt;
    p.life -= dt;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
}

function startLeg(index) {
  game.legIndex = index;
  game.world = buildWorld(index);
  game.plane = createPlane(game.world);
  game.plane.speedKts = 0;
  game.plane.throttle = 0;
  game.legScore = 0;
  game.legTime = 0;
  game.particles = [];
  game.message = '';
  game.state = 'briefing';
}

function startFlying() {
  game.state = 'flying';
  game.plane.throttle = 0.55;
  setMessage('THROTTLE UP — FLY THE RINGS');
  audio.unlock();
}

function finishLeg() {
  const p = game.plane;
  const leg = game.world.leg;
  const timeBonus = Math.max(0, Math.round((leg.parSeconds - game.legTime) * SCORE.legTimeBonusPerSec));
  const hullBonus = Math.round(p.hull) * SCORE.hullBonusPerPoint;
  const fuelBonus = Math.round(p.fuel) * SCORE.fuelBonusPerPoint;
  const legScore = SCORE.legLanding + timeBonus + hullBonus + fuelBonus + game.legScore;
  game.score += legScore;
  game.legStats = {
    landing: SCORE.legLanding,
    timeBonus,
    hullBonus,
    fuelBonus,
    legScore,
    total: game.score,
    last: game.legIndex === LEGS.length - 1,
  };
  audio.fanfare();
  game.state = 'legComplete';
}

function endRun(won) {
  if (game.score > best) {
    best = game.score;
    try {
      window.localStorage.setItem(BEST_KEY, String(best));
    } catch {
      /* storage unavailable */
    }
  }
  game.state = won ? 'win' : 'gameOver';
}

function applyEvents(events) {
  const p = game.plane;
  for (const ev of events) {
    if (ev.type === 'ring') {
      const pts = SCORE.ring + (ev.centre ? SCORE.ringCenterBonus : 0);
      game.score += pts;
      game.legScore += pts;
      burst(ev.ring.x, ev.ring.y, ev.ring.z, 'rgba(255,211,77,A)', 26, 160);
      audio.ring(ev.centre);
      setMessage(ev.centre ? `DEAD CENTRE! +${pts}` : `RING! +${pts}  ·  FUEL +9`);
    } else if (ev.type === 'ringMissed') {
      setMessage('RING MISSED — KEEP FLYING THE COURSE');
    } else if (ev.type === 'crate') {
      game.score += SCORE.crate;
      game.legScore += SCORE.crate;
      burst(ev.crate.x, ev.crate.y, ev.crate.z, 'rgba(141,255,154,A)', 18, 120);
      audio.crate();
      setMessage(`SUPPLY CRATE +${SCORE.crate}`);
    } else if (ev.type === 'storm') {
      if (Math.random() < 0.06) audio.alarm();
    } else if (ev.type === 'scrape') {
      burst(p.x, p.y - 10, p.z, 'rgba(120,120,120,A)', 6, 60);
    } else if (ev.type === 'lowFuel') {
      audio.alarm();
      setMessage('LOW FUEL — FLY A RING TO TOP UP');
    } else if (ev.type === 'fuelEmpty') {
      audio.alarm();
      setMessage('FUEL EMPTY — GLIDE HER DOWN');
    } else if (ev.type === 'touchdown') {
      audio.touchdown();
      setMessage('TOUCHDOWN — ROLLING OUT');
    } else if (ev.type === 'takeoff') {
      setMessage('AIRBORNE AGAIN');
    } else if (ev.type === 'landed') {
      finishLeg();
    } else if (ev.type === 'crash') {
      game.crashReason = ev.reason;
      burst(p.x, p.y, p.z, 'rgba(255,120,40,A)', 42, 260);
      burst(p.x, p.y, p.z, 'rgba(90,90,90,A)', 30, 140);
      audio.crash();
      endRun(false);
    }
  }
}

function update(dt) {
  const p = game.plane;
  const world = game.world;
  if (game.state === 'title') {
    // Attract mode: the autopilot flies the dawn leg behind the title.
    const target = world.nextRing() ?? { x: world.runway.x, y: 900, z: world.runway.z };
    const steer = autopilotSteer(p, target, world);
    const events = [];
    if (p.speedKts < 10) p.throttle = 0.8;
    updatePlane(p, { roll: steer.roll, pitch: steer.pitch, throttle: null }, world, dt, events);
    // Attract mode never turns back: a ring left behind is skipped silently.
    for (const ring of world.rings) {
      if (!ring.passed && ring.z < p.z - 600) ring.passed = true;
    }
    if (world.ringsLeft() === 0) {
      // Loop the attract flight: rebuild the leg and keep flying.
      game.world = buildWorld(0);
      game.plane = createPlane(game.world);
      game.plane.speedKts = 170;
      game.plane.throttle = 0.75;
      game.plane.z = 3000;
    }
    updateParticles(dt);
    return;
  }
  if (game.state !== 'flying') return;

  game.legTime += dt;
  const steer = input.steer();
  const events = [];
  updatePlane(
    p,
    { roll: steer.roll, pitch: steer.pitch, throttle: input.throttle() },
    world,
    dt,
    events,
  );
  applyEvents(events);

  // All rings flown: guide the pilot onto the strip.
  if (world.ringsLeft() === 0 && p.time - game.rwyMsgAt > 7) {
    game.rwyMsgAt = p.time;
    const dist = Math.round(Math.hypot(world.runway.x - p.x, world.runway.z - p.z));
    setMessage(`RUNWAY ${dist.toLocaleString()} FT AHEAD — LINE UP AND DESCEND`);
  }

  // Smoke when she is hurt or in a storm.
  game.smokeAt -= dt;
  if ((p.hull < 55 || p.inStorm) && game.smokeAt <= 0 && !p.onGround) {
    game.smokeAt = 0.09;
    game.particles.push({
      x: p.x + (Math.random() - 0.5) * 10,
      y: p.y - 4,
      z: p.z - 30,
      vx: 0,
      vy: 6,
      vz: -40,
      life: 1.4,
      maxLife: 1.4,
      color: p.inStorm ? 'rgba(200,200,210,A)' : 'rgba(90,90,90,A)',
      size: 9,
    });
  }
  updateParticles(dt);
  audio.update(p.throttle, p.speedKts, !p.onGround);
}

function render() {
  const W = renderer.width;
  const H = renderer.height;
  const ctx = canvas.getContext('2d');
  renderer.drawScene(game.world, game.plane, game.particles, game.plane.time);
  if (game.state === 'title') {
    drawTitle(ctx, W, H, best);
  } else if (game.state === 'briefing') {
    drawHUD(ctx, W, H, game);
    drawBriefing(ctx, W, H, game.world.leg);
  } else if (game.state === 'flying' || game.state === 'paused') {
    drawHUD(ctx, W, H, game);
    if (game.state === 'paused') drawPaused(ctx, W, H);
  } else if (game.state === 'legComplete') {
    drawHUD(ctx, W, H, game);
    drawLegComplete(ctx, W, H, game.legStats);
  } else if (game.state === 'gameOver') {
    drawGameOver(ctx, W, H, game.crashReason, game.score);
  } else if (game.state === 'win') {
    drawWin(ctx, W, H, game.score, best);
  }
}

function handleKeys() {
  if (input.wasPressed('Enter') || input.wasPressed('NumpadEnter')) {
    audio.unlock();
    if (game.state === 'title') {
      startLeg(0);
      audio.click();
    } else if (game.state === 'briefing') {
      startFlying();
      audio.click();
    } else if (game.state === 'legComplete') {
      if (game.legStats.last) {
        endRun(true);
      } else {
        startLeg(game.legIndex + 1);
      }
      audio.click();
    } else if (game.state === 'gameOver' || game.state === 'win') {
      game.score = 0;
      startLeg(0);
      audio.click();
    }
  }
  if (input.wasPressed('KeyP') && game.state === 'flying') {
    game.state = 'paused';
  } else if (input.wasPressed('KeyP') && game.state === 'paused') {
    game.state = 'flying';
  }
  if (input.wasPressed('KeyM')) {
    audio.toggleMute();
  }
  if (input.wasPressed('KeyR')) {
    game.score = 0;
    startLeg(0);
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  handleKeys();
  update(dt);
  render();
  input.endFrame();
  requestAnimationFrame(frame);
}

// --- deterministic screenshot setups ---------------------------------------
// ?shot=start  title over a live attract flight
// ?shot=play   mid-flight, rings ahead, HUD lit (add &leg=1 for the storm leg)
// ?shot=end    leg-complete panel over the runway after a landing
function setupShot() {
  const leg = shotLeg;
  if (shotMode === 'start') {
    game.world = buildWorld(0);
    game.plane = createPlane(game.world);
    game.plane.speedKts = 175;
    game.plane.throttle = 0.75;
    game.plane.z = 3000;
    game.plane.y = 900;
    game.plane.onGround = false; // placed mid-air: she is already flying
    game.state = 'title';
    for (let i = 0; i < 120; i++) update(1 / 60);
    render();
  } else if (shotMode === 'play') {
    game.world = buildWorld(leg);
    game.plane = createPlane(game.world);
    game.plane.speedKts = 190;
    game.plane.throttle = 0.8;
    if (leg === 0) {
      // Dawn leg: start before the first ring so the whole course lies ahead.
      game.plane.z = 800;
      game.plane.y = 900;
    } else {
      // Storm leg: two rings already flown, the squall line right ahead.
      game.world.rings[0].passed = true;
      game.world.rings[1].passed = true;
      game.plane.z = 6000;
      game.plane.y = 1100;
    }
    game.plane.onGround = false; // placed mid-air: she is already flying
    game.state = 'flying';
    // Fly the autopilot for a few seconds so the plane is banked into a ring
    // and the score, rings and message are all real, earned in the sim.
    for (let i = 0; i < 480; i++) {
      const target = game.world.nextRing() ?? { x: game.world.runway.x, y: 900, z: game.world.runway.z };
      const steer = autopilotSteer(game.plane, target, game.world);
      const events = [];
      updatePlane(game.plane, { roll: steer.roll, pitch: steer.pitch, throttle: null }, game.world, 1 / 60, events);
      applyEvents(events);
      game.legTime += 1 / 60;
      updateParticles(1 / 60);
    }
    render();
  } else if (shotMode === 'end') {
    game.world = buildWorld(0);
    game.plane = createPlane(game.world);
    game.plane.x = game.world.runway.x;
    game.plane.z = game.world.runway.z;
    game.plane.y = game.world.runway.y + 8;
    game.plane.heading = 0;
    game.plane.speedKts = 0;
    game.plane.throttle = 0;
    game.plane.onGround = true;
    game.state = 'legComplete';
    game.score = 2140;
    game.legStats = {
      landing: 250,
      timeBonus: 96,
      hullBonus: 184,
      fuelBonus: 61,
      legScore: 591,
      total: 2140,
      last: false,
    };
    for (const r of game.world.rings) r.passed = true;
    render();
  }
  window.__shotReady = true;
  document.title = 'SHOT-READY';
}

// --- boot -------------------------------------------------------------------
game.world = buildWorld(0);
game.plane = createPlane(game.world);
if (shotMode) {
  setupShot();
} else {
  requestAnimationFrame(frame);
}
