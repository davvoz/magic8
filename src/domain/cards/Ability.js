/**
 * An ability is a (trigger, effect, params, target) tuple declared in card
 * data and validated at load time. It is immutable and shared by every
 * instance of its card.
 */
export class Ability {
  /** @type {string} */
  trigger;
  /** @type {string} */
  effect;
  /** @type {Readonly<Record<string, number | string>>} */
  params;
  /** @type {import("../effects/TargetSpec.js").TargetSpec | null} */
  target;

  /**
   * @param {{ trigger: string, effect: string, params: Readonly<Record<string, number | string>>, target: import("../effects/TargetSpec.js").TargetSpec | null }} fields
   */
  constructor({ trigger, effect, params, target }) {
    this.trigger = trigger;
    this.effect = effect;
    this.params = params;
    this.target = target;
    Object.freeze(this);
  }

  get requiresTarget() {
    return this.target !== null;
  }
}
