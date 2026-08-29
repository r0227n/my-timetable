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

type InputMethod = "file picker" | "drag and drop" | "clipboard paste";

function submitImage(method: InputMethod, file: File, input: HTMLInputElement, zone: HTMLElement) {
  if (method === "file picker") {
    fireEvent.change(input, { target: { files: [file] } });
    return;
  }
  if (method === "drag and drop") {
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    return;
  }
  zone.focus();
  fireEvent.paste(zone, { clipboardData: { items: [clipboardItem(file)] } });
}

afterEach(async () => {
  await i18n.changeLanguage("ja");
});

describe("UploadStep image inputs", () => {
  it.each([
    ["file picker", "JPEG", "image/jpeg"],
    ["file picker", "PNG", "image/png"],
    ["file picker", "WebP", "image/webp"],
    ["drag and drop", "JPEG", "image/jpeg"],
    ["drag and drop", "PNG", "image/png"],
    ["drag and drop", "WebP", "image/webp"],
    ["clipboard paste", "JPEG", "image/jpeg"],
    ["clipboard paste", "PNG", "image/png"],
    ["clipboard paste", "WebP", "image/webp"],
  ] satisfies [InputMethod, string, string][])("accepts a %s %s image", (method, _, type) => {
    const { input, onFile, zone } = renderUpload();
    const file = image("timetable", type);

    submitImage(method, file, input, zone);

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

  it("rejects multiple files selected from the file picker", () => {
    const { input, onFile } = renderUpload();

    fireEvent.change(input, { target: { files: [image("one.png"), image("two.png")] } });

    expect(screen.getByRole("alert")).toHaveTextContent("画像は1枚だけ選択してください。");
    expect(onFile).not.toHaveBeenCalled();
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
      "file picker",
      "unsupported type",
      image("timetable.gif", "image/gif"),
      "JPEG、PNG、WebP形式の画像を選択してください。",
    ],
    [
      "drag and drop",
      "unsupported type",
      image("timetable.gif", "image/gif"),
      "JPEG、PNG、WebP形式の画像を選択してください。",
    ],
    [
      "clipboard paste",
      "unsupported type",
      image("timetable.gif", "image/gif"),
      "JPEG、PNG、WebP形式の画像を選択してください。",
    ],
    [
      "file picker",
      "oversized image",
      image("large.png", "image/png", maxFileSize + 1),
      "画像サイズは20MB以下にしてください。",
    ],
    [
      "drag and drop",
      "oversized image",
      image("large.png", "image/png", maxFileSize + 1),
      "画像サイズは20MB以下にしてください。",
    ],
    [
      "clipboard paste",
      "oversized image",
      image("large.png", "image/png", maxFileSize + 1),
      "画像サイズは20MB以下にしてください。",
    ],
  ] satisfies [InputMethod, string, File, string][])("%s rejects an %s", (method, _, file, message) => {
    const { input, onFile, zone } = renderUpload();

    submitImage(method, file, input, zone);

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
