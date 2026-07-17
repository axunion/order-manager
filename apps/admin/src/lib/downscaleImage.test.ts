import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downscaleImage } from "./downscaleImage";

function stubImageBitmap(width: number, height: number) {
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width, height, close }),
  );
  return close;
}

function stubCanvas() {
  const drawImage = vi.fn();
  const toBlob = vi.fn(
    (cb: (blob: Blob | null) => void, type: string, _quality: number) => {
      cb(new Blob(["fake"], { type }));
    },
  );
  const getContext = vi.fn().mockReturnValue({ drawImage });

  const canvas = {
    width: 0,
    height: 0,
    getContext,
    toBlob,
  } as unknown as HTMLCanvasElement;

  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag === "canvas") return canvas;
    throw new Error(`Unexpected createElement("${tag}") in test`);
  }) as typeof document.createElement);

  return { canvas, drawImage, toBlob, getContext };
}

const fakeFile = new File(["fake"], "photo.jpg", { type: "image/jpeg" });

describe("downscaleImage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("leaves an image already within the 1200px bound at its original size", async () => {
    stubImageBitmap(800, 600);
    const { canvas } = stubCanvas();

    await downscaleImage(fakeFile);

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it("scales down an image wider than 1200px, preserving aspect ratio", async () => {
    stubImageBitmap(2400, 1200);
    const { canvas } = stubCanvas();

    await downscaleImage(fakeFile);

    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(600);
  });

  it("scales down a portrait image using the taller edge", async () => {
    stubImageBitmap(1200, 3600);
    const { canvas } = stubCanvas();

    await downscaleImage(fakeFile);

    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(1200);
  });

  it("encodes the result as JPEG at ~0.8 quality", async () => {
    stubImageBitmap(800, 600);
    const { toBlob } = stubCanvas();

    const blob = await downscaleImage(fakeFile);

    expect(toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.8,
    );
    expect(blob.type).toBe("image/jpeg");
  });

  it("releases the decoded bitmap after drawing", async () => {
    const close = stubImageBitmap(800, 600);
    stubCanvas();

    await downscaleImage(fakeFile);

    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects when the canvas fails to encode a blob, but still releases the bitmap", async () => {
    const close = stubImageBitmap(800, 600);
    const { toBlob } = stubCanvas();
    toBlob.mockImplementation((cb: (blob: Blob | null) => void) => cb(null));

    await expect(downscaleImage(fakeFile)).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });
});
