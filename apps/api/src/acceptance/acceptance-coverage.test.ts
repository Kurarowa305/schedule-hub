import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const coverage = readFileSync(
  fileURLToPath(
    new URL("../../../../docs/受入テスト対応表.md", import.meta.url),
  ),
  "utf8",
);

describe("AC-001〜AC-022の自動テスト追跡", () => {
  it("全受入条件を重複なく対応表へ記載する", () => {
    const ids = [...coverage.matchAll(/^\| (AC-\d{3}) \|/gm)].map(
      ([, id]) => id,
    );
    expect(ids).toEqual(
      Array.from(
        { length: 22 },
        (_, index) => `AC-${String(index + 1).padStart(3, "0")}`,
      ),
    );
  });

  it("対応表に記載した自動テストファイルがすべて存在する", () => {
    const paths = [
      ...coverage.matchAll(/`((?:apps|packages|infra)\/[^`]+\.test\.tsx?)`/g),
    ].map(([, path]) => path);
    expect(paths.length).toBeGreaterThanOrEqual(22);
    expect(
      paths.filter((path) => !existsSync(`${repositoryRoot}/${path}`)),
    ).toEqual([]);
  });
});
