import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createBlankSchedule, createEmptyDocument, type TimetableDocument } from "../domain/timetable";
import { ReviewStep } from "./ReviewStep";

describe("ReviewStep", () => {
  it("shows the retained OCR text, order, confidence, and low-confidence field emphasis", () => {
    const document = {
      ...createEmptyDocument(),
      schedules: [
        createBlankSchedule({
          id: "low-item",
          artist: "ALPHA",
          confidence: "low",
          sourceRegions: [{ x: 10, y: 20, width: 100, height: 50 }],
        }),
      ],
    };

    const view = render(
      <ReviewStep
        document={document}
        sourceUrl="blob:test-image"
        ocrResult={{
          text: "10:00 ALPHA",
          engine: "glm-ocr",
          image: { width: 400, height: 300 },
          regions: [
            {
              id: "region-1",
              kind: "column",
              text: "10:00 ALPHA",
              order: 2,
              confidence: 0.73,
              region: { x: 0, y: 0, width: 200, height: 100 },
            },
          ],
        }}
        onChange={vi.fn<(document: TimetableDocument) => void>()}
        onBack={vi.fn<() => void>()}
        onNext={vi.fn<() => void>()}
      />,
    );

    expect(screen.getByText("10:00 ALPHA")).toBeInTheDocument();
    expect(view.container.querySelector(".ocr-evidence-item small")).toHaveTextContent("73%");
    expect(view.container.querySelector(".detail-form")).toHaveClass("low-confidence-fields");
    expect(view.container.querySelector(".low-confidence-notice")).toBeInTheDocument();
  });

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
    const onChange = vi.fn<(document: TimetableDocument) => void>();

    render(
      <ReviewStep
        document={document}
        sourceUrl={null}
        ocrResult={null}
        onChange={onChange}
        onBack={vi.fn<() => void>()}
        onNext={vi.fn<() => void>()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/date|開催日/i), { target: { value: "2026-08-31" } });

    const updated = onChange.mock.calls.at(-1)?.[0];
    expect(updated).toBeDefined();
    if (!updated) throw new Error("Expected the event date change to emit a document");
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
        ocrResult={null}
        onChange={vi.fn<(document: TimetableDocument) => void>()}
        onBack={vi.fn<() => void>()}
        onNext={vi.fn<() => void>()}
      />,
    );

    expect(
      Array.from(view.container.querySelectorAll(".schedule-select"), (button) => button.textContent),
    ).toEqual(["Earlier", "Later"]);
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

    const onChange = vi.fn<(document: TimetableDocument) => void>();
    const view = render(
      <ReviewStep
        document={document}
        sourceUrl={null}
        ocrResult={null}
        onChange={onChange}
        onBack={vi.fn<() => void>()}
        onNext={vi.fn<() => void>()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /markVerified|Alphaを確認済みにする/ }));
    view.rerender(
      <ReviewStep
        document={onChange.mock.calls[0][0]}
        sourceUrl={null}
        ocrResult={null}
        onChange={onChange}
        onBack={vi.fn<() => void>()}
        onNext={vi.fn<() => void>()}
      />,
    );

    expect(screen.getByLabelText(/出演者名|artist/)).toHaveValue("Beta");
  });
});
