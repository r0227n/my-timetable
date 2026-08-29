import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n/i18n";
import { maxFileSize } from "../lib/image";
import { UploadStep } from "./UploadStep";

function image(name = "timetable.png", type = "image/png", size = 1): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function clipboardItem(file: File): DataTransferItem {
  return {
    kind: "file",
    type: file.type,
    getAsFile: () => file,
  } as DataTransferItem;
}

function textClipboardItem(): DataTransferItem {
  return {
    kind: "string",
    type: "text/plain",
    getAsFile: () => null,
  } as DataTransferItem;
}

function renderUpload(onFile = vi.fn<(file: File) => void>()) {
  const view = render(<UploadStep webGpu onFile={onFile} onManual={vi.fn<() => void>()} />);
  const zone = screen.getByRole("button", { name: /画像をドロップまたは貼り付け/ });
  const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { ...view, input, onFile, zone };
}

afterEach(async () => {
  await i18n.changeLanguage("ja");
});

describe("UploadStep image inputs", () => {
  it.each([
    ["JPEG", "image/jpeg"],
    ["PNG", "image/png"],
    ["WebP", "image/webp"],
  ])("accepts a %s image selected from the file picker", (_, type) => {
    const { input, onFile } = renderUpload();
    const file = image("timetable", type);

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("accepts one dropped image", () => {
    const { onFile, zone } = renderUpload();
    const file = image();

    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("accepts an image and ignores accompanying clipboard text when focused", () => {
    const { onFile, zone } = renderUpload();
    const file = image();
    zone.focus();

    fireEvent.paste(zone, {
      clipboardData: { items: [clipboardItem(file), textClipboardItem()] },
    });

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("ignores pasted images when the upload zone is not focused", () => {
    const { onFile, zone } = renderUpload();

    fireEvent.paste(zone, { clipboardData: { items: [clipboardItem(image())] } });

    expect(onFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores clipboard contents without an image", () => {
    const { onFile, zone } = renderUpload();
    zone.focus();

    fireEvent.paste(zone, { clipboardData: { items: [textClipboardItem()] } });

    expect(onFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects multiple files and allows a subsequent valid attempt", () => {
    const { onFile, zone } = renderUpload();

    fireEvent.drop(zone, { dataTransfer: { files: [image("one.png"), image("two.png")] } });
    expect(screen.getByRole("alert")).toHaveTextContent("画像は1枚だけ選択してください。");
    expect(onFile).not.toHaveBeenCalled();

    const valid = image("retry.png");
    fireEvent.drop(zone, { dataTransfer: { files: [valid] } });
    expect(onFile).toHaveBeenCalledWith(valid);
  });

  it("rejects multiple pasted images in English", async () => {
    await i18n.changeLanguage("en");
    const onFile = vi.fn<(file: File) => void>();
    render(<UploadStep webGpu onFile={onFile} onManual={vi.fn<() => void>()} />);
    const zone = screen.getByRole("button", { name: /Drop or paste an image/ });
    zone.focus();

    fireEvent.paste(zone, {
      clipboardData: { items: [clipboardItem(image("one.png")), clipboardItem(image("two.png"))] },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Select only one image.");
    expect(onFile).not.toHaveBeenCalled();
  });

  it.each([
    [
      "unsupported type",
      image("timetable.gif", "image/gif"),
      "JPEG、PNG、WebP形式の画像を選択してください。",
    ],
    [
      "oversized image",
      image("large.png", "image/png", maxFileSize + 1),
      "画像サイズは20MB以下にしてください。",
    ],
  ])("applies shared validation to an %s", (_, file, message) => {
    const { onFile, zone } = renderUpload();

    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(onFile).not.toHaveBeenCalled();
  });

  it("opens the file picker with Enter and Space", async () => {
    const user = userEvent.setup();
    const { input, zone } = renderUpload();
    const click = vi.spyOn(input, "click");
    zone.focus();

    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(click).toHaveBeenCalledTimes(2);
  });
});
