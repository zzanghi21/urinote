import { Fragment, type ReactNode } from "react";
import { t } from "./index";

/**
 * 문장 가운데에 굵은 이름 같은 요소를 넣는 번역:
 *   tRich("{name}에게 친구 요청을 보냈습니다.", { name: <b>{peer}</b> })
 * 영어는 어순이 달라도 번역문의 {name} 자리에 들어간다.
 */
export function tRich(ko: string, vars: Record<string, ReactNode>): ReactNode {
  const marker = "\u0000";
  // 자리 표시를 그대로 남긴 채 번역한 뒤 요소로 바꾼다
  const keep = Object.fromEntries(Object.keys(vars).map((k) => [k, `${marker}${k}${marker}`]));
  const parts = t(ko, keep).split(marker);
  return parts.map((part, i) => <Fragment key={i}>{i % 2 === 1 ? vars[part] : part}</Fragment>);
}
