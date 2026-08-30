import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createBlankSchedule, createEmptyDocument } from "../domain/timetable";
import { ReviewStep } from "./ReviewStep";

describe("ReviewStep", () => {
  it("revokes verification only for schedules that inherit a changed event date", () => {
    const inherited = createBlankSchedule({
      id: "inherited",
      artist: "Inherited",
      date: null,
      startTime: "10:00",
      endTime: "10:30",
      verified: true,
    });
    const explicit = createBlankSchedule({
      id: "explicit",
      artist: "Explicit",
      date: "2026-08-30",
      startTime: "11:00",
      endTime: "11:30",
      verified: true,
    });
    const document = {
      ...createEmptyDocument(),
      event: { ...createEmptyDocument().event, date: "2026-08-30" },
      schedules: [inherited, explicit],
    };
    const onChange = vi.fn();

    render(
      <ReviewStep
        document={document}
        sourceUrl={null}
        onChange={onChange}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/^date$|^日付$/i), { target: { value: "2026-08-31" } });

    const updated = onChange.mock.calls.at(-1)?.[0];
    expect(updated.schedules.find((item: { id: string }) => item.id === "inherited")?.verified).toBe(false);
    expect(updated.schedules.find((item: { id: string }) => item.id === "explicit")?.verified).toBe(true);
  });

  it("orders filtered schedules chronologically without changing document order", () => {
    const document = {
      ...createEmptyDocument(),
      event: { ...createEmptyDocument().event, date: "2026-08-30" },
      schedules: [
        createBlankSchedule({ id: "later", artist: "Later", startTime: "11:00", endTime: "11:30" }),
        createBlankSchedule({ id: "earlier", artist: "Earlier", startTime: "10:00", endTime: "10:30" }),
      ],
    };

    const view = render(
      <ReviewStep
        document={document}
        sourceUrl={null}
        onChange={vi.fn()}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(Array.from(view.container.querySelectorAll(".schedule-select"), (button) => button.textContent)).toEqual([
      "Earlier",
      "Later",
    ]);
    expect(document.schedules.map((item) => item.artist)).toEqual(["Later", "Earlier"]);
  });

  it("moves details to a visible row when the selected schedule leaves the active filter", async () => {
    const user = userEvent.setup();
    const document = {
      ...createEmptyDocument(),
      event: { ...createEmptyDocument().event, date: "2026-08-30" },
      schedules: [
        createBlankSchedule({
          id: "alpha",
          artist: "Alpha",
          startTime: "10:00",
          endTime: "10:30",
          confidence: "high",
        }),
        createBlankSchedule({
          id: "beta",
          artist: "Beta",
          startTime: "11:00",
          endTime: "11:30",
          confidence: "high",
        }),
      ],
    };

    const onChange = vi.fn();
    const view = render(
      <ReviewStep
        document={document}
        sourceUrl={null}
        onChange={onChange}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /markVerified|Alphaを確認済みにする/ }));
    view.rerender(
      <ReviewStep
        document={onChange.mock.calls[0][0]}
        sourceUrl={null}
        onChange={onChange}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/出演者名|artist/)).toHaveValue("Beta");
  });
});
