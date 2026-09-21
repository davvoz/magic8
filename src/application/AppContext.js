/**
 * The application services handed to presentation scenes. Assembled once in
 * the composition root (main.js); scenes receive it read-only.
 *
 * @typedef {object} AppContext
 * @property {import("./content/ContentService.js").GameContent} content
 * @property {import("./decks/DeckSelectionService.js").DeckSelectionService} deckSelection
 * @property {import("./decks/DeckBuildingService.js").DeckBuildingService} deckBuilding
 * @property {import("./match/MatchSetupService.js").MatchSetupService} matchSetup
 * @property {() => number} createSeed
 * @property {import("./ports/Logger.contract.js").Logger} logger
 * @property {Readonly<{ version: string, storage: "local" | "memory" }>} environment
 */

export const APP_CONTEXT_KEYS = Object.freeze(["content", "deckSelection", "deckBuilding", "matchSetup", "createSeed", "logger", "environment"]);
