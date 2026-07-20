import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadCsv, downloadJson } from "./download";

describe("downloadJson", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates an object URL from the JSON-serialized data and triggers a click on an attached anchor", () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const appendChild = vi.spyOn(document.body, "appendChild");

    downloadJson({ hello: "world" }, "export.json");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("application/json");

    expect(click).toHaveBeenCalledTimes(1);
    // The anchor was attached to the document before click() — some
    // browsers require this for `download` to fire reliably.
    expect(appendChild).toHaveBeenCalled();
    const attachedLink = appendChild.mock.calls[0]?.[0] as HTMLAnchorElement;
    expect(attachedLink.href).toBe("blob:mock-url");
    expect(attachedLink.download).toBe("export.json");
  });

  it("removes the anchor from the document after clicking", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadJson({ a: 1 }, "export.json");

    expect(document.body.querySelector("a[download='export.json']")).toBeNull();
  });

  it("revokes the object URL only after a delay, not immediately", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadJson({ a: 1 }, "export.json");
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});

describe("downloadCsv", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function captureBlob() {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    return createObjectURL;
  }

  it("builds a UTF-8 CSV with a BOM prefix (for Excel) and CRLF line endings", async () => {
    const createObjectURL = captureBlob();

    downloadCsv(
      ["商品名", "数量", "売上金額"],
      [["ラーメン", 3, 2400]],
      "ranking.csv",
    );

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8;");
    const text = await blob.text();
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(text.slice(1)).toBe("商品名,数量,売上金額\r\nラーメン,3,2400");
  });

  it("quotes fields containing commas, quotes, or newlines", async () => {
    const createObjectURL = captureBlob();

    downloadCsv(["name", "note"], [['A, B"', "line1\nline2"]], "export.csv");

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    const text = (await blob.text()).slice(1); // drop BOM
    expect(text).toBe('name,note\r\n"A, B""","line1\nline2"');
  });

  it("triggers the same download mechanism as downloadJson", () => {
    captureBlob();
    const appendChild = vi.spyOn(document.body, "appendChild");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");

    downloadCsv(["a"], [[1]], "export.csv");

    expect(appendChild).toHaveBeenCalled();
    const link = appendChild.mock.calls[0]?.[0] as HTMLAnchorElement;
    expect(link.download).toBe("export.csv");
    expect(click).toHaveBeenCalledTimes(1);
  });
});
