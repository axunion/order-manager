import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadJson } from "./download";

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
