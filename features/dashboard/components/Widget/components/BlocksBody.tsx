"use client";

import type { WidgetData } from "@/features/dashboard/types";
import {
  blockWidget,
  labelsOf,
  shownBlocks,
} from "@/features/dashboard/widgets";
import styles from "../widget.module.scss";
import { ChartBody } from "./ChartBody";
import { ListBody } from "./ListBody";
import { NumberBody } from "./NumberBody";
import type { BodyProps } from "./shared";

/** Blocks that take the room left over — charts and lists. */
const GROWS = new Set(["distribution", "flow", "matrix", "issues"]);

/**
 * A custom widget's building blocks, top to bottom (BARY-170). Each block
 * draws with its own kind's body, as a widget of that kind at this size.
 * `activeElement` is `<block>` or `<block>:<element>` — the builder marks
 * what's being edited.
 */
export function BlocksBody({
  data,
  ...props
}: BodyProps & { data: Extract<WidgetData, { type: "blocks" }> }) {
  const blocks = shownBlocks(props.widget);
  const [activeBlock, activeElement] = (props.activeElement ?? "").split(":");
  return (
    <div className={styles.blocks}>
      {blocks.map((block) => {
        const widget = blockWidget(props.widget, block);
        const own = data.blocks[block.id];
        const body = {
          ...props,
          widget,
          labels: labelsOf(widget),
          activeElement:
            activeBlock === block.id ? activeElement || undefined : undefined,
        };
        return (
          <div
            key={block.id}
            className={styles.block}
            data-grow={GROWS.has(block.type) || undefined}
            data-active={
              (activeBlock === block.id && !activeElement) || undefined
            }
          >
            {!own ? null : own.type === "kpi" || own.type === "progress" ? (
              <NumberBody {...body} data={own} />
            ) : own.type === "issues" ? (
              <ListBody {...body} data={own} />
            ) : own.type === "distribution" ||
              own.type === "flow" ||
              own.type === "matrix" ? (
              <ChartBody {...body} data={own} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
