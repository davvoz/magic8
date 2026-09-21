/**
 * Whether and how a card in hand can be played. Shared by PlayCardHandler
 * (validation) and LegalMoves (UI highlighting, AI), so the two can never
 * disagree.
 *
 * Targeting rule of the slice: a creature whose on_play ability has no legal
 * target may still be played (the ability fizzles, expecting zero targets);
 * a spell with no legal target cannot be cast.
 */
import { CommandError } from "../commands/CommandError.js";
import { candidatesFor, validateChosenTargets } from "../effects/TargetResolver.js";
import { playTriggerFor } from "../effects/TriggerDispatcher.js";

/**
 * @typedef {Readonly<{ code: string, message: string }>} PlayabilityProblem
 */

/**
 * Abilities of the card's play trigger whose targets the player must choose.
 * @param {import("../cards/CardDefinition.js").CardDefinition} definition
 */
export function playerTargetedPlayAbilities(definition) {
  return definition.abilitiesFor(playTriggerFor(definition)).filter((ability) => ability.target !== null && !ability.target.isAutomatic);
}

/**
 * Legal target ids for each player-targeted play ability, in ability order.
 * @param {import("./GameState.js").GameState} state
 * @param {import("../cards/CardInstance.js").CardInstance} card
 * @returns {readonly (readonly string[])[]}
 */
export function targetOptionsFor(state, card) {
  return Object.freeze(
    playerTargetedPlayAbilities(card.definition).map((ability) =>
      Object.freeze(candidatesFor(state, ability.target, { controllerId: card.controllerId, excludeId: card.instanceId })),
    ),
  );
}

/**
 * Checks cost, zone capacity and target availability. Does not check whose turn it is.
 * @param {import("./GameState.js").GameState} state
 * @param {import("./Player.js").Player} player
 * @param {import("../cards/CardInstance.js").CardInstance} card
 * @param {import("./GameRules.js").GameRules} rules
 * @returns {PlayabilityProblem | null}
 */
export function playabilityProblem(state, player, card, rules) {
  if (!player.resources.canAfford(card.definition.cost)) {
    return problem(CommandError.CANNOT_AFFORD, `${card.definition.name} costs ${card.definition.cost}; ${player.resources.current} available`);
  }
  if (card.isCreature && player.creatures.length >= rules.maxBattlefieldCreatures) {
    return problem(CommandError.ZONE_FULL, `the battlefield already holds ${rules.maxBattlefieldCreatures} creatures`);
  }
  if (card.definition.isSpell && targetOptionsFor(state, card).some((options) => options.length === 0)) {
    return problem(CommandError.INVALID_TARGET, `${card.definition.name} has no legal target`);
  }
  return null;
}

/**
 * Splits the flat `targets` array of a PLAY_CARD command across the card's
 * player-targeted abilities and validates each group.
 * @param {import("./GameState.js").GameState} state
 * @param {import("../cards/CardInstance.js").CardInstance} card
 * @param {readonly string[]} targetIds
 * @returns {{ groups: readonly (readonly string[])[] } | PlayabilityProblem}
 */
export function splitChosenTargets(state, card, targetIds) {
  const abilities = playerTargetedPlayAbilities(card.definition);
  const options = targetOptionsFor(state, card);
  const groups = [];
  let cursor = 0;
  for (const [index, ability] of abilities.entries()) {
    const expected = options[index].length === 0 && card.isCreature ? 0 : ability.target.count;
    const group = targetIds.slice(cursor, cursor + expected);
    cursor += expected;
    const scope = { controllerId: card.controllerId, excludeId: card.instanceId };
    const failure = expected === 0 ? null : validateChosenTargets(state, ability.target, group, scope);
    if (failure !== null) {
      return problem(CommandError.INVALID_TARGET, failure);
    }
    groups.push(Object.freeze(group));
  }
  if (cursor !== targetIds.length) {
    return problem(CommandError.INVALID_TARGET, `expected ${cursor} target(s), got ${targetIds.length}`);
  }
  return { groups: Object.freeze(groups) };
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {PlayabilityProblem}
 */
function problem(code, message) {
  return Object.freeze({ code, message });
}
