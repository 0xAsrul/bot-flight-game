// The HUD and the screens: instruments, compass, fuel and hull, warnings,
// title, briefings and results — all drawn on the canvas so the screenshots
// show the game exactly as the pilot sees it.

import { clamp } from './random.js';

function panel(ctx, x, y, w, h, alpha = 0.62) {
  ctx.fillStyle = `rgba(8,14,26,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function bar(ctx, x, y, w, h, frac, color, bg = 'rgba(255,255,255,0.18)') {
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(h, w * clamp(frac, 0, 1)), h, h / 2);
  ctx.fill();
}

export function drawHUD(ctx, W, H, game) {
  const { plane, world, score, legTime, message, messageAt } = game;
  const leg = world.leg;
  const time = plane.time;

  // --- speed, top left ---
  panel(ctx, 16, 14, 168, 92);
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(plane.speedKts)}`, 30, 52);
  ctx.fillStyle = '#fff';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('KTS', 104, 50);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('THROTTLE', 30, 74);
  bar(ctx, 30, 80, 124, 10, plane.throttle, plane.engineOut ? '#888' : '#7fe7ff');
  if (plane.engineOut) {
    ctx.fillStyle = '#ff5a4d';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('ENGINE OUT', 30, 100);
  }

  // --- compass, top centre ---
  const headingDeg = Math.round(((plane.heading * 180) / Math.PI % 360 + 360) % 360);
  panel(ctx, W / 2 - 150, 14, 300, 56);
  ctx.save();
  ctx.beginPath();
  ctx.rect(W / 2 - 150, 14, 300, 56);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const marks = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  for (let d = -90; d <= 90; d += 30) {
    const deg = (headingDeg + d + 360) % 360;
    const x = W / 2 + d * 1.6;
    const isCard = deg % 45 === 0;
    ctx.fillStyle = isCard ? '#ffd34d' : 'rgba(255,255,255,0.75)';
    ctx.font = isCard ? 'bold 13px system-ui, sans-serif' : '11px system-ui, sans-serif';
    ctx.fillText(isCard ? marks[Math.round(deg / 45) % 8] : '', x, 36);
    ctx.fillRect(x - 0.5, 44, 1, isCard ? 10 : 6);
  }
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${String(headingDeg).padStart(3, '0')}°`, W / 2, 64);
  ctx.fillStyle = '#ff5a4d';
  ctx.beginPath();
  ctx.moveTo(W / 2, 16);
  ctx.lineTo(W / 2 - 5, 8);
  ctx.lineTo(W / 2 + 5, 8);
  ctx.closePath();
  ctx.fill();

  // --- altitude, top right ---
  panel(ctx, W - 184, 14, 168, 92);
  ctx.fillStyle = '#7fe7ff';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(Math.max(0, plane.y))}`, W - 170, 52);
  ctx.fillStyle = '#fff';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('FT', W - 58, 50);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '12px system-ui, sans-serif';
  const vs = plane.vsFps;
  ctx.fillText(`VERT ${vs >= 0 ? '+' : ''}${Math.round(vs)} FT/S`, W - 170, 74);
  ctx.fillStyle = vs > 4 ? '#8dff9a' : vs < -6 ? '#ff9a8a' : 'rgba(255,255,255,0.75)';
  ctx.fillText(vs > 4 ? '▲ CLIMBING' : vs < -6 ? '▼ DESCENDING' : '— LEVEL', W - 170, 94);

  // --- fuel + hull, bottom left ---
  panel(ctx, 16, H - 96, 220, 80);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('FUEL', 30, H - 72);
  bar(ctx, 30, H - 64, 170, 12, plane.fuel / 100, plane.fuel < 20 ? '#ff5a4d' : '#ffb347');
  ctx.fillText('HULL', 30, H - 38);
  bar(ctx, 30, H - 30, 170, 12, plane.hull / 100, plane.hull < 30 ? '#ff5a4d' : '#8dff9a');
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(plane.fuel)}%`, 206, H - 55);
  ctx.fillText(`${Math.round(plane.hull)}%`, 206, H - 21);

  // --- score + mission, bottom right ---
  panel(ctx, W - 236, H - 96, 220, 80);
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${score.toLocaleString()}`, W - 30, H - 62);
  ctx.fillStyle = '#fff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('SCORE', W - 30, H - 76);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textAlign = 'left';
  ctx.fillText(`RINGS ${world.leg.rings - world.ringsLeft()}/${world.leg.rings}`, W - 222, H - 38);
  ctx.textAlign = 'right';
  ctx.fillText(`${leg.short.toUpperCase()}  ·  ${Math.floor(legTime / 60)}:${String(Math.floor(legTime % 60)).padStart(2, '0')}`, W - 30, H - 38);

  // --- attitude indicator, bottom centre ---
  const ax = W / 2;
  const ay = H - 56;
  const ar = 34;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#3a6ea5';
  ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
  ctx.translate(ax, ay);
  ctx.rotate(-plane.bank);
  ctx.translate(0, clamp(plane.pitch * 60, -ar, ar));
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-ar, 0, ar * 2, ar);
  ctx.fillStyle = '#cfe8ff';
  ctx.fillRect(-ar, -ar, ar * 2, ar);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#ffd34d';
  ctx.beginPath();
  ctx.moveTo(ax - 14, ay);
  ctx.lineTo(ax + 14, ay);
  ctx.moveTo(ax, ay - 4);
  ctx.lineTo(ax, ay + 4);
  ctx.stroke();

  // --- warnings ---
  const warnings = [];
  if (plane.fuel < 20 && !plane.engineOut) warnings.push('LOW FUEL');
  if (plane.speedKts < 62 && !plane.onGround) warnings.push('STALL');
  if (plane.inStorm) warnings.push('STORM — FLY CLEAR');
  const ground = world.terrainHeight(plane.x, plane.z);
  if (plane.y - ground < 220 && !plane.onGround) warnings.push('TERRAIN');
  if (warnings.length > 0 && Math.sin(time * 8) > -0.2) {
    ctx.fillStyle = '#ff5a4d';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`⚠ ${warnings.join('  ·  ')}`, W / 2, 100);
  }

  // Next ring is behind the plane: tell the pilot to turn back for it.
  const nextRing = world.nextRing();
  if (nextRing && nextRing.z < plane.z - 200 && !plane.onGround) {
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('↩  NEXT RING IS BEHIND YOU — TURN BACK  ↪', W / 2, 128);
  }

  // --- transient message ---
  if (message && time - messageAt < 3.2) {
    const a = clamp(3.2 - (time - messageAt), 0, 1);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(message, W / 2, H * 0.3);
  }
}

function titleBlock(ctx, W, H, lines, y0) {
  ctx.textAlign = 'center';
  let y = y0;
  for (const line of lines) {
    ctx.font = line.font;
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, W / 2, y);
    y += line.gap;
  }
  return y;
}

export function drawTitle(ctx, W, H, best) {
  ctx.fillStyle = 'rgba(6,10,20,0.45)';
  ctx.fillRect(0, 0, W, H);
  titleBlock(ctx, W, H, [
    { text: 'SKY COURIER', font: 'bold 64px system-ui, sans-serif', color: '#ffd34d', gap: 74 },
    { text: 'A U R O R A   R U N', font: 'bold 26px system-ui, sans-serif', color: '#fff', gap: 46 },
    { text: 'Fly the mail route across the Maraluna chain — rings, storms, three legs, one strip.', font: '17px system-ui, sans-serif', color: 'rgba(255,255,255,0.9)', gap: 30 },
    { text: 'Arrows / WASD — fly   ·   Shift — throttle up   ·   Ctrl — throttle down   ·   Mouse — steer', font: '15px system-ui, sans-serif', color: 'rgba(255,255,255,0.75)', gap: 30 },
    { text: 'P — pause   ·   M — mute   ·   R — restart', font: '15px system-ui, sans-serif', color: 'rgba(255,255,255,0.75)', gap: 64 },
  ], H * 0.2);
  if (best > 0) {
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(`BEST SCORE  ${best.toLocaleString()}`, W / 2, H * 0.2 + 240);
  }
  ctx.fillStyle = Math.sin(Date.now() / 350) > -0.4 ? '#fff' : 'rgba(255,255,255,0.35)';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('—  PRESS ENTER TO FLY  —', W / 2, H * 0.78);
}

export function drawBriefing(ctx, W, H, leg) {
  ctx.fillStyle = 'rgba(6,10,20,0.55)';
  ctx.fillRect(0, 0, W, H);
  panel(ctx, W / 2 - 330, H * 0.22, 660, 300, 0.78);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText(leg.name.toUpperCase(), W / 2, H * 0.22 + 52);
  ctx.fillStyle = '#7fe7ff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(`${leg.rings} RINGS  ·  ${leg.crates} CRATES  ·  ${leg.storms} STORM CELLS  ·  PAR ${Math.floor(leg.parSeconds / 60)}:${String(leg.parSeconds % 60).padStart(2, '0')}`, W / 2, H * 0.22 + 82);
  ctx.fillStyle = '#fff';
  ctx.font = '17px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const lines = wrapText(ctx, leg.briefing, 600);
  let y = H * 0.22 + 118;
  for (const line of lines) {
    ctx.fillText(line, W / 2 - 300, y);
    y += 26;
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = Math.sin(Date.now() / 350) > -0.4 ? '#fff' : 'rgba(255,255,255,0.35)';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('—  PRESS ENTER TO TAKE OFF  —', W / 2, H * 0.22 + 268);
}

export function drawLegComplete(ctx, W, H, stats) {
  ctx.fillStyle = 'rgba(6,10,20,0.55)';
  ctx.fillRect(0, 0, W, H);
  panel(ctx, W / 2 - 300, H * 0.24, 600, 320, 0.8);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8dff9a';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('LEG COMPLETE', W / 2, H * 0.24 + 56);
  ctx.fillStyle = '#fff';
  ctx.font = '17px system-ui, sans-serif';
  const rows = [
    ['Landing bonus', stats.landing],
    ['Time bonus', stats.timeBonus],
    ['Hull bonus', stats.hullBonus],
    ['Fuel bonus', stats.fuelBonus],
    ['Leg score', stats.legScore],
    ['Total score', stats.total],
  ];
  let y = H * 0.24 + 100;
  for (const [label, value] of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(label, W / 2 - 250, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = value === stats.total || value === stats.legScore ? '#ffd34d' : '#fff';
    ctx.font = value === stats.total ? 'bold 19px system-ui, sans-serif' : '17px system-ui, sans-serif';
    ctx.fillText(`+${value.toLocaleString()}`, W / 2 + 250, y);
    ctx.font = '17px system-ui, sans-serif';
    y += 32;
  }
  ctx.fillStyle = Math.sin(Date.now() / 350) > -0.4 ? '#fff' : 'rgba(255,255,255,0.35)';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(stats.last ? '—  PRESS ENTER FOR THE FINAL RESULT  —' : '—  PRESS ENTER FOR THE NEXT LEG  —', W / 2, H * 0.24 + 292);
}

export function drawGameOver(ctx, W, H, reason, score) {
  ctx.fillStyle = 'rgba(20,4,6,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5a4d';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.fillText(reason === 'ditched' ? 'DITCHED IN THE SEA' : reason === 'hull' ? 'AIRFRAME LOST' : 'CRASHED', W / 2, H * 0.34);
  ctx.fillStyle = '#fff';
  ctx.font = '18px system-ui, sans-serif';
  const sub =
    reason === 'ditched'
      ? 'She went into the water. The mail is lost — but the pilot swam home.'
      : reason === 'hull'
        ? 'Too many knocks: the Kestrel came apart in the air.'
        : 'The Maraluna hills are unforgiving. Mind the terrain next time.';
  ctx.fillText(sub, W / 2, H * 0.34 + 40);
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(`SCORE  ${score.toLocaleString()}`, W / 2, H * 0.34 + 92);
  ctx.fillStyle = Math.sin(Date.now() / 350) > -0.4 ? '#fff' : 'rgba(255,255,255,0.35)';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('—  PRESS ENTER TO FLY AGAIN  —', W / 2, H * 0.34 + 150);
}

export function drawWin(ctx, W, H, score, best) {
  ctx.fillStyle = 'rgba(6,12,24,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.fillText('ROUTE COMPLETE!', W / 2, H * 0.3);
  ctx.fillStyle = '#fff';
  ctx.font = '19px system-ui, sans-serif';
  ctx.fillText('Three legs, three landings. The mail is through and the Kestrel is home.', W / 2, H * 0.3 + 42);
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText(`FINAL SCORE  ${score.toLocaleString()}`, W / 2, H * 0.3 + 104);
  if (score >= best && score > 0) {
    ctx.fillStyle = '#8dff9a';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('★ NEW BEST SCORE ★', W / 2, H * 0.3 + 142);
  }
  ctx.fillStyle = Math.sin(Date.now() / 350) > -0.4 ? '#fff' : 'rgba(255,255,255,0.35)';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('—  PRESS ENTER TO FLY THE ROUTE AGAIN  —', W / 2, H * 0.3 + 196);
}

export function drawPaused(ctx, W, H) {
  ctx.fillStyle = 'rgba(6,10,20,0.5)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText('PAUSED', W / 2, H * 0.45);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('P — resume   ·   R — restart the route', W / 2, H * 0.45 + 36);
}
