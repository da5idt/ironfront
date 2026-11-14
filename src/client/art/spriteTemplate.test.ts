import { describe, expect, it } from "vitest";
import { createPixelBuffer, pixelAt } from "./pixelBuffer";
import { paintTemplate, silhouette, tintSprite } from "./spriteTemplate";

describe("character-grid templates", () => {
  it("paints each character in its legend colour and leaves dots clear", () => {
    const buf = createPixelBuffer(3, 2);
    paintTemplate(buf, ["a.b", ".a."], { a: "#112233", b: "#445566" });
    expect(pixelAt(buf, 0, 0)).toBe("#112233");
    expect(pixelAt(buf, 1, 0)).toBeNull();
    expect(pixelAt(buf, 2, 0)).toBe("#445566");
    expect(pixelAt(buf, 1, 1)).toBe("#112233");
  });

  it("paints at an offset, over what is already there, and clips at the edges", () => {
    const buf = createPixelBuffer(3, 3);
    paintTemplate(buf, ["aaa", "aaa", "aaa"], { a: "#112233" });
    paintTemplate(buf, ["b.", "bb"], { b: "#445566" }, 2, 1);
    expect(pixelAt(buf, 2, 1)).toBe("#445566");
    expect(pixelAt(buf, 2, 2)).toBe("#445566");
    expect(pixelAt(buf, 1, 1)).toBe("#112233");
  });

  it("refuses a character the legend does not know, so a typo cannot paint a hole", () => {
    expect(() => paintTemplate(createPixelBuffer(2, 1), ["ax"], { a: "#112233" })).toThrow(/x/);
  });
});

describe("placement tint", () => {
  it("moves every colour part of the way to the tint and keeps what was clear, clear", () => {
    const buf = createPixelBuffer(2, 1);
    paintTemplate(buf, ["a."], { a: "#000000" });
    const green = tintSprite(buf, "#00ff00", 0.5);
    expect(pixelAt(green, 0, 0)).toBe("#008000");
    expect(pixelAt(green, 1, 0)).toBeNull();
  });

  it("keeps light and dark apart, so the sprite still reads under the wash", () => {
    const buf = createPixelBuffer(2, 1);
    paintTemplate(buf, ["ab"], { a: "#202020", b: "#e0e0e0" });
    const red = tintSprite(buf, "#ff0000", 0.5);
    expect(pixelAt(red, 0, 0)).not.toBe(pixelAt(red, 1, 0));
  });
});

describe("cast shadow", () => {
  it("is the sprite's shape in one colour at one opacity", () => {
    const buf = createPixelBuffer(2, 2);
    paintTemplate(buf, ["a.", "ba"], { a: "#112233", b: "#445566" });
    const shadow = silhouette(buf, "#010203", 90);
    expect(pixelAt(shadow, 0, 0)).toBe("#010203");
    expect(pixelAt(shadow, 0, 1)).toBe("#010203");
    expect(pixelAt(shadow, 1, 0)).toBeNull();
    expect(shadow.data[3]).toBe(90);
  });
});
