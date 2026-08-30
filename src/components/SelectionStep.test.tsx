import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createBlankSchedule, createEmptyDocument } from "../domain/timetable";
import { SelectionStep } from "./SelectionStep";

describe("SelectionStep related and common schedules", () => {
  it("selects a relation group independently from artist selection and lists common schedules separately", async () => {
    const user = userEvent.setup();
    const document = {
      ...createEmptyDocument(),
      event: { ...createEmptyDocument().event, date: "2026-09-13" },
      schedules: [
        createBlankSchedule({
          id: "live",
          artist: "Idol A",
          type: "live",
          startTime: "09:30",
          endTime: "09:50",
          relationGroupId: "relation-1",
          verified: true,
        }),
        createBlankSchedule({
          id: "merch",
          artist: "Idol A",
          title: "物販・特典会",
          type: "meet_and_greet",
          startTime: "10:10",
          endTime: "11:30",
          booth: "A",
          relationGroupId: "relation-1",
          verified: true,
        }),
        createBlankSchedule({
          id: "common",
          artist: null,
          title: "終演後物販",
          type: "merch",
          startTime: "21:35",
          endTime: "22:55",
          verified: true,
        }),
      ],
    };
    const onSelectedChange = vi.fn<(selected: Set<string>) => void>();

    render(
      <SelectionStep
        document={document}
        selected={new Set()}
        onSelectedChange={onSelectedChange}
        onBack={vi.fn<() => void>()}
        onNext={vi.fn<() => void>()}
      />,
    );

    expect(screen.getByText(/otherSchedules|その他の予定|Other schedules/)).toBeInTheDocument();
    expect(screen.getByText("終演後物販")).toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", { name: /toggleRelated|関連予定をまとめて切替|Toggle related/ })[0]!,
    );
    expect([...onSelectedChange.mock.calls.at(-1)![0]].sort()).toEqual(["live", "merch"]);
  });
});
