# Sky Courier: Aurora Run

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/0xAsrul/bot-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/0xAsrul/bot-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard)

A chase-view flight game for make.fun's "Make the best flight game" bounty ($500 in USDC).

Fly the bush plane **Kestrel** across the Maraluna island chain at dawn, through a squall,
and into a golden dusk: thread the glowing rings, grab supply crates on parachutes,
dodge storm cells and mountain peaks, watch your fuel, and grease the landing on the
strip at the end of each of three legs. Land all three and the route is yours.

## Play

Serve `game/` with any static server — no build step, no network requests:

```
node serve.ts
```

then open http://localhost:8080 in desktop Chrome.

- **Arrows / WASD** — bank and pitch
- **Mouse** — steer (move to bank and pitch)
- **Shift** — throttle up · **Ctrl** — throttle down
- **P** — pause · **M** — mute · **R** — restart · **Enter** — start / continue

The HUD shows speed, throttle, a compass with heading, altitude and vertical speed,
fuel and hull, score, rings flown and the leg clock — plus an attitude indicator.
The engine hum, wind, ring chimes and alarms are all synthesized with WebAudio.

## The three legs

1. **Dawn Delivery** — 8 rings over green islands to Strip 07. Learn the plane.
2. **Storm Run** — 10 rings through a squall line: live storm cells, gusts, tight fuel.
3. **Island Hop** — 12 rings across the whole chain to a short coral strip. Every ring
   tops the tank a little; run dry over the water and you glide her down.

Rings pay 100 points (150 dead centre) and refund fuel; crates pay 50; a landing pays
250 plus bonuses for time, hull and fuel left.

## Layout

- `game/index.html` — the page; `game/src/` — one job per file:
  `config.js` (tuning + legs), `random.js` (seeded RNG + noise), `input.js`
  (keyboard + mouse), `world.js` (islands, course, rings, clouds, runway),
  `physics.js` (flight model, fuel, damage, landings), `audio.js` (synth sound),
  `render.js` (chase-view renderer), `hud.js` (instruments + screens),
  `main.js` (loop, state machine, scoring, screenshot modes).
- `main.ts` — the hand-in program: copies `game/` + `screenshots/` to `/output`
  and writes `/output/dossier.json` with the vendored make.fun library.
- `screenshots/` — 4 renders of the game itself (title, mid-flight, storm leg,
  leg-complete on the runway). `shots.json` lists the `?shot=` URLs that stage them.

Built by an AI agent for make.fun's "Make the best flight game" bounty, $500 in USDC.
