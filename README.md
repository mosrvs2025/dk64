# Project DK64 — Kong Island

A browser-playable 3D action platformer inspired by the *feel* of Donkey Kong 64. It's one continuous island with no loading screens, secrets everywhere, and abilities that open up new routes. It runs on **desktop and mobile**.

See [`MISSION.md`](MISSION.md) for the design brief this vertical slice was built against.

## Play

```bash
npm install
npm run dev        # http://localhost:5173 (also exposed on your LAN for phone testing)
```

Production build (static files you can host anywhere, e.g. GitHub Pages, Netlify, itch.io):

```bash
npm run build      # outputs dist/
npm run preview    # serve dist/ locally
```

`dist/` uses relative paths, so you can drop it into any folder or subpath.

**GitHub Pages:** `.github/workflows/pages.yml` builds and deploys on every push to `main`. Turn it on once under *Settings → Pages → Source: GitHub Actions*. The game is then playable at `https://<user>.github.io/dk64/` on desktop and phone.

URL flags: `?q=low` forces low quality, `?autostart` skips the title screen.

## Controls

| Action | Keyboard / Mouse | Gamepad | Touch |
|---|---|---|---|
| Move | WASD / Arrows | Left stick | Left-thumb virtual stick |
| Camera | Mouse (click to capture) | Right stick | Drag on the right half |
| Sprint | Shift | LT / L3 | Push the stick all the way |
| Jump | Space | A | ⤒ |
| Attack · in air: **Ground Pound** | Left-click / Z | X | ✊ |
| Special: **Dash**, or **Grapple** when aimed at a ring | Right-click / X | B / RT | 🪝 |
| Lift / drop crates, talk, shop | E | Y | USE |
| Transform (Frog form) | Q | LB / RB | 🐸 |
| Pause | Esc / P | Start | ❚❚ |

## What's in the slice

- **Hub + 3 connected zones + a landmark**, all in one world with no loading screens:
  - **Kong Village**: the hub.
  - **Deep Jungle**: a lagoon, a grunt camp, a canopy climb, and a pit.
  - **Old Stone Tunnel**: runs *under* the cliffs and comes out on the **Ancient Ruins** plateau.
  - **The Caldera**: a volcano with a lava lake and a boss island.
  - **Kong Spire**: a 100 m tower you can see from everywhere. It's sealed until you collect 8 Relics, and the Crown sits at the top.
- **Movement:** coyote time, jump buffering, variable jump height, sprint, dash, ground pound, swimming and wall sliding. **Double Jump** can be bought at the shop.
- **Movement ability:** the **Grapple Hook** (a blueprint in the ruins). Blue rings all over the island open shortcuts and new routes.
- **Transformation:** punch 3 blue jungle frogs to absorb their DNA and unlock **Frog form**. It jumps very high, swims fast and has a 7 m tongue that stuns enemies and pulls in coins.
- **Enemies:**
  - **Grunts** chase you.
  - **Spitters** lob arcing seeds, which you can punch back.
  - **Rollers** are armored chargers you can only hurt while they're dizzy, or with a ground pound or TNT.
  - **Mini-boss: Chieftain Krog** leaps, sends out shockwave rings, and summons backup at half health.
- **Collectibles:**
  - 12 **Relics** open the Spire.
  - 3 **Frog DNA**.
  - 1 **Blueprint**.
  - 20 **secret chests**.
  - ~250 coins that pay for shop upgrades.
- **Physics playground:** you can lift, stack and throw crates. TNT has a fuse and explodes when it lands, and its blast launches you into the air. There are pressure plates and breakable floors.
- **Puzzles with several solutions.** The *Stubborn Pillar* can be solved with a crate staircase, Frog form, the Grapple, a TNT launch, or Double Jump. The *Cracked Floor* breaks with a ground pound or TNT. The *Vault* opens with weights on the plates, or you can hop the wall as a frog. The *Lagoon Needle* works with Frog, Grapple, TNT or crates.
- **Checkpoints**, a HUD, pause, a shop, a victory screen, WebAudio sound effects, and a quality toggle.
- **Autosave:** your progress is saved in the browser, and the title screen offers Continue or New game. The pause menu has an **island map** showing the Relics still out there, checkpoints and grapple rings.
- **Hook training:** grabbing the Grapple blueprint turns the camera toward a ring right next to the altar, with a coin trail and a secret chest on top. After that, every ring has a light beam, and an arrow points to the nearest one.
- **Look:** a rigged, animated Kong, a shader sky, water with shoreline foam, flowing lava, wind-blown grass and trees, bloom and color grading. Low/Medium/High quality settings keep phones smooth.

## Tech

- [three.js](https://threejs.org) + [Vite](https://vitejs.dev). There are no other runtime dependencies, and all art and audio are generated in code.
- Physics is custom and kinematic: an analytic heightfield, AABB boxes and vertical cylinders (`src/physics.js`).
- `src/terrain.js`: island shape (hub, lagoon, cliffs, caldera, tunnel carve)
- `src/world.js`: level layout: every relic, puzzle, secret, enemy and checkpoint
- `src/player.js`: character controller, abilities and forms
- `src/entities.js`: crates/TNT, enemies, the boss and projectiles
- `src/input.js`: keyboard, mouse, gamepad and touch
- `src/main.js`: game loop, camera, pickups, triggers, UI glue and a `window.game` debug API

> Why not Godot? The brief preferred Godot 4's web export, but Godot and its export templates weren't available in the build environment. three.js runs in any browser with a small bundle (~165 KB gzipped).

## Tests

```bash
npm test
```

This runs `tests/smoke.mjs`, which boots the real game in headless Chromium and uses a bot (`tests/bot.js`) that drives the actual input system. It checks:

- walking and jumping
- the first-minute loop
- each alternate solution to the puzzles
- the hub → jungle → pit → tunnel → ruins route with no loading screens
- the boss fight
- the Spire climb to the victory screen
- the mobile touch controls

Set `CHROMIUM_PATH` if Chromium isn't at `/opt/pw-browsers/chromium`.
