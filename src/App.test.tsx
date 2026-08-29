import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("Phase 1 manual flow", () => {
  beforeEach(() => localStorage.clear());

  it("allows manual editing and schedule selection without WebGPU", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText("画像は端末の外へ送信されません")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));

    await user.type(screen.getByPlaceholderText("イベント名"), "テストフェス");
    await user.type(screen.getByLabelText("出演者名"), "Example Artist");
    await user.type(screen.getByLabelText("開始時刻"), "10:00");
    await user.type(screen.getByLabelText("終了時刻"), "10:30");
    const date = screen.getByLabelText(/開催日/);
    await user.type(date, "2026-08-27");
    await user.click(screen.getByRole("button", { name: "予定を選ぶ" }));

    expect(screen.getAllByText("Example Artist").length).toBeGreaterThan(0);
    expect(screen.getByText("時間の重なりはありません")).toBeInTheDocument();
  });

  it("keeps selections that are hidden by a filter when selecting every visible schedule", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));
    await user.type(screen.getByLabelText(/開催日/), "2026-08-27");
    await user.type(screen.getByLabelText("出演者名"), "Artist A");
    await user.click(screen.getByRole("button", { name: "行を追加" }));
    const artists = screen.getAllByLabelText("出演者名");
    await user.type(artists[1], "Artist B");
    const scheduleTypes = screen.getAllByLabelText("種別");
    await user.selectOptions(scheduleTypes[1], "meet_and_greet");
    await user.click(screen.getByRole("button", { name: "予定を選ぶ" }));

    await user.selectOptions(screen.getByLabelText("種別で絞り込み"), "live");
    await user.click(screen.getByRole("button", { name: "表示中を全選択" }));

    expect(within(screen.getByText("件選択中").parentElement!).getByText("2")).toBeInTheDocument();
  });

  it("allows schedule selection before the event date is known", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));
    await user.type(screen.getByLabelText("出演者名"), "Artist A");

    const next = screen.getByRole("button", { name: "予定を選ぶ" });
    expect(next).toBeEnabled();
    await user.click(next);
    expect(screen.getByRole("heading", { name: "行きたい予定を選ぶ" })).toBeInTheDocument();
  });

  it("warns when a schedule ends before it starts", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));
    await user.type(screen.getByLabelText("出演者名"), "Artist A");
    await user.type(screen.getByLabelText("開始時刻"), "11:00");
    await user.type(screen.getByLabelText("終了時刻"), "10:00");

    expect(screen.getByText("終了時刻は開始時刻より後にしてください")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "予定を選ぶ" }));
    expect(screen.getByText(/終了時刻が開始時刻以前/)).toBeInTheDocument();
  });

  it("exposes every editable event and schedule field", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));

    expect(screen.getByLabelText("開場時刻")).toBeInTheDocument();
    expect(screen.getByLabelText("開演時刻")).toBeInTheDocument();
    expect(screen.getByLabelText("注記")).toBeInTheDocument();
    expect(screen.getByLabelText("相対時刻表現")).toBeInTheDocument();
    expect(screen.getByLabelText("撮影等の属性")).toBeInTheDocument();
  });

  it("switches language without losing in-progress data", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));
    await user.type(screen.getByLabelText("出演者名"), "Artist A");

    await user.click(screen.getByRole("button", { name: "表示言語: 日本語" }));
    expect(screen.getByRole("menu", { name: "表示言語" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitemradio", { name: "English" }));

    expect(await screen.findByRole("heading", { name: "Review the extracted data" })).toBeInTheDocument();
    expect(screen.getByLabelText("Artist")).toHaveValue("Artist A");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("ui.language")).toBe("en");
    expect(screen.getByRole("button", { name: "Display language: English" })).toBeInTheDocument();
  });

  it("continues from selection to timeline and export", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "画像を使わず手入力ではじめる" }));
    await user.type(screen.getByLabelText(/開催日/), "2026-08-27");
    await user.type(screen.getByLabelText("出演者名"), "Artist A");
    await user.type(screen.getByLabelText("開始時刻"), "10:00");
    await user.type(screen.getByLabelText("終了時刻"), "10:30");
    await user.click(screen.getByRole("button", { name: "予定を選ぶ" }));
    await user.click(screen.getByRole("button", { name: "タイムラインを作る" }));

    expect(screen.getByRole("heading", { name: "タイムラインを整える" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "出力へ進む" }));
    expect(screen.getByRole("alert")).toHaveTextContent("low信頼度の未確認予定が1件");
    expect(screen.getByRole("button", { name: "SVGを保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PNGを保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ICSを保存" })).toBeInTheDocument();
  });
});
