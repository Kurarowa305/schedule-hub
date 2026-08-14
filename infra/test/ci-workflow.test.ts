import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const workflowPath = fileURLToPath(
  new URL("../../.github/workflows/ci.yml", import.meta.url),
);

describe("CI品質ゲート", () => {
  it("PRとmainへのpushで品質検査とCDK synthを実行する", () => {
    const workflow = parse(readFileSync(workflowPath, "utf8")) as {
      on: { pull_request: unknown; push: { branches: string[] } };
      jobs: Record<
        string,
        { steps: Array<{ run?: string; with?: { "node-version"?: string } }> }
      >;
    };

    expect(workflow.on.pull_request).toEqual({});
    expect(workflow.on.push.branches).toEqual(["main"]);
    expect(Object.keys(workflow.jobs).sort()).toEqual([
      "cdk-synth",
      "lint",
      "test",
      "typecheck",
    ]);

    for (const job of Object.values(workflow.jobs)) {
      expect(
        job.steps.some((step) => step.with?.["node-version"] === "22"),
      ).toBe(true);
      expect(job.steps.some((step) => step.run === "npm ci")).toBe(true);
    }

    expect(
      workflow.jobs.lint.steps.some((step) => step.run === "npm run lint"),
    ).toBe(true);
    expect(
      workflow.jobs.typecheck.steps.some(
        (step) => step.run === "npm run typecheck",
      ),
    ).toBe(true);
    expect(
      workflow.jobs.test.steps.some((step) => step.run === "npm test"),
    ).toBe(true);
    expect(
      workflow.jobs["cdk-synth"].steps.some(
        (step) => step.run === "npm run synth --workspace=@schedule-hub/infra",
      ),
    ).toBe(true);
  });
});
