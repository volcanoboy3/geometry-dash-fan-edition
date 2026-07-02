# Geometry Dash — Fan Edition

A complete browser-based Geometry Dash fan game. **100% original content**: all level
layouts are procedurally generated (and machine-verified beatable), all music is composed
live by a Web Audio chiptune synthesizer, and all art is drawn in canvas code. Only
factual metadata (level names, difficulty faces, physics constants) follows the real game.

## How to run

Open a terminal in this folder and run:

```
python3 -m http.server 8459
```

Then open http://localhost:8459 in your browser. (Any static file server works.)

## Controls

| Action | Input |
|---|---|
| Jump / fly / flip | Click, tap, `Space`, `W` or `↑` |
| Pause | `Esc` or the ⏸ button |
| Editor: place | Click / drag |
| Editor: pan | Right-drag |
| Editor: zoom | Mouse wheel |
| Editor: nudge selection | Arrow keys (in Edit mode) |

## What's inside

- **All 22 main levels** recreated (Stereo Madness → Dash) with the real difficulty
  faces, star rewards, mode sequences, and 3 secret coins each. The three demon levels
  are coin-gated (10 / 20 / 30 secret coins) like the real game.
- **Faithful physics** for all 7 game modes — cube, ship, ball, UFO, wave, robot, spider —
  plus gravity portals, mini portals, and all 5 speeds, using decompile-accurate constants
  (240 Hz substeps, real jump arcs, GD's inner/outer hitbox forgiveness system).
- **Level editor** with every object (blocks, spikes, saws, pads, orbs, portals, speed
  changers, color triggers, coins, deco), playtesting, and the classic
  **verify → publish** flow: beat your own level before you can publish it.
- **Online search** with 42 built-in levels + your published ones, name search, and
  difficulty filters: Easy, Normal, Hard, Harder, Insane, Easy Demon, Medium Demon.
  Download levels to your Saved tab.
- **5 Gauntlets** (Fire, Ice, Shadow, Lava, Chaos) × 3 levels each — finish a gauntlet
  for a mana orb bonus and an exclusive icon.
- **Mana orb economy**: orbs from rated levels (partial banking at 80% rate, exactly like
  GD), spent in the **Shop** on icons and colors.
- **Icon kit**: 38 icons across the 7 modes + primary/secondary colors.
- **Practice mode** with auto-checkpoints (toggle from the pause menu).
- **Secrets.** That's all we're saying. (Spoilers below — stop reading to stay pure!)

<details>
<summary>🤫 SPOILERS: all secrets</summary>

- A faint **coin** hides in a corner of the main menu.
- Click the **logo** seven times.
- The **padlock** (top-right of the menu) opens The Vault once you have 3 secret coins.
  Codes to whisper: `lenny`, `spooky`, `blockbite`, `neverending`, `mule`, `ahead`,
  `robotop`, `sparky`, `octocube`, `seven`, `brainpower`, `finalboss` — and your own username.
- A dusty **door** in the Shop. It wants a rusty key. The key wants 1000 orbs.
  The thing behind the door wants chicken.

</details>

## Development

- `node tests/simulate.js` — a solver bot plays **every** built-in level headless and
  asserts 100% completion (79 levels).
- `node tests/debug.js <levelId>` — trace a single level run with death diagnostics.

No dependencies, no build step — plain HTML/CSS/JS.
