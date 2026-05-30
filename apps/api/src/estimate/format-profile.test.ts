import { describe, it, expect } from "vitest";
import { categoriesForFormat, checklistKeysForFormat } from "./format-profile";

describe("format profiles (kamernaya anti-classic, §11.3)", () => {
  it("kamernaya drops host/big-banquet categories", () => {
    const all = ["banquet", "venue", "photo", "host", "decor", "dress", "music"];
    const kam = categoriesForFormat("kamernaya", all);
    expect(kam).not.toContain("host");
    expect(kam).toContain("photo");
  });
  it("zags keeps the classic category set", () => {
    const all = ["banquet", "venue", "photo", "host"];
    expect(categoriesForFormat("zags", all)).toEqual(all);
  });
  it("kamernaya swaps to a lighter checklist branch", () => {
    const keys = checklistKeysForFormat("kamernaya", "msk");
    expect(keys).not.toContain("book_host");
  });
});
