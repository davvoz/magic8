# Magic8 — Canvas Card Game Engine

A strategic collectible card game engine written in vanilla JavaScript (ES2022 modules) and rendered exclusively on HTML5 Canvas. No frameworks, no runtime dependencies, no build step.

- Architecture, decisions and the per-increment log: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Requirements: Node ≥ 20.11 (22 LTS recommended). ESLint is an optional dev dependency.

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Run the headless test suite (`node --test`) |
| `npm run test:coverage` | Same, plus `coverage/lcov.info` for SonarQube |
| `npm run serve` | Static dev server at http://127.0.0.1:8080/ (ES modules need HTTP) |
| `npm run lint` | ESLint with the Sonar-aligned rule set (requires `npm install`) |
| `npm run simulate [games]` | Headless AI-vs-AI round robin over the bundled decks: win rates per deck and per seat |
| `npm run serve`, then `/tools/preview/?scene=…` | Design-review harness: jumps straight to a screen (`menu`, `decks`, `builder`, `editor`, `match&turns=N`, `…&inspect=1`) for screenshots |

## Playing

`npm run serve`, open http://127.0.0.1:8080/, **Play**, pick one of the ten bundled decks (Ember Vanguard, Ember Wildfire, Iron Legion, Iron Foundry, Shadow Pact, Grave Harvest, Verdant Grove, Wild Hunt, Arcane Conclave, Spire Bastion) or your own, start. The opponent is a built-in AI playing one of the other decks.

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Play a card | tap it in your hand; tap a target if it asks for one | Tab to it, Enter |
| Attack | tap your creatures, then **Attack with N** | Tab / Enter |
| Block | tap your blocker, then the attacker, then **Confirm** | Tab / Enter |
| End phase / turn | sidebar buttons | `E` ends the turn |
| Cancel a choice | **Cancel** | `Esc` |
| Inspect a card | right-click or long-press | `I` on the focused card |
| Concede | **Concede** (asks for confirmation) | — |

The **Deck Builder** creates and edits decks (30–40 cards, up to 3 copies, one faction plus neutral cards). Decks are stored in the browser's local storage; when it is unavailable they live in memory for the session and the menu says so.

## Look

Everything on screen is drawn procedurally on the canvas: there are no image assets, no icon fonts and no symbol glyphs. Cards have a faction-toned bevelled frame with a gold rim, a cost gem, the name on a banner, an illustration window generated from a hash of the card's id (fire, steel, graveyard, grove, arcane spire or wilderness motif plus a creature sigil or spell rune circle — the same card always looks the same), a type ribbon, the rules text and attack/health gems with drawn sword and shield pictograms. The table, HUD (life crystal, resource orbs, card-stack counters), menus, buttons and modals share the same palette and display face, all defined in `data/ui/theme.json`.

## Layout

```
src/
  shared/          Result, validation, limits, geometry — no dependencies
  domain/          rules, cards, decks, engine, combat, effects, commands — pure, deterministic, browser-free
  application/     use cases and ports: content loading, deck services, MatchSession, controllers (human, AI)
  infrastructure/  port implementations: fetch/static content, localStorage/in-memory storage, logging, scheduling
  input/           InputManager (DOM events → logical pointer/key input), KeyMap, MatchInteraction state machine
  rendering/       canvas host, viewport, loop, theme (+ colour helpers), widget kit, scenes, board (layout, presenter, nodes), cards (face, procedural art, gems)
  main.js          composition root — the only module importing every layer
data/              cards, decks, rules, theme (validated JSON; nothing is trusted)
test/              node --test suites, one folder per layer, plus architecture tests
tools/             zero-dependency dev server, balance simulator and the browser preview harness
```

Dependency direction is `rendering → input → application → domain → shared`; `infrastructure` implements application ports. The rule, and the ban on browser globals, clocks, randomness and `eval`-like constructs in the domain, is enforced by `test/architecture/`.

## Quality gates

- `npm test`: 423 headless tests including engine fuzzing, determinism, architecture rules, scene flows against a real match session and the procedural visuals (layout, colour, art determinism, context state hygiene).
- `npm run lint`: ESLint rules mirroring the SonarQube checks in `docs/ARCHITECTURE.md` §1.7 (complexity ≤ 12, ≤ 4 params, no nested ternaries, no `eval`/`new Function`, …).
- `sonar-project.properties` is ready for a SonarQube/SonarCloud scan (`sonar.javascript.lcov.reportPaths=coverage/lcov.info`); no scan has been run in this repository yet.
