/**
 * Greedy rule-based opponent. Works purely from its perspective snapshot
 * and `legalMoves`, so it can only ever submit commands the engine accepts.
 * Deterministic: the same snapshot always yields the same command, which
 * keeps AI-vs-AI matches replayable from a seed.
 *
 * Heuristics (deliberately simple; a search-based AI would replace this
 * class without touching the session):
 * - Main phases: play the most expensive playable card, then move on.
 *   Damage goes where it kills, removal (destroy, bounce) on the strongest
 *   enemy creature, buffs on the strongest ally.
 * - Attack with creatures that cannot be blocked and killed for free; attack
 *   with everything when unblocked damage would be lethal.
 * - Block to kill an attacker and survive, to trade evenly, or to chump when
 *   the incoming damage would be lethal.
 */
import { declareAttackers, declareBlockers, endPhase, endTurn, playCard } from "../../domain/commands/commandFactories.js";
import { GamePhase } from "../../domain/game/GamePhase.js";
import { ControllerKind } from "./PlayerController.contract.js";

/** @typedef {import("../../domain/game/GameSnapshot.js").CardView} CardView */

const DAMAGE = "deal_damage";
const DRAIN = "drain";
const HEAL = "heal";
const SACRIFICE = "sacrifice";
const MODIFY_STATS = "modify_stats";
/** Removal aimed at enemy creatures regardless of their health. */
const REMOVAL = Object.freeze(["destroy", "return_to_hand"]);

export class BasicAiController {
  kind = ControllerKind.AI;

  /**
   * @param {ReturnType<import("../../domain/game/GameEngine.js").GameEngine["getSnapshot"]>} snapshot
   * @returns {Readonly<Record<string, unknown>> | null}
   */
  decide(snapshot) {
    const me = snapshot.perspectivePlayerId;
    if (me === null || snapshot.isOver || snapshot.awaitingPlayerId !== me || snapshot.legalMoves === null) {
      return null;
    }
    const board = boardFor(snapshot, me);
    switch (snapshot.phase) {
      case GamePhase.MAIN_1:
      case GamePhase.MAIN_2:
        return this.#mainPhase(snapshot, board);
      case GamePhase.COMBAT_ATTACKERS:
        return declareAttackers(me, chooseAttackers(snapshot, board));
      case GamePhase.COMBAT_BLOCKERS:
        return declareBlockers(me, chooseBlocks(snapshot, board));
      default:
        return null;
    }
  }

  /**
   * @param {ReturnType<import("../../domain/game/GameEngine.js").GameEngine["getSnapshot"]>} snapshot
   * @param {Board} board
   */
  #mainPhase(snapshot, board) {
    const { legalMoves } = snapshot;
    const playable = board.me.hand.filter((card) => legalMoves.playableCardIds.includes(card.instanceId));
    const card = playable.sort((a, b) => b.cost - a.cost)[0];
    if (card !== undefined) {
      const targets = legalMoves.targetOptions[card.instanceId].flatMap((options, index) => chooseTargets(card, index, options, board));
      return playCard(board.me.id, card.instanceId, targets);
    }
    if (snapshot.phase === GamePhase.MAIN_1 && legalMoves.canEndPhase) {
      return endPhase(board.me.id);
    }
    return legalMoves.canEndTurn ? endTurn(board.me.id) : endPhase(board.me.id);
  }
}

/**
 * @typedef {{ me: ReturnType<import("../../domain/game/GameEngine.js").GameEngine["getSnapshot"]>["players"][number], enemy: ReturnType<import("../../domain/game/GameEngine.js").GameEngine["getSnapshot"]>["players"][number] }} Board
 */

/**
 * @param {ReturnType<import("../../domain/game/GameEngine.js").GameEngine["getSnapshot"]>} snapshot
 * @param {string} me
 * @returns {Board}
 */
function boardFor(snapshot, me) {
  const mine = snapshot.players.find((player) => player.id === me);
  const theirs = snapshot.players.find((player) => player.id !== me);
  if (mine === undefined || theirs === undefined) {
    throw new Error("BasicAiController: malformed snapshot");
  }
  return { me: mine, enemy: theirs };
}

/**
 * Picks targets for the card's n-th player-targeted play ability.
 * @param {CardView} card
 * @param {number} abilityIndex
 * @param {readonly string[]} options
 * @param {Board} board
 * @returns {string[]}
 */
function chooseTargets(card, abilityIndex, options, board) {
  const ability = card.abilities.filter((candidate) => candidate.target !== null)[abilityIndex];
  const creaturesById = new Map([...board.me.battlefield, ...board.enemy.battlefield].map((creature) => [creature.instanceId, creature]));
  const creatures = options.map((id) => creaturesById.get(id)).filter((creature) => creature !== undefined);
  const players = options.filter((id) => id === board.me.id || id === board.enemy.id);
  const pick = choosePreferredTarget(ability?.effect, ability?.params, { creatures, players, board });
  return [pick ?? options[0]];
}

/**
 * @param {string | undefined} effect
 * @param {Readonly<Record<string, number | string>> | undefined} params
 * @param {{ creatures: CardView[], players: string[], board: Board }} context
 * @returns {string | undefined}
 */
function choosePreferredTarget(effect, params, { creatures, players, board }) {
  const enemies = creatures.filter((creature) => creature.controllerId === board.enemy.id);
  if (effect === DAMAGE || effect === DRAIN) {
    return chooseDamageTarget(Number(params?.amount ?? 0), { creatures, players, board });
  }
  if (REMOVAL.includes(effect)) {
    return strongest(enemies)?.instanceId;
  }
  if (effect === MODIFY_STATS && isDebuff(params)) {
    return chooseWeakenTarget(Number(params?.health ?? 0), enemies);
  }
  return chooseAllyTarget(effect, { creatures, players, board });
}

/** @param {Readonly<Record<string, number | string>> | undefined} params */
function isDebuff(params) {
  return Number(params?.attack ?? 0) < 0 || Number(params?.health ?? 0) < 0;
}

/**
 * Heal the strongest wounded ally (or self), sacrifice the weakest ally,
 * put anything else (a buff) on the strongest ally.
 * @param {string | undefined} effect
 * @param {{ creatures: CardView[], players: string[], board: Board }} context
 * @returns {string | undefined}
 */
function chooseAllyTarget(effect, { creatures, players, board }) {
  const allies = creatures.filter((creature) => creature.controllerId === board.me.id);
  if (effect === HEAL) {
    return strongest(allies.filter((creature) => creature.damage > 0))?.instanceId ?? (players.includes(board.me.id) ? board.me.id : undefined);
  }
  if (effect === SACRIFICE) {
    return weakest(allies)?.instanceId;
  }
  return strongest(allies)?.instanceId;
}

/**
 * A debuff goes on the strongest enemy creature it kills outright, else on
 * the strongest enemy creature.
 * @param {number} health Signed health modifier of the debuff.
 * @param {readonly CardView[]} enemies
 * @returns {string | undefined}
 */
function chooseWeakenTarget(health, enemies) {
  return (strongest(enemies.filter((creature) => creature.health <= -health)) ?? strongest(enemies))?.instanceId;
}

/**
 * Kill the strongest enemy creature the damage can finish; otherwise hit the
 * enemy player, or the strongest enemy creature when players are not allowed.
 * @param {number} amount
 * @param {{ creatures: CardView[], players: string[], board: Board }} context
 * @returns {string | undefined}
 */
function chooseDamageTarget(amount, { creatures, players, board }) {
  const enemies = creatures.filter((creature) => creature.controllerId === board.enemy.id);
  const kill = strongest(enemies.filter((creature) => creature.health <= amount));
  if (kill !== undefined) {
    return kill.instanceId;
  }
  return players.includes(board.enemy.id) ? board.enemy.id : strongest(enemies)?.instanceId;
}

/**
 * @param {readonly CardView[]} creatures
 * @returns {CardView | undefined}
 */
function weakest(creatures) {
  return [...creatures].sort((a, b) => a.attack - b.attack || a.health - b.health)[0];
}

/**
 * @param {readonly CardView[]} creatures
 * @returns {CardView | undefined}
 */
function strongest(creatures) {
  return [...creatures].sort((a, b) => b.attack - a.attack || b.health - a.health)[0];
}

/**
 * @param {ReturnType<import("../../domain/game/GameEngine.js").GameEngine["getSnapshot"]>} snapshot
 * @param {Board} board
 * @returns {string[]}
 */
function chooseAttackers(snapshot, board) {
  const candidates = board.me.battlefield.filter((creature) => snapshot.legalMoves.attackerIds.includes(creature.instanceId) && creature.attack > 0);
  const blockers = board.enemy.battlefield.filter((creature) => !creature.exhausted);
  const totalDamage = candidates.reduce((sum, creature) => sum + creature.attack, 0);
  if (totalDamage >= board.enemy.life) {
    return candidates.map((creature) => creature.instanceId);
  }
  const safe = candidates.filter((attacker) => !blockers.some((blocker) => blocker.attack >= attacker.health && blocker.health > attacker.attack));
  return safe.map((creature) => creature.instanceId);
}

/**
 * @param {ReturnType<import("../../domain/game/GameEngine.js").GameEngine["getSnapshot"]>} snapshot
 * @param {Board} board
 * @returns {{ attackerId: string, blockerId: string }[]}
 */
function chooseBlocks(snapshot, board) {
  const attackers = snapshot.combat.attackerIds
    .map((id) => board.enemy.battlefield.find((creature) => creature.instanceId === id))
    .filter((creature) => creature !== undefined)
    .sort((a, b) => b.attack - a.attack);
  const available = board.me.battlefield.filter((creature) => snapshot.legalMoves.blockerIds.includes(creature.instanceId));
  const incoming = attackers.reduce((sum, attacker) => sum + attacker.attack, 0);
  const blocks = [];
  for (const attacker of attackers) {
    const blocker = pickBlocker(attacker, available, incoming >= board.me.life);
    if (blocker !== undefined) {
      blocks.push({ attackerId: attacker.instanceId, blockerId: blocker.instanceId });
      available.splice(available.indexOf(blocker), 1);
    }
  }
  return blocks;
}

/**
 * @param {CardView} attacker
 * @param {CardView[]} available
 * @param {boolean} lethalIncoming
 * @returns {CardView | undefined}
 */
function pickBlocker(attacker, available, lethalIncoming) {
  const kills = (blocker) => blocker.attack >= attacker.health;
  const survives = (blocker) => blocker.health > attacker.attack;
  const ideal = available.find((blocker) => kills(blocker) && survives(blocker));
  if (ideal !== undefined) {
    return ideal;
  }
  const trade = available.find((blocker) => kills(blocker) && blocker.cost <= attacker.cost);
  if (trade !== undefined) {
    return trade;
  }
  const wall = available.find((blocker) => survives(blocker));
  if (wall !== undefined) {
    return wall;
  }
  return lethalIncoming ? [...available].sort((a, b) => a.cost - b.cost)[0] : undefined;
}
