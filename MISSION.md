# MISSION: Project DK64 — First Playable Vertical Slice

You are building the first playable slice of a modern 3D action-platformer inspired by the *feeling* of Donkey Kong 64. It is not a remake. Take ownership: look at the environment, choose the implementation details, then build, run and play-test the game. Keep iterating until everything in the definition of done below is true and can be observed.

## The fantasy
A big, connected 3D world that feels like a playground. It has distinct movement, secrets everywhere, abilities that physically change the world, and constant "wait, can I go over there?" moments. Think DK64 × Mario Odyssey × Banjo-Kazooie, with a little of Zelda's systemic play.

**What we are explicitly NOT doing:** character-colored collectibles, abilities that work as arbitrary "keys," forced backtracking through the same room, and level-select screens.

## Tech direction
- **Godot 4.x with Web (HTML5) export** is the preferred stack. The game must be playable in a browser.
- If Godot can't be installed or can't export headlessly in your environment, say so, explain which alternative you're using (for example Three.js + Rapier), and keep going. Don't stall.
- Placeholder or procedural art is fine. Readability, color and lighting matter more than detail. One strong art direction beats many half-finished assets.

## Scope of this slice
- **One character** ("Bruiser" or "Scout"). Pick whichever makes the movement feel best.
- **1 hub + 3 connected zones** in one continuous world, with **no loading screens** between them. Zones should overlap vertically. For example, a hole in the jungle leads to a cave that comes out somewhere high up.
- **One huge landmark** that can be seen from almost everywhere and that the player can eventually reach.
- **1 movement ability** unlocked partway through (for example grapple, wall-run or super-jump) that opens new routes.
- **1 transformation** gained by absorbing a creature, with a truly different moveset.
- **3 enemy types** that each behave differently, plus **1 mini-boss**.
- **~30 meaningful collectibles** that feed progression: relics unlock the landmark, coins buy an upgrade, and creature DNA grants the transformation. Add small scattered pickups for flow.
- **~20 secrets**: hidden areas, alternate routes and rewards for curiosity.
- **Physics objects** and **a few environmental puzzles**. Some puzzles must have **more than one valid solution**. This is the "Playground System": the game should allow creative or unintended approaches, not only one scripted answer.
- Checkpoints and respawn, a minimal HUD and a pause menu.

## Controls
| Action | Keyboard/Mouse | Mobile |
|---|---|---|
| Move | WASD / arrows | Virtual joystick |
| Camera | Mouse | Drag on the right side |
| Jump | Space | Button |
| Sprint | Shift | Automatic when the stick is fully pushed |
| Interact | E | Contextual button |
| Attack | Left click / Z | Button |
| Special | Right click / X | Button |

Gamepad support is a strong bonus.

## Definition of done (observable)
1. The web build loads in a browser and can be played from start to finish with no console errors.
2. Within **60 seconds** of starting, the player is running, jumping and fighting, and has found something interesting.
3. The player can travel from the hub through all 3 zones to the top of the landmark **without a loading screen**.
4. The movement ability and the transformation each open routes that were visibly out of reach before.
5. At least **3 puzzles or obstacles** each have 2 or more solutions that you have tested.
6. All collectibles, secrets, enemies and the mini-boss exist and work, and the progression can be completed.
7. The camera never clips into walls in a way that blocks play. The character controller feels tight: coyote time, jump buffering and responsive air control.
8. It runs at a smooth frame rate in a browser on a typical laptop, and the mobile controls work in a phone-sized viewport.
9. `README.md` explains how to run, build and export the game, and the build can be reproduced from the repo.

## How to work
- **Movement first.** Don't build content on a character controller that doesn't feel good. Keep adjusting it until jumping around an empty test level is fun.
- **Actually run it.** Check each milestone with headless builds, automated smoke tests and browser screenshots (Playwright with Chromium is available). Don't assume something works.
- **Play-test it yourself and iterate.** After each milestone, critique it honestly: What's boring? What's confusing? Where does it feel floaty? Fix the worst problem before moving on.
- Commit in small increments that work, with clear messages.
- When you finish, report what you built, how you checked each item in the definition of done, known issues, and what you'd build next (a second character, more zones, abilities that combine).
