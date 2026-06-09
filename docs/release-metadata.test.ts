import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const packagePaths = [
  "../package.json",
  "../packages/cli/package.json",
  "../packages/core/package.json",
  "../packages/providers/package.json",
  "../packages/server/package.json"
];

describe("release metadata", () => {
  test("declares an open-source license for publishable packages", async () => {
    const license = await readFile(new URL("../LICENSE", import.meta.url), "utf8");

    expect(license).toContain("MIT License");
    expect(license).toContain("Notva contributors");

    for (const packagePath of packagePaths) {
      const manifest = JSON.parse(await readFile(new URL(packagePath, import.meta.url), "utf8")) as {
        name: string;
        license?: string;
      };
      expect(manifest.license, manifest.name).toBe("MIT");
    }
  });
});
