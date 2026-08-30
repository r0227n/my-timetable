import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createBlankSchedule, createEmptyDocument } from "../domain/timetable";
import { ReviewStep } from "./ReviewStep";

describe("ReviewStep", () => {
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

    await user.click(screen.getByRole("checkbox", { name: "markVerified" }));
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
