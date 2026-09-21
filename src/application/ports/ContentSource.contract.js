/**
 * Port for reading raw (unvalidated) content. Infrastructure decides where
 * it comes from (fetch, bundled objects, files); ContentService validates.
 *
 * @typedef {object} ContentSource
 * @property {(resource: string) => Promise<import("../../shared/Result.js").Ok<unknown> | import("../../shared/Result.js").Fail>} load One of ContentResource.
 */

export const ContentResource = Object.freeze({
  /** Array of card-set files. */
  CARD_SETS: "cardSets",
  /** Array of deck-list files. */
  PRECON_DECKS: "preconDecks",
  GAME_RULES: "gameRules",
  DECK_RULES: "deckRules",
});

export const CONTENT_RESOURCES = Object.freeze(Object.values(ContentResource));
