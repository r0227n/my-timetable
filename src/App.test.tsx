import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("Phase 1 manual flow", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    Reflect.deleteProperty(navigator, "gpu");
    Reflect.deleteProperty(navigator, "deviceMemory");
  });

  it("shows the selected model and explains why E4B is unavailable", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "選択中のモデル: Gemma 4 E2B" }));
    expect(screen.getByRole("menu", { name: "Gemmaモデル" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /Gemma 4 E4B/ })).toBeDisabled();
    expect(screen.getByText("WebGPUに対応していないため利用できません。")).toBeInTheDocument();
    expect(screen.getByText(/変更は次回の解析開始時から反映/)).toBeInTheDocument();
  });

  it("persists an E2B fallback when a stored E4B selection is no longer available", async () => {
    localStorage.setItem("ui.gemmaModel", "e4b");
    render(<App />);

    expect(screen.getByRole("button", { name: "選択中のモデル: Gemma 4 E2B" })).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem("ui.gemmaModel")).toBe("e2b"));
  });

  it("selects and restores E4B on a capable device", async () => {
    Object.defineProperty(navigator, "gpu", { configurable: true, value: {} });
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, value: 8 });
    const user = userEvent.setup();
    const view = render(<App />);

    await user.click(screen.getByRole("button", { name: "選択中のモデル: Gemma 4 E2B" }));
    await user.click(screen.getByRole("menuitemradio", { name: /Gemma 4 E4B/ }));
    expect(screen.getByRole("button", { name: "選択中のモデル: Gemma 4 E4B" })).toHaveFocus();
    expect(localStorage.getItem("ui.gemmaModel")).toBe("e4b");

    view.unmount();
    render(<App />);
    expect(screen.getByRole("button", { name: "選択中のモデル: Gemma 4 E4B" })).toBeInTheDocument();
  });

  it("allows manual editing and schedule selection without WebGPU", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText("画像は端末の外へ送信されません")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));
    await screen.findByLabelText("出演者名");

    await user.type(screen.getByPlaceholderText("イベント名"), "テストフェス");
    await user.type(screen.getByLabelText("出演者名"), "Example Artist");
    await user.type(screen.getByLabelText("開始時刻"), "10:00");
    await user.type(screen.getByLabelText("終了時刻"), "10:30");
    const date = screen.getByLabelText(/開催日/);
    await user.type(date, "2026-08-27");
    await user.click(screen.getByRole("checkbox", { name: "Example Artistを確認済みにする" }));
    await user.click(screen.getByRole("button", { name: "予定を選ぶ" }));

    expect(screen.getAllByText("Example Artist").length).toBeGreaterThan(0);
    expect(await screen.findByText("時間の重なりはありません")).toBeInTheDocument();
  });

  it("keeps selections that are hidden by a filter when selecting every visible schedule", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));
    await screen.findByLabelText("出演者名");
    await user.type(screen.getByLabelText(/開催日/), "2026-08-27");
    await user.type(screen.getByLabelText("出演者名"), "Artist A");
    await user.type(screen.getByLabelText("開始時刻"), "10:00");
    await user.type(screen.getByLabelText("終了時刻"), "10:30");
    await user.click(screen.getByRole("checkbox", { name: "Artist Aを確認済みにする" }));
    await user.click(screen.getByRole("button", { name: "行を追加" }));
    await user.type(screen.getByLabelText("出演者名"), "Artist B");
    await user.type(screen.getByLabelText("開始時刻"), "11:00");
    await user.type(screen.getByLabelText("終了時刻"), "11:30");
    await user.selectOptions(screen.getByLabelText("種別"), "meet_and_greet");
    await user.click(screen.getByRole("checkbox", { name: "Artist Bを確認済みにする" }));
    await user.click(screen.getByRole("button", { name: "予定を選ぶ" }));

    await user.selectOptions(screen.getByLabelText("種別で絞り込み"), "live");
    await user.click(screen.getByRole("button", { name: "表示中を全選択" }));

    expect(within(screen.getByText("件選択中").parentElement!).getByText("2")).toBeInTheDocument();
  });

  it("requires a complete verified schedule before selection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));
    await screen.findByLabelText("出演者名");
    await user.type(screen.getByLabelText("出演者名"), "Artist A");

    const next = screen.getByRole("button", { name: "予定を選ぶ" });
    expect(next).toBeDisabled();
    expect(screen.getByText(/次の画面の選択対象外/)).toBeInTheDocument();
  });

  it("warns when a schedule ends before it starts", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));
    await screen.findByLabelText("出演者名");
    await user.type(screen.getByLabelText("出演者名"), "Artist A");
    await user.type(screen.getByLabelText("開始時刻"), "11:00");
    await user.type(screen.getByLabelText("終了時刻"), "10:00");

    expect(screen.getByText("終了時刻は開始時刻より後にしてください")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "予定を選ぶ" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Artist Aを確認済みにする" })).toBeDisabled();
  });

  it("exposes every editable event and schedule field", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));
    await screen.findByLabelText("出演者名");

    expect(screen.getByLabelText("開場時刻")).toBeInTheDocument();
    expect(screen.getByLabelText("開演時刻")).toBeInTheDocument();
    expect(screen.getByLabelText("注記")).toBeInTheDocument();
    expect(screen.getByLabelText("相対時刻表現")).toBeInTheDocument();
    expect(screen.getByLabelText("撮影等の属性")).toBeInTheDocument();
  });

  it("shows the type and schedule date controls in the detail panel in both languages", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));
    await screen.findByLabelText("出演者名");

    const expectDetailControls = (typeLabel: string, dateLabel: string) => {
      expect(screen.getByRole("combobox", { name: typeLabel })).toBeInTheDocument();
      expect(screen.getByLabelText(dateLabel)).toHaveAttribute("type", "date");
    };

    expectDetailControls("種別", "予定日");

    await user.click(screen.getByRole("button", { name: "表示言語: 日本語" }));
    await user.click(screen.getByRole("menuitemradio", { name: "English" }));
    await screen.findByRole("heading", { name: "Review the extracted data" });
    expectDetailControls("Type", "Schedule date");
  });

  it("switches language without losing in-progress data", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));
    await screen.findByLabelText("出演者名");
    await user.type(screen.getByLabelText("出演者名"), "Artist A");

    await user.click(screen.getByRole("button", { name: "表示言語: 日本語" }));
    expect(screen.getByRole("menu", { name: "表示言語" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitemradio", { name: "English" }));

    expect(await screen.findByRole("heading", { name: "Review the extracted data" })).toBeInTheDocument();
    expect(screen.getByLabelText("Artist")).toHaveValue("Artist A");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("ui.language")).toBe("en");
    const languageButton = screen.getByRole("button", { name: "Display language: English" });
    expect(languageButton).toBeInTheDocument();
    expect(languageButton).toHaveFocus();
  });

  it("continues from selection to timeline and export", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));
    await screen.findByLabelText("出演者名");
    await user.type(screen.getByLabelText(/開催日/), "2026-08-27");
    await user.type(screen.getByLabelText("出演者名"), "Artist A");
    await user.type(screen.getByLabelText("開始時刻"), "10:00");
    await user.type(screen.getByLabelText("終了時刻"), "10:30");
    await user.click(screen.getByRole("checkbox", { name: "Artist Aを確認済みにする" }));
    await user.click(screen.getByRole("button", { name: "予定を選ぶ" }));
    await user.click(await screen.findByRole("button", { name: "タイムラインを作る" }));

    expect(await screen.findByRole("heading", { name: "タイムラインを整える" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "出力へ進む" }));
    expect(await screen.findByRole("button", { name: "SVGを保存" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "PNGを保存" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "ICSを保存" })).toBeInTheDocument();
  });
});
