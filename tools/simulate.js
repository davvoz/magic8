/**
 * Headless AI-vs-AI simulation over the bundled preconstructed decks: every
 * ordered pairing (so each deck plays both seats), `games` seeds each.
 * Prints per-deck win rates, the first-seat win rate and match length, for
 * balance checks after content changes.
 *
 *   node tools/simulate.js [gamesPerPairing=25]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadContent } from "../src/application/content/ContentService.js";
import { BasicAiController } from "../src/application/match/BasicAiController.js";
import { MatchSetupService } from "../src/application/match/MatchSetupService.js";
import { ContentResource } from "../src/application/ports/ContentSource.contract.js";
import { createCoreEffectRegistry } from "../src/domain/effects/registerCoreEffects.js";
import { StaticContentSource } from "../src/infrastructure/config/StaticContentSource.js";
import { MemoryLogger } from "../src/infrastructure/logging/MemoryLogger.js";
import { immediateScheduler } from "../src/infrastructure/time/ImmediateScheduler.js";

const DATA = resolve("data");
const readJson = (relativePath) => JSON.parse(readFileSync(join(DATA, relativePath), "utf8"));
const listJson = (directory, suffix) => readdirSync(join(DATA, directory)).filter((name) => name.endsWith(suffix)).sort().map((name) => readJson(`${directory}/${name}`));
const MAX_GAMES = 500;

/** Loads and validates the bundled content exactly as the browser would. */
async function loadBundled(effects) {
  const content = await loadContent(
    new StaticContentSource({
      [ContentResource.CARD_SETS]: listJson("cards", ".cards.json"),
      [ContentResource.PRECON_DECKS]: listJson("decks", ".deck.json"),
      [ContentResource.GAME_RULES]: readJson("rules/game-rules.json"),
      [ContentResource.DECK_RULES]: readJson("rules/deck-rules.json"),
    }),
    effects,
  );
  if (!content.ok) {
    throw new Error(`content invalid: ${content.error.message}`);
  }
  return content.value;
}

/**
 * One AI-vs-AI game; seat "a" plays `first`.
 * @returns {Promise<{ winner: "a" | "b" | null, turns: number }>}
 */
async function playGame(setup, first, second, seed) {
  const created = setup.createMatch({
    seats: [
      { id: "a", name: first.name, deckList: first, controller: new BasicAiController() },
      { id: "b", name: second.name, deckList: second, controller: new BasicAiController() },
    ],
    seed,
  });
  if (!created.ok) {
    throw new Error(created.error.message);
  }
  const session = created.value;
  session.start();
  await session.whenIdle();
  const snapshot = session.snapshotFor(null);
  if (!snapshot.isOver) {
    throw new Error(`game did not finish (seed ${seed}, ${first.id} vs ${second.id})`);
  }
  return { winner: /** @type {"a" | "b" | null} */ (snapshot.winnerId), turns: snapshot.turnNumber };
}

/** Every ordered pairing of distinct decks. */
function pairings(decks) {
  return decks.flatMap((first) => decks.filter((second) => second.id !== first.id).map((second) => [first, second]));
}

async function main() {
  const games = Math.min(MAX_GAMES, Math.max(1, Number.parseInt(process.argv[2] ?? "25", 10) || 25));
  const effects = createCoreEffectRegistry();
  const content = await loadBundled(effects);
  const logger = new MemoryLogger();
  const setup = new MatchSetupService({ content, effects, scheduler: immediateScheduler, logger });
  const decks = content.preconDecks;
  const record = new Map(decks.map((deck) => [deck.id, { wins: 0, games: 0 }]));
  const totals = { games: 0, firstSeatWins: 0, turns: 0, draws: 0 };
  const started = performance.now();

  for (const [first, second] of pairings(decks)) {
    for (let seed = 1; seed <= games; seed += 1) {
      const result = await playGame(setup, first, second, seed * 1000 + totals.games);
      totals.games += 1;
      totals.turns += result.turns;
      record.get(first.id).games += 1;
      record.get(second.id).games += 1;
      const winner = result.winner === "a" ? first : second;
      if (result.winner === null) {
        totals.draws += 1;
      } else {
        record.get(winner.id).wins += 1;
        totals.firstSeatWins += result.winner === "a" ? 1 : 0;
      }
    }
  }

  const elapsed = performance.now() - started;
  console.log(`${totals.games} games, ${(elapsed / totals.games).toFixed(1)} ms/game, average ${(totals.turns / totals.games).toFixed(1)} turns, ${totals.draws} draws`);
  console.log(`first seat wins ${((totals.firstSeatWins / totals.games) * 100).toFixed(1)}%`);
  for (const deck of decks) {
    const { wins, games: played } = record.get(deck.id);
    console.log(`${deck.name.padEnd(16)} ${deck.faction.padEnd(8)} ${((wins / played) * 100).toFixed(1)}% of ${played}`);
  }
  const diagnostics = logger.entries.filter((entry) => entry.level !== "info");
  if (diagnostics.length > 0) {
    console.log(`diagnostics: ${diagnostics.length} (first: ${diagnostics[0].message})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
