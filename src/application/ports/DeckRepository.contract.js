/**
 * Persistence port for custom decks. Implemented by infrastructure
 * (StoredDeckRepository); the application never touches storage APIs.
 *
 * @typedef {object} DeckRepository
 * @property {() => import("../../shared/Result.js").Ok<readonly import("../../domain/decks/DeckList.js").DeckList[]> | import("../../shared/Result.js").Fail} list
 * @property {(deck: import("../../domain/decks/DeckList.js").DeckList) => import("../../shared/Result.js").Ok<undefined> | import("../../shared/Result.js").Fail} save Inserts or replaces by id.
 * @property {(deckId: string) => import("../../shared/Result.js").Ok<undefined> | import("../../shared/Result.js").Fail} remove
 */

export const DECK_REPOSITORY_METHODS = Object.freeze(["list", "save", "remove"]);
