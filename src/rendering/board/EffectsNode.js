/**
 * Transient overlay drawn above the cards: block arrows, cards on their
 * way to the graveyard and floating damage/heal numbers. It reads the
 * presenter and the layout every frame and holds no state of its own.
 */
import { drawCard } from "../cards/CardRenderer.js";
import { withAlpha } from "../theme/color.js";
import { bodyFont } from "../theme/Theme.js";
import { drawOutlinedText } from "../ui/drawing.js";
import { drawArrow } from "../ui/shapes.js";
import { UiNode } from "../ui/UiNode.js";
import { floatOffset } from "./MatchPresenter.js";

const ARROW_WIDTH = 5;
const ARROW_GLOW = 14;
const FLOAT_FONT = 34;
/** Floats start enlarged and settle to their size in the first part of their life. */
const FLOAT_POP = Object.freeze({ scale: 1.6, untilProgress: 0.18 });

/** @typedef {Readonly<{ attackerId: string, blockerId: string }>} Block */

export class EffectsNode extends UiNode {
  #presenter;
  #layout;
  #blocks;

  /**
   * @param {{ presenter: import("./MatchPresenter.js").MatchPresenter, layout: import("./BoardLayout.js").BoardLayout, blocks: readonly Block[] }} options
   */
  constructor({ presenter, layout, blocks }) {
    super({ id: "effects", width: layout.width, height: layout.height });
    this.passthrough = true;
    this.#presenter = presenter;
    this.#layout = layout;
    this.#blocks = blocks;
  }

  /**
   * @param {CanvasRenderingContext2D} context
   * @param {import("../theme/Theme.js").Theme} theme
   */
  paint(context, theme) {
    this.#paintBlocks(context, theme);
    for (const visual of this.#presenter.leavingVisuals) {
      const card = this.#presenter.cardFor(visual.instanceId);
      if (card !== null) {
        drawCard(context, theme, card, visual.state);
      }
    }
    this.#paintFloats(context, theme);
  }

  /**
   * Glowing arrows from each blocker to the attacker it blocks.
   * @param {CanvasRenderingContext2D} context
   * @param {import("../theme/Theme.js").Theme} theme
   */
  #paintBlocks(context, theme) {
    const { cards } = this.#layout;
    context.save();
    context.shadowColor = withAlpha(theme.colors.focus, 0.9);
    context.shadowBlur = ARROW_GLOW;
    for (const block of this.#blocks) {
      const from = cards[block.blockerId];
      const to = cards[block.attackerId];
      if (from === undefined || to === undefined) {
        continue;
      }
      drawArrow(context, { x: from.x + from.width / 2, y: from.y }, { x: to.x + to.width / 2, y: to.y + to.height }, { color: theme.colors.focus, width: ARROW_WIDTH });
    }
    context.restore();
  }

  /**
   * Damage and heal numbers pop in, rise and fade.
   * @param {CanvasRenderingContext2D} context
   * @param {import("../theme/Theme.js").Theme} theme
   */
  #paintFloats(context, theme) {
    context.save();
    for (const { spec, progress } of this.#presenter.floats) {
      const pop = progress < FLOAT_POP.untilProgress ? FLOAT_POP.scale - (FLOAT_POP.scale - 1) * (progress / FLOAT_POP.untilProgress) : 1;
      context.globalAlpha = 1 - progress;
      const color = theme.colors[spec.colorKey] ?? theme.colors.text;
      const box = { x: spec.x - 100, y: spec.y + floatOffset(progress) - FLOAT_FONT, width: 200, height: FLOAT_FONT * 2 };
      drawOutlinedText(context, spec.text, box, { font: bodyFont(theme, FLOAT_FONT * pop, "bold"), color, outline: withAlpha(theme.colors.letterbox, 0.9), outlineWidth: 5, glow: withAlpha(color, 0.9), glowBlur: 16 });
    }
    context.restore();
  }
}
