// The chase-view renderer: sky, sun, sea, perspective island terrain, rings,
// clouds, storms, the runway, the Kestrel herself and particles — all on one canvas.

import { WORLD } from './config.js';
import { clamp, lerp } from './random.js';

const SLICES = 40; // terrain depth slices, far to near
const SAMPLES = 33; // lateral samples per slice

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function groundColor(h, x, z, world, depthFrac) {
  const sky = world.leg.sky;
  let c;
  if (h < 3) {
    const w = 0.94 + 0.06 * Math.sin(x * 0.05 + z * 0.03);
    const sea = hexRgb(world.leg.sea);
    c = [sea[0] * w, sea[1] * w, sea[2] * w];
  } else if (h < 42) c = hexRgb('#d9c08a'); // sand
  else if (h < 700) c = hexRgb('#5d8a4a'); // meadow
  else if (h < 1400) c = hexRgb('#3f6b3a'); // forest
  else if (h < 2100) c = hexRgb('#7a6a58'); // rock
  else c = hexRgb('#e8e6df'); // snow
  if (depthFrac > 0.55) {
    const hz = hexRgb(sky.haze);
    const t = (depthFrac - 0.55) / 0.45;
    c = [lerp(c[0], hz[0], t), lerp(c[1], hz[1], t), lerp(c[2], hz[2], t)];
  }
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let focal = 600;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    focal = (H / 2) / Math.tan(((WORLD.fovDeg * Math.PI) / 180 / 2));
  }
  resize();
  window.addEventListener('resize', resize);

  /** Camera basis from the plane: chase position, look-ahead, roll with the bank. */
  function camera(plane) {
    const fx = Math.sin(plane.heading);
    const fz = Math.cos(plane.heading);
    const cam = {
      x: plane.x - fx * 165,
      y: plane.y + 52,
      z: plane.z - fz * 165,
    };
    let f = norm3(fx, plane.pitch * 0.6, fz);
    const look = { x: plane.x + fx * 600, y: plane.y + 26, z: plane.z + fz * 600 };
    f = norm3(look.x - cam.x, look.y - cam.y, look.z - cam.z);
    const rc = cross(f, { x: 0, y: 1, z: 0 });
    let r = norm3(rc.x, rc.y, rc.z);
    let u = cross(r, f);
    // Roll the camera with the wings, at half strength so the horizon tilts but stays readable.
    const a = plane.bank * 0.5;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const r2 = { x: r.x * ca + u.x * sa, y: r.y * ca + u.y * sa, z: r.z * ca + u.z * sa };
    const u2 = { x: -r.x * sa + u.x * ca, y: -r.y * sa + u.y * ca, z: -r.z * sa + u.z * ca };
    return { cam, f, r: r2, u: u2 };
  }

  function norm3(x, y, z) {
    const l = Math.hypot(x, y, z) || 1;
    return { x: x / l, y: y / l, z: z / l };
  }
  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }
  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function project(p, cam) {
    const d = { x: p.x - cam.cam.x, y: p.y - cam.cam.y, z: p.z - cam.cam.z };
    const cz = dot(d, cam.f);
    if (cz < WORLD.nearClip) return null;
    const cx = dot(d, cam.r);
    const cy = dot(d, cam.u);
    return {
      x: W / 2 + (cx * focal) / cz,
      y: H / 2 - (cy * focal) / cz,
      s: focal / cz,
      d: cz,
    };
  }

  function drawTerrain(cam, world) {
    // Far sea first, so the horizon is water even where no slice reaches.
    const horizonP = project(
      { x: cam.cam.x + cam.f.x * 9000, y: 0, z: cam.cam.z + cam.f.z * 9000 },
      cam,
    );
    const horizonY = horizonP ? horizonP.y : H * 0.42;
    ctx.fillStyle = world.leg.sea;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    // Depth slices, far to near so near ground overlaps far ground.
    const depths = [];
    for (let k = 0; k < SLICES; k++) {
      depths.push(120 * Math.pow(WORLD.viewDistance / 120, k / (SLICES - 1)));
    }
    const halfTan = Math.tan(((WORLD.fovDeg * 1.25 * Math.PI) / 180 / 2));
    // Precompute each slice's projected points.
    const rows = [];
    for (let k = 0; k < SLICES; k++) {
      const d = depths[k];
      const spread = d * halfTan * 1.25;
      const pts = [];
      for (let j = 0; j < SAMPLES; j++) {
        const lat = -spread + (2 * spread * j) / (SAMPLES - 1);
        const wx = cam.cam.x + cam.f.x * d + cam.r.x * lat;
        const wz = cam.cam.z + cam.f.z * d + cam.r.z * lat;
        const h = world.terrainHeight(wx, wz);
        const p = project({ x: wx, y: h, z: wz }, cam);
        pts.push({ p, h, x: wx, z: wz });
      }
      rows.push(pts);
    }
    for (let k = SLICES - 1; k > 0; k--) {
      const far = rows[k];
      const near = rows[k - 1];
      const depthFrac = depths[k] / WORLD.viewDistance;
      for (let j = 0; j < SAMPLES - 1; j++) {
        const a = far[j].p;
        const b = far[j + 1].p;
        const c = near[j + 1].p;
        const e = near[j].p;
        if (!a || !b || !c || !e) continue;
        ctx.fillStyle = groundColor(near[j].h, near[j].x, near[j].z, world, depthFrac);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(e.x, e.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawSky(cam, world, time) {
    const sky = world.leg.sky;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.42, sky.mid);
    g.addColorStop(0.62, sky.low);
    g.addColorStop(1, sky.haze);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // The sun, fixed in the world so it parallaxes with the heading.
    const sunDir = norm3(0.55, 0.22, 0.8);
    const sunP = project(
      { x: cam.cam.x + sunDir.x * 9000, y: cam.cam.y + sunDir.y * 9000, z: cam.cam.z + sunDir.z * 9000 },
      cam,
    );
    if (sunP) {
      const glow = ctx.createRadialGradient(sunP.x, sunP.y, 4, sunP.x, sunP.y, 150);
      glow.addColorStop(0, sky.sun);
      glow.addColorStop(0.25, 'rgba(255,220,150,0.55)');
      glow.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sunP.x - 150, sunP.y - 150, 300, 300);
      ctx.fillStyle = sky.sun;
      ctx.beginPath();
      ctx.arc(sunP.x, sunP.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    void time;
  }

  function drawClouds(cam, world, time) {
    const items = [];
    for (const c of world.clouds) {
      const p = project({ x: c.x + c.drift * time, y: c.y, z: c.z }, cam);
      if (p) items.push({ p, c, storm: false });
    }
    for (const s of world.storms) {
      const p = project({ x: s.x, y: s.y, z: s.z }, cam);
      if (p) items.push({ p, c: s, storm: true });
    }
    items.sort((a, b) => b.p.d - a.p.d);
    for (const { p, c, storm } of items) {
      const r = c.size * p.s;
      if (r < 2) continue;
      const puffs = storm ? 6 : c.puffs;
      for (let i = 0; i < puffs; i++) {
        const ang = (i / puffs) * Math.PI * 2 + c.seed;
        const px = p.x + Math.cos(ang) * r * 0.55;
        const py = p.y + Math.sin(ang) * r * 0.22 - r * 0.1;
        const pr = r * (0.45 + 0.2 * Math.sin(c.seed + i * 2.3));
        if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pr) || pr <= 0) continue;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
        if (storm) {
          grad.addColorStop(0, `rgba(52,52,74,${0.92 * (1 - p.d / 9000)})`);
          grad.addColorStop(1, 'rgba(52,52,74,0)');
        } else {
          grad.addColorStop(0, `rgba(255,255,255,${0.85 * (1 - p.d / 9000)})`);
          grad.addColorStop(1, 'rgba(255,255,255,0)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
      if (storm && c.flash > 0) {
        // Lightning: a jagged bolt under the anvil.
        ctx.strokeStyle = `rgba(255,246,180,${c.flash})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        let bx = p.x;
        let by = p.y + r * 0.4;
        ctx.moveTo(bx, by);
        for (let i = 0; i < 5; i++) {
          bx += (Math.random() - 0.5) * 26;
          by += 26;
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
      }
    }
  }

  function drawRing(cam, ring, isNext, time, plane) {
    const p = project({ x: ring.x, y: ring.y, z: ring.z }, cam);
    if (!p) return;
    const r = ring.radius * p.s;
    if (r < 3) return;
    const pulse = isNext ? 1 + 0.12 * Math.sin(time * 5) : 1;
    const rr = r * pulse;
    const col = ring.passed ? 'rgba(120,220,140,0.85)' : isNext ? '#ffd34d' : '#7fe7ff';
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(3, rr * 0.09);
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1.5, rr * 0.03);
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr * 0.82, 0, Math.PI * 2);
    ctx.stroke();
    // Chevron pointing through.
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - rr * 0.45);
    ctx.lineTo(p.x + rr * 0.28, p.y);
    ctx.lineTo(p.x, p.y + rr * 0.45);
    ctx.lineTo(p.x - rr * 0.28, p.y);
    ctx.closePath();
    ctx.fill();
    // A faint beam down to the ground so the pilot can judge the height.
    const groundP = project({ x: ring.x, y: 0, z: ring.z }, cam);
    if (groundP) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + rr);
      ctx.lineTo(groundP.x, groundP.y);
      ctx.stroke();
    }
    if (isNext) {
      const dist = Math.max(0, Math.hypot(ring.x - plane.x, ring.z - plane.z));
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(13, Math.min(18, rr * 0.22))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${Math.round(dist)} FT`, p.x, p.y - rr - 12);
    }
    ctx.restore();
  }

  function drawCrate(cam, crate, time) {
    const bobY = crate.y + Math.sin(time * 0.8 + crate.bobPhase) * crate.bobAmp;
    const p = project({ x: crate.x, y: bobY, z: crate.z }, cam);
    if (!p || p.d > 6000) return;
    const s = crate.taken ? 0 : 34 * p.s;
    if (s < 2) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    // Parachute canopy.
    ctx.fillStyle = '#ff7a59';
    ctx.beginPath();
    ctx.arc(0, -s * 0.9, s * 0.85, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.8, -s * 0.9);
    ctx.lineTo(0, 0);
    ctx.moveTo(s * 0.8, -s * 0.9);
    ctx.lineTo(0, 0);
    ctx.stroke();
    // The crate.
    ctx.fillStyle = '#c98f3d';
    ctx.fillRect(-s * 0.55, 0, s * 1.1, s * 0.9);
    ctx.strokeStyle = '#7a4d16';
    ctx.lineWidth = 2;
    ctx.strokeRect(-s * 0.55, 0, s * 1.1, s * 0.9);
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, 0);
    ctx.lineTo(s * 0.55, s * 0.9);
    ctx.moveTo(s * 0.55, 0);
    ctx.lineTo(-s * 0.55, s * 0.9);
    ctx.stroke();
    ctx.restore();
  }

  function drawRunway(cam, world) {
    const rwy = world.runway;
    const halfL = rwy.length / 2;
    const halfW = rwy.width / 2;
    const corners = [
      { x: rwy.x - halfW, y: rwy.y + 2, z: rwy.z - halfL },
      { x: rwy.x + halfW, y: rwy.y + 2, z: rwy.z - halfL },
      { x: rwy.x + halfW, y: rwy.y + 2, z: rwy.z + halfL },
      { x: rwy.x - halfW, y: rwy.y + 2, z: rwy.z + halfL },
    ].map((p) => project(p, cam));
    if (corners.some((p) => p === null)) return;
    ctx.fillStyle = '#33363d';
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes.
    ctx.fillStyle = '#f5f2e8';
    for (let d = -halfL + 120; d < halfL - 60; d += 260) {
      const a = project({ x: rwy.x, y: rwy.y + 3, z: rwy.z + d }, cam);
      const b = project({ x: rwy.x, y: rwy.y + 3, z: rwy.z + d + 130 }, cam);
      if (!a || !b) continue;
      ctx.fillRect(Math.min(a.x, b.x) - 2, Math.min(a.y, b.y), Math.abs(b.x - a.x) + 4, Math.abs(b.y - a.y) + 3);
    }
    // Edge lights.
    for (let d = -halfL; d <= halfL; d += 320) {
      for (const side of [-1, 1]) {
        const p = project({ x: rwy.x + side * halfW, y: rwy.y + 4, z: rwy.z + d }, cam);
        if (!p) continue;
        ctx.fillStyle = '#ffd34d';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.5, 3 * p.s), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Threshold bar at the near end.
    const t = project({ x: rwy.x, y: rwy.y + 4, z: rwy.z - halfL }, cam);
    if (t) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(12, 20 * t.s)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('07', t.x, t.y - 14);
    }
  }

  function drawPlane(plane, time) {
    // The Kestrel, seen from behind and above: tail near the camera, nose away.
    const cx = W / 2;
    const cy = H * 0.66;
    const scale = Math.min(W, H) / 620;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(plane.bank);
    ctx.scale(scale, scale);
    // Prop wash shimmer behind the wings.
    // Wings (seen from above-behind, slight dihedral).
    ctx.fillStyle = '#e8b64c';
    ctx.beginPath();
    ctx.moveTo(-150, 6);
    ctx.lineTo(-30, -14);
    ctx.lineTo(30, -14);
    ctx.lineTo(150, 6);
    ctx.lineTo(146, 18);
    ctx.lineTo(0, -2);
    ctx.lineTo(-146, 18);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8a6420';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Fuselage: tail at the bottom (near camera), nose toward the top.
    const fg = ctx.createLinearGradient(0, 70, 0, -120);
    fg.addColorStop(0, '#f4ede0');
    fg.addColorStop(0.55, '#e2574c');
    fg.addColorStop(1, '#c23b32');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-16, 74);
    ctx.quadraticCurveTo(-22, 10, -13, -78);
    ctx.quadraticCurveTo(-8, -116, 0, -122);
    ctx.quadraticCurveTo(8, -116, 13, -78);
    ctx.quadraticCurveTo(22, 10, 16, 74);
    ctx.quadraticCurveTo(0, 84, -16, 74);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7e2a24';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Canopy glass.
    ctx.fillStyle = 'rgba(140,210,235,0.95)';
    ctx.beginPath();
    ctx.ellipse(0, -52, 11, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5b3a1e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Tail fin with the dawn stripe.
    ctx.fillStyle = '#c23b32';
    ctx.beginPath();
    ctx.moveTo(-4, 62);
    ctx.lineTo(-26, 96);
    ctx.lineTo(-8, 96);
    ctx.lineTo(0, 74);
    ctx.lineTo(8, 96);
    ctx.lineTo(26, 96);
    ctx.lineTo(4, 62);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(-26, 88, 52, 5);
    // Registration on the fuselage.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PK-SKY', 0, 34);
    // Nav lights: red port, green starboard, white strobe blinking.
    ctx.fillStyle = '#ff2e2e';
    ctx.beginPath();
    ctx.arc(-150, 10, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2eff5e';
    ctx.beginPath();
    ctx.arc(150, 10, 4, 0, Math.PI * 2);
    ctx.fill();
    if (Math.sin(time * 6) > 0.2) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 82, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Prop blur at the nose: a faint disc seen edge-on from behind.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -122, 26 + 6 * Math.sin(time * 40), 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawShadow(cam, plane, world) {
    const ground = world.terrainHeight(plane.x, plane.z);
    if (plane.y - ground > 1400) return;
    const p = project({ x: plane.x, y: ground + 4, z: plane.z }, cam);
    if (!p) return;
    const r = clamp(46 * p.s * (1 - (plane.y - ground) / 1600), 3, 60);
    ctx.fillStyle = `rgba(10,20,30,${0.28 * (1 - (plane.y - ground) / 1500)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * 1.6, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticles(cam, particles) {
    for (const pt of particles) {
      const p = project({ x: pt.x, y: pt.y, z: pt.z }, cam);
      if (!p) continue;
      const a = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color.replace('A', String(a.toFixed(2)));
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, pt.size * p.s * a), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSpeedLines(plane) {
    if (plane.speedKts < 150 || plane.onGround) return;
    const n = Math.floor((plane.speedKts - 140) / 22);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      const x = ((i * 197.3 + plane.time * 300) % (W + 200)) - 100;
      const y = ((i * 311.7) % H);
      const len = 26 + plane.speedKts * 0.12;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * 0.4, y + len);
      ctx.stroke();
    }
  }

  return {
    get width() {
      return W;
    },
    get height() {
      return H;
    },
    resize,
    /** Draw the whole 3D scene for one frame. */
    drawScene(world, plane, particles, time) {
      const cam = camera(plane);
      drawSky(cam, world, time);
      drawTerrain(cam, world);
      drawRunway(cam, world);
      drawClouds(cam, world, time);
      const next = world.nextRing();
      for (const ring of world.rings) {
        if (ring.z < plane.z - 400) continue;
        if (ring.z > plane.z + WORLD.viewDistance) continue;
        drawRing(cam, ring, ring === next, time, plane);
      }
      for (const crate of world.crates) {
        if (!crate.taken) drawCrate(cam, crate, time);
      }
      drawShadow(cam, plane, world);
      drawParticles(cam, particles);
      drawPlane(plane, time);
      drawSpeedLines(plane);
    },
  };
}
