import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { setLocale, t } from "../src/i18n";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const HANGUL = /[가-힣]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== "en.ts"
      ? [path]
      : [];
  });
}

/** 주석을 지운다 (문자열 안의 // 는 남긴다) */
function stripComments(code: string) {
  return code.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (m, str: string | undefined) => str ?? "",
  );
}

const STRING = /"((?:\\.|[^"\\\n])*)"|'((?:\\.|[^'\\\n])*)'|`((?:\\.|[^`\\])*)`/g;

/** 소스의 한국어 문자열 리터럴, 그리고 문자열 밖에 남은 한국어(JSX 텍스트 등) */
function scan() {
  const literals: { file: string; text: string; template: boolean }[] = [];
  const bare: { file: string; line: string }[] = [];
  for (const path of sourceFiles(SRC)) {
    const file = relative(SRC, path);
    const code = stripComments(readFileSync(path, "utf8"));
    for (const m of code.matchAll(STRING)) {
      const raw = m[1] ?? m[2] ?? m[3] ?? "";
      if (!HANGUL.test(raw)) continue;
      // 소스의 이스케이프(\n, \")를 실제 문자로
      const text = JSON.parse(
        `"${raw.replace(/\\'/g, "'").replace(/(?<!\\)"/g, '\\"')}"`,
      ) as string;
      literals.push({ file, text, template: m[3] !== undefined && raw.includes("${") });
    }
    const outside = code.replace(STRING, "");
    for (const line of outside.split("\n"))
      if (HANGUL.test(line)) bare.push({ file, line: line.trim() });
  }
  return { literals, bare };
}

describe("i18n", () => {
  afterEach(() => setLocale("ko"));

  it("has an English translation for every Korean string in the app", () => {
    const { literals } = scan();
    const missing = [
      ...new Set(literals.filter((l) => !(l.text in en)).map((l) => `${l.file}: ${l.text}`)),
    ];
    expect(missing).toEqual([]);
  });

  it("puts no Korean outside of translatable strings (JSX text, template literals)", () => {
    const { literals, bare } = scan();
    expect(bare.map((b) => `${b.file}: ${b.line}`)).toEqual([]);
    expect(literals.filter((l) => l.template).map((l) => `${l.file}: ${l.text}`)).toEqual([]);
  });

  it("keeps the same {placeholders} in translations", () => {
    for (const [ko, tr] of Object.entries(en)) {
      if (typeof tr !== "string") continue;
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(names(tr), ko).toEqual(names(ko));
    }
  });

  it("translates with variables and falls back to Korean", () => {
    setLocale("en");
    expect(t("친구 {count}명 중 {online}명 연결됨", { count: 3, online: 1 })).toBe(
      "1 of 3 friends connected",
    );
    expect(t("없는 문구")).toBe("없는 문구");
    setLocale("ko");
    expect(t("친구 {count}명 중 {online}명 연결됨", { count: 3, online: 1 })).toBe(
      "친구 3명 중 1명 연결됨",
    );
  });
});
