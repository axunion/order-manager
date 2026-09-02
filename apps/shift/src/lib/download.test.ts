import { describe, expect, it } from "vitest";
import { toCsv } from "./download";

describe("toCsv", () => {
  it("starts with a BOM so Excel reads the Japanese as UTF-8", () => {
    expect(toCsv(["日付"], [["2026-09-01"]]).startsWith("﻿")).toBe(true);
  });

  it("separates rows with CRLF", () => {
    expect(toCsv(["a"], [["b"], ["c"]])).toBe("﻿a\r\nb\r\nc");
  });

  it("quotes a field containing a comma, and doubles internal quotes", () => {
    expect(toCsv(["名前"], [["田中, 太郎"], ['"急"']])).toBe(
      '﻿名前\r\n"田中, 太郎"\r\n"""急"""',
    );
  });

  it("leaves an ordinary field unquoted", () => {
    expect(toCsv(["時間"], [["09:00–17:00"]])).toBe("﻿時間\r\n09:00–17:00");
  });
});
