/**
 * Loads raw content through the ContentSource port and validates it into
 * the immutable GameContent bundle every other service depends on.
 * Bundled content must be fully valid: a single bad card or an illegal
 * preconstructed deck fails the load, with a path-qualified reason.
 */
import { fail, ok } from "../../shared/Result.js";
import { CardCatalog } from "../../domain/cards/CardCatalog.js";
import { validateCardSet } from "../../domain/cards/validateCardDefinition.js";
import { validateDeckRules } from "../../domain/decks/DeckRules.js";
import { validateDeck } from "../../domain/decks/DeckValidator.js";
import { validateDeckList } from "../../domain/decks/validateDeckList.js";
import { validateGameRules } from "../../domain/game/GameRules.js";
import { ContentResource } from "../ports/ContentSource.contract.js";

export const ContentError = Object.freeze({
  LOAD_FAILED: "CONTENT_LOAD_FAILED",
  INVALID: "CONTENT_INVALID",
});

/**
 * @typedef {Readonly<{
 *   catalog: CardCatalog,
 *   gameRules: import("../../domain/game/GameRules.js").GameRules,
 *   deckRules: import("../../domain/decks/DeckRules.js").DeckRules,
 *   preconDecks: readonly import("../../domain/decks/DeckList.js").DeckList[],
 * }>} GameContent
 */

/**
 * @param {import("../ports/ContentSource.contract.js").ContentSource} source
 * @param {import("../../domain/effects/EffectRegistry.js").EffectRegistry} effects
 * @returns {Promise<import("../../shared/Result.js").Ok<GameContent> | import("../../shared/Result.js").Fail>}
 */
export async function loadContent(source, effects) {
  const raw = await loadRaw(source);
  if (!raw.ok) {
    return raw;
  }
  const deckRules = validateDeckRules(raw.value.deckRules);
  const gameRules = validateGameRules(raw.value.gameRules);
  if (!deckRules.ok || !gameRules.ok) {
    return invalid("rules", deckRules.ok ? gameRules : deckRules);
  }
  const catalog = buildCatalog(raw.value.cardSets, { factions: deckRules.value.factions, effects });
  if (!catalog.ok) {
    return catalog;
  }
  const pools = checkFactionPools(deckRules.value, catalog.value);
  if (!pools.ok) {
    return pools;
  }
  const preconDecks = buildPreconDecks(raw.value.preconDecks, deckRules.value, catalog.value);
  if (!preconDecks.ok) {
    return preconDecks;
  }
  return ok(Object.freeze({ catalog: catalog.value, gameRules: gameRules.value, deckRules: deckRules.value, preconDecks: preconDecks.value }));
}

/**
 * @param {import("../ports/ContentSource.contract.js").ContentSource} source
 */
async function loadRaw(source) {
  /** @type {Record<string, unknown>} */
  const loaded = {};
  for (const resource of Object.values(ContentResource)) {
    const result = await source.load(resource);
    if (!result.ok) {
      return fail(ContentError.LOAD_FAILED, `could not load ${resource}: ${result.error.message}`, result.error.details);
    }
    loaded[resource] = result.value;
  }
  return ok(loaded);
}

/**
 * Every faction a deck can be built around must have enough eligible cards
 * (its own plus the shared pool, times the copy limit) to reach the minimum
 * deck size; otherwise the deck builder would offer an impossible deck.
 * @param {import("../../domain/decks/DeckRules.js").DeckRules} rules
 * @param {import("../../domain/cards/CardCatalog.js").CardCatalog} catalog
 */
function checkFactionPools(rules, catalog) {
  const cards = catalog.all().filter((definition) => rules.allowedTypes.includes(definition.type));
  for (const faction of rules.deckFactions) {
    const eligible = cards.filter((definition) => rules.allowsFaction(faction, definition.faction)).length;
    if (eligible * rules.maxCopies < rules.minSize) {
      return fail(ContentError.INVALID, `faction "${faction}" has ${eligible} eligible cards; ${eligible} × ${rules.maxCopies} copies cannot reach the minimum deck size of ${rules.minSize}`);
    }
  }
  return ok(undefined);
}

/**
 * @param {unknown} rawSets
 * @param {import("../../domain/cards/validateCardDefinition.js").CardValidationContext} context
 */
function buildCatalog(rawSets, context) {
  if (!Array.isArray(rawSets) || rawSets.length === 0) {
    return fail(ContentError.INVALID, "cardSets must be a non-empty array");
  }
  const definitions = [];
  for (const [index, rawSet] of rawSets.entries()) {
    const set = validateCardSet(rawSet, context);
    if (!set.ok) {
      return invalid(`cardSets[${index}]`, set);
    }
    definitions.push(...set.value);
  }
  const catalog = CardCatalog.fromDefinitions(definitions);
  return catalog.ok ? catalog : invalid("cardSets", catalog);
}

/**
 * @param {unknown} rawDecks
 * @param {import("../../domain/decks/DeckRules.js").DeckRules} deckRules
 * @param {CardCatalog} catalog
 */
function buildPreconDecks(rawDecks, deckRules, catalog) {
  if (!Array.isArray(rawDecks) || rawDecks.length === 0) {
    return fail(ContentError.INVALID, "preconDecks must be a non-empty array");
  }
  const decks = [];
  for (const [index, rawDeck] of rawDecks.entries()) {
    const list = validateDeckList(rawDeck);
    if (!list.ok) {
      return invalid(`preconDecks[${index}]`, list);
    }
    if (!list.value.preconstructed) {
      return fail(ContentError.INVALID, `preconDecks[${index}] (${list.value.id}) is not flagged preconstructed`);
    }
    const report = validateDeck(list.value, deckRules, catalog);
    if (!report.valid) {
      return fail(ContentError.INVALID, `preconDecks[${index}] (${list.value.id}) breaks deck rules: ${report.problems[0].message}`, { problems: report.problems });
    }
    decks.push(list.value);
  }
  return ok(Object.freeze(decks));
}

/**
 * @param {string} where
 * @param {import("../../shared/Result.js").Fail} failure
 */
function invalid(where, failure) {
  return fail(ContentError.INVALID, `${where}: ${failure.error.message}`, failure.error.details);
}
