/**
 * What an effect handler sees while resolving: the pending effect, the
 * materialised targets, the controlling player, and narrowly scoped ways to
 * change the world (damage, healing, drawing, emitting events). Handlers do
 * not receive the ExecutionContext directly, which keeps their surface small
 * and reviewable.
 */
import { GameEventType } from "../game/GameEventType.js";
import { ZoneType } from "../game/ZoneType.js";
import { materialiseTargets } from "./TargetResolver.js";

export class EffectContext {
  /** @type {import("./PendingEffect.js").PendingEffect} */
  pending;
  /** @type {import("../game/GameState.js").GameState} */
  state;
  /** @type {import("../game/Player.js").Player} */
  controller;
  /** @type {readonly import("../cards/CardInstance.js").CardInstance[]} */
  targetCreatures;
  /** @type {readonly import("../game/Player.js").Player[]} */
  targetPlayers;
  #execution;

  /**
   * @param {import("./PendingEffect.js").PendingEffect} pending
   * @param {import("../game/GameState.js").GameState} state
   * @param {import("../commands/CommandHandler.contract.js").ExecutionContext} execution
   */
  constructor(pending, state, execution) {
    this.pending = pending;
    this.state = state;
    this.controller = state.requirePlayer(pending.controllerId);
    const { creatures, players } = materialiseTargets(state, pending.targetIds);
    this.targetCreatures = Object.freeze(creatures);
    this.targetPlayers = Object.freeze(players);
    this.#execution = execution;
    Object.freeze(this);
  }

  get params() {
    return this.pending.params;
  }

  get rules() {
    return this.#execution.rules;
  }

  /**
   * @param {string} type
   * @param {Record<string, unknown>} [data]
   */
  emit(type, data = {}) {
    this.#execution.events.emit(type, { sourceId: this.pending.sourceId, ...data });
  }

  /**
   * @param {import("../cards/CardInstance.js").CardInstance} creature
   * @param {number} amount
   * @returns {number} damage actually applied
   */
  damageCreature(creature, amount) {
    const applied = creature.takeDamage(amount);
    this.emit(GameEventType.DAMAGE_DEALT, { targetId: creature.instanceId, amount: applied, remainingHealth: creature.health });
    return applied;
  }

  /**
   * @param {import("../game/Player.js").Player} player
   * @param {number} amount
   * @returns {number} life actually lost
   */
  damagePlayer(player, amount) {
    const lost = player.loseLife(amount);
    this.emit(GameEventType.DAMAGE_DEALT, { targetId: player.id, amount: lost });
    this.emit(GameEventType.LIFE_CHANGED, { playerId: player.id, life: player.life, delta: -lost });
    return lost;
  }

  /**
   * Marks a creature for the graveyard: it takes damage equal to its
   * remaining health, so state-based actions bury it and its death
   * triggers fire through the ordinary pipeline. No-op off the battlefield.
   * @param {import("../cards/CardInstance.js").CardInstance} creature
   */
  sacrificeCreature(creature) {
    if (creature.zone !== ZoneType.BATTLEFIELD || creature.health <= 0) {
      return;
    }
    creature.takeDamage(creature.health);
    this.emit(GameEventType.CREATURE_SACRIFICED, { targetId: creature.instanceId, playerId: creature.controllerId });
  }

  /**
   * Discards up to `amount` cards chosen at random (seeded) from the player's hand.
   * @param {import("../game/Player.js").Player} player
   * @param {number} amount
   * @returns {number} cards actually discarded
   */
  discardRandom(player, amount) {
    let discarded = 0;
    while (discarded < amount && !player.hand.isEmpty) {
      const cards = player.hand.cards;
      const card = cards[this.state.rng.nextInt(cards.length)];
      player.hand.remove(card.instanceId);
      player.graveyard.add(card);
      this.emit(GameEventType.CARD_DISCARDED, { playerId: player.id, instanceId: card.instanceId, definitionId: card.definitionId });
      discarded += 1;
    }
    return discarded;
  }

  /**
   * @param {import("../cards/CardInstance.js").CardInstance} creature
   * @param {number} amount
   */
  healCreature(creature, amount) {
    const healed = creature.heal(amount);
    this.emit(GameEventType.HEALED, { targetId: creature.instanceId, amount: healed });
  }

  /**
   * @param {import("../game/Player.js").Player} player
   * @param {number} amount
   */
  healPlayer(player, amount) {
    const gained = player.gainLife(amount, this.rules.startingLife);
    this.emit(GameEventType.HEALED, { targetId: player.id, amount: gained });
    this.emit(GameEventType.LIFE_CHANGED, { playerId: player.id, life: player.life, delta: gained });
  }

  /**
   * @param {import("../game/Player.js").Player} player
   * @param {number} amount
   */
  drawCards(player, amount) {
    this.#execution.turnManager.drawCards(this.state, player, amount, this.#execution);
  }
}
