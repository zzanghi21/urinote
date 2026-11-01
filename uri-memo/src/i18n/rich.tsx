import { Fragment, type ReactNode } from "react";
import { t } from "./index";

/**
 * Translation with elements (like a bold name) inside the sentence:
 *   tRich("{name}에게 친구 요청을 보냈습니다.", { name: <b>{peer}</b> })
 * The element goes into the {name} slot of the translation, whatever the word order.
 */
export function tRich(ko: string, vars: Record<string, ReactNode>): ReactNode {
  const marker = "\u0000";
  // translate with the placeholders kept, then swap in the elements
  const keep = Object.fromEntries(Object.keys(vars).map((k) => [k, `${marker}${k}${marker}`]));
  const parts = t(ko, keep).split(marker);
  return parts.map((part, i) => <Fragment key={i}>{i % 2 === 1 ? vars[part] : part}</Fragment>);
}
