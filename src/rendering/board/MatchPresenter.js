/**
 * Turns snapshots and engine events into presentation state: one
 * CardVisual per card on the board (tweening toward its layout slot,
 * entering from the owner's hand or library, leaving toward the owner's
 * graveyard) and short-lived floating texts for damage and healing.
 *
 * It never inspects state deltas to guess what happened: events say what
 * happened, the layout says where things belong.
 */
import { GameEventType } from "../../domain/game/GameEventType.js";
import { ZoneType } from "../../domain/game/ZoneType.js";
import { CardVisual } from "../cards/CardVisual.js";

const MAX_FLOATS = 32;
const FLOAT_RISE = 40;

/**
 * @typedef {Readonly<{ text: string, colorKey: string, x: number, y: number }>} FloatSpec
 * @typedef {{ spec: FloatSpec, ageMs: number, durationMs: number }} Float
 * @typedef {import("./BoardLayout.js").BoardLayout} BoardLayout
 * @typedef {import("../../domain/game/GameSnapshot.js").CardView} CardView
 */

export class MatchPresenter {
  /** @type {Map<string, CardVisual>} */
  #visuals = new Map();
  /** @type {Map<string, CardView>} last known card data, kept for leaving cards */
  #cards = new Map();
  /** @type {Float[]} */
  #floats = [];
  #animation;

  /** @param {Readonly<Record<string, number>>} animation theme durations (shortMs, mediumMs, longMs) */
  constructor(animation) {
    this.#animation = animation;
  }

  /** @returns {readonly CardVisual[]} visuals still on their way out, drawn above the board */
  get leavingVisuals() {
    return [...this.#visuals.values()].filter((visual) => visual.isLeaving);
  }

  /** @returns {readonly { spec: FloatSpec, progress: number }[]} */
  get floats() {
    return this.#floats.map((float) => ({ spec: float.spec, progress: float.ageMs / float.durationMs }));
  }

  /** @param {string} instanceId */
  visualFor(instanceId) {
    return this.#visuals.get(instanceId) ?? null;
  }

  /** @param {string} instanceId */
  cardFor(instanceId) {
    return this.#cards.get(instanceId) ?? null;
  }

  /**
   * Reconciles visuals with a new snapshot and its events.
   * @param {ReturnType<import("../../application/match/MatchSession.js").MatchSession["snapshotFor"]>} snapshot
   * @param {readonly Readonly<Record<string, unknown>>[]} events already redacted for this perspective
   * @param {BoardLayout} layout
   * @param {boolean} animate false on first display: everything snaps into place
   */
  apply(snapshot, events, layout, animate = true) {
    const duration = animate ? this.#animation.mediumMs : 0;
    const present = new Set(Object.keys(layout.cards));
    for (const player of snapshot.players) {
      for (const card of [...player.battlefield, ...(player.hand ?? [])]) {
        this.#cards.set(card.instanceId, card);
        this.#place(card, layout, duration);
      }
    }
    for (const [instanceId, visual] of this.#visuals) {
      if (!present.has(instanceId) && !visual.isLeaving) {
        visual.leaveTo(this.#graveyardFor(instanceId, layout), animate ? this.#animation.longMs : 0);
      }
    }
    if (animate) {
      this.#enqueueFloats(events, layout);
      this.#enqueueNudges(events, layout);
    }
  }

  /**
   * @param {number} dtMs
   * @returns {boolean} whether anything moved (a render is needed)
   */
  update(dtMs) {
    let changed = false;
    for (const [instanceId, visual] of this.#visuals) {
      changed = visual.update(dtMs) || changed;
      if (visual.isGone) {
        this.#visuals.delete(instanceId);
        this.#cards.delete(instanceId);
        changed = true;
      }
    }
    if (this.#floats.length > 0) {
      for (const float of this.#floats) {
        float.ageMs += dtMs;
      }
      this.#floats = this.#floats.filter((float) => float.ageMs < float.durationMs);
      changed = true;
    }
    return changed;
  }

  get isAnimating() {
    return this.#floats.length > 0 || [...this.#visuals.values()].some((visual) => visual.isAnimating);
  }

  /**
   * @param {CardView} card
   * @param {BoardLayout} layout
   * @param {number} duration
   */
  #place(card, layout, duration) {
    const target = layout.cards[card.instanceId];
    const existing = this.#visuals.get(card.instanceId);
    if (existing !== undefined) {
      existing.moveTo(target, duration);
      return;
    }
    const origin = this.#originFor(card, layout);
    const visual = new CardVisual(card.instanceId, { ...origin, alpha: duration === 0 ? 1 : 0.2 });
    visual.moveTo(target, duration);
    this.#visuals.set(card.instanceId, visual);
  }

  /**
   * New cards come from the controller's hand (opponent plays) or from the
   * owner's HUD, which stands for the library (draws).
   * @param {CardView} card
   * @param {BoardLayout} layout
   */
  #originFor(card, layout) {
    const seat = card.controllerId === layout.me.id ? layout.me : layout.opponent;
    const fromHand = card.zone === ZoneType.BATTLEFIELD && seat === layout.opponent;
    const area = fromHand ? seat.hand : seat.hud;
    const size = layout.cards[card.instanceId];
    return { x: area.x + (area.width - size.width) / 2, y: area.y + (area.height - size.height) / 2, width: size.width, height: size.height };
  }

  /**
   * @param {string} instanceId
   * @param {BoardLayout} layout
   */
  #graveyardFor(instanceId, layout) {
    const card = this.#cards.get(instanceId);
    return card !== undefined && card.controllerId === layout.opponent.id ? layout.opponent.hud : layout.me.hud;
  }

  /**
   * @param {readonly Readonly<Record<string, unknown>>[]} events
   * @param {BoardLayout} layout
   */
  #enqueueFloats(events, layout) {
    for (const event of events) {
      const build = FLOAT_BUILDERS[/** @type {string} */ (event.type)];
      if (build === undefined || this.#floats.length >= MAX_FLOATS) {
        continue;
      }
      const { id, text, colorKey } = build(event);
      const anchor = typeof id === "string" ? this.#anchorFor(id, layout) : null;
      if (anchor !== null) {
        this.#floats.push({ spec: Object.freeze({ text, colorKey, x: anchor.x, y: anchor.y }), ageMs: 0, durationMs: this.#animation.longMs * 2 });
      }
    }
  }

  /**
   * A creature that dealt damage lunges toward its target.
   * @param {readonly Readonly<Record<string, unknown>>[]} events
   * @param {BoardLayout} layout
   */
  #enqueueNudges(events, layout) {
    for (const event of events) {
      if (event.type !== GameEventType.DAMAGE_DEALT || typeof event.sourceId !== "string" || typeof event.targetId !== "string") {
        continue;
      }
      const source = this.#visuals.get(event.sourceId);
      const target = this.#anchorFor(event.targetId, layout);
      if (source !== undefined && target !== null) {
        source.nudgeToward(target, this.#animation.shortMs);
      }
    }
  }

  /**
   * Where a floating number for `id` appears: the card's slot, else the
   * card's last drawn position (it may have just died), else the player's HUD.
   * @param {string} id
   * @param {BoardLayout} layout
   */
  #anchorFor(id, layout) {
    const slot = layout.cards[id] ?? this.#visuals.get(id)?.state;
    if (slot !== undefined) {
      return { x: slot.x + slot.width / 2, y: slot.y + slot.height / 3 };
    }
    const seat = [layout.me, layout.opponent].find((candidate) => candidate.id === id);
    return seat === undefined ? null : { x: seat.hud.x + seat.hud.width / 2, y: seat.hud.y + seat.hud.height / 2 };
  }
}

/** @type {Readonly<Record<string, (event: Readonly<Record<string, unknown>>) => { id: unknown, text: string, colorKey: string }>>} */
const FLOAT_BUILDERS = Object.freeze({
  [GameEventType.DAMAGE_DEALT]: (event) => ({ id: event.targetId, text: `-${event.amount}`, colorKey: "danger" }),
  [GameEventType.HEALED]: (event) => ({ id: event.targetId, text: `+${event.amount}`, colorKey: "success" }),
  [GameEventType.FATIGUE_DAMAGE]: (event) => ({ id: event.playerId, text: `-${event.amount} fatigue`, colorKey: "danger" }),
});

/** Vertical offset of a float at `progress` in [0, 1]. */
export function floatOffset(progress) {
  return -FLOAT_RISE * progress;
}
