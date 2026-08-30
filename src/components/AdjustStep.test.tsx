import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n/i18n";
import { defaultAdjustments, type ImageAdjustments } from "../lib/image";
import { AdjustStep } from "./AdjustStep";

const crop = { top: 10, right: 20, bottom: 30, left: 15 };

beforeEach(async () => {
  await i18n.loadNamespaces("adjust");
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
  HTMLElement.prototype.setPointerCapture = vi.fn<(pointerId: number) => void>();
});

afterEach(() => vi.unstubAllGlobals());

function renderAdjust(adjustments: ImageAdjustments = { ...defaultAdjustments, crop }) {
  const onChange = vi.fn<(value: ImageAdjustments) => void>();
  render(
    <AdjustStep
      sourceUrl="blob:test"
      adjustments={adjustments}
      onChange={onChange}
      onBack={vi.fn<() => void>()}
      onAnalyze={vi.fn<() => void>()}
    />,
  );
  return onChange;
}

describe("AdjustStep crop controls", () => {
  it("keeps the original-image crop when rotating", async () => {
    const onChange = renderAdjust();
    await userEvent.click(screen.getByRole("button", { name: "右へ90°" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rotation: 90, crop }));
  });

  it("resets the crop to the full original image", async () => {
    const onChange = renderAdjust();
    await userEvent.click(screen.getByRole("button", { name: "元に戻す" }));

    expect(onChange).toHaveBeenCalledWith(defaultAdjustments);
  });

  it("exposes localized accessible names and keyboard adjustment", async () => {
    const onChange = renderAdjust();
    const image = screen.getByAltText("アップロードしたタイムテーブル");
    Object.defineProperties(image, {
      naturalWidth: { value: 1000 },
      naturalHeight: { value: 500 },
    });
    fireEvent.load(image);

    const move = await screen.findByRole("button", { name: "切り抜き領域を移動" });
    fireEvent.keyDown(move, { key: "ArrowRight", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ crop: { top: 10, right: 15, bottom: 30, left: 20 } }),
    );
    expect(screen.getByRole("button", { name: "切り抜き領域の右下角を調整" })).toBeInTheDocument();

    await i18n.changeLanguage("en");
    expect(screen.getByRole("button", { name: "Move crop area" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adjust crop area top edge" })).toBeInTheDocument();
  });

  it("focuses a clicked handle so arrow keys work without tabbing", async () => {
    const onChange = renderAdjust();
    const image = screen.getByAltText("アップロードしたタイムテーブル");
    Object.defineProperties(image, {
      naturalWidth: { value: 1000 },
      naturalHeight: { value: 500 },
    });
    fireEvent.load(image);

    const handle = await screen.findByRole("button", { name: "切り抜き領域の右下角を調整" });
    await userEvent.click(handle);
    expect(handle).toHaveFocus();

    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ crop: { top: 10, right: 25, bottom: 30, left: 15 } }),
    );
  });

  it("moves the crop with arrow keys without selecting a crop control", () => {
    const onChange = renderAdjust();
    const image = screen.getByAltText("アップロードしたタイムテーブル");
    Object.defineProperties(image, {
      naturalWidth: { value: 1000 },
      naturalHeight: { value: 500 },
    });
    fireEvent.load(image);

    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ crop: { top: 10, right: 15, bottom: 30, left: 20 } }),
    );
  });

  it("leaves arrow keys available to adjustment sliders", () => {
    const onChange = renderAdjust();
    const brightness = screen.getByRole("slider", { name: "明るさ" });

    fireEvent.keyDown(brightness, { key: "ArrowRight" });

    expect(onChange).not.toHaveBeenCalled();
  });
});
