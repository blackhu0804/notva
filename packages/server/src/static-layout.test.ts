import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("web workbench layout CSS", () => {
  test("uses explicit grid areas so localized labels do not scramble card placement", async () => {
    const css = await readFile(new URL("../../web/static/styles.css", import.meta.url), "utf8");

    expect(css).toContain("grid-template-areas");
    expect(css).toContain('"source query pages"');
    expect(css).toContain('"review act pages"');
    expect(css).toContain('"lint act pages"');
    expect(css).toContain(".source-panel");
    expect(css).toContain("grid-area: source");
    expect(css).toContain("grid-area: review");
    expect(css).toContain("grid-area: query");
    expect(css).toContain("grid-area: act");
    expect(css).toContain("grid-area: pages");
    expect(css).toContain("grid-area: lint");
    expect(css).toContain(".panel-head h2");
    expect(css).toContain("white-space: nowrap");
    expect(css).toContain(".panel-head select");
    expect(css).toContain("width: auto");
  });
});
