import { expect, it } from "vitest";
import { createEmptyDocument } from "../domain/timetable";
import { finalizeGemmaDocument } from "./gemma";

it.each([
  ["物販", "merch"],
  ["特典会", "meet_and_greet"],
])("retains %s as a separate activity with the same performer", (label, type) => {
  const text = `<table><tr><td>09:30〜09:50</td><td>Group A</td><td>${label}</td><td>Ⓑ10:10〜11:30</td></tr><tr><td>21:10〜21:35</td><td>Group B</td><td>${label}</td><td>終演後</td></tr></table>`;
  const document = createEmptyDocument();
  document.schedules = [];
  const region = { x: 0, y: 500, width: 1500, height: 500 };
  const result = finalizeGemmaDocument(document, {
    engine: "glm-ocr",
    image: { width: 1500, height: 2000 },
    text,
    regions: [
      { id: "band", kind: "column", order: 0, confidence: null, text, region },
      {
        id: "footer",
        kind: "header",
        order: 1,
        confidence: null,
        text: `21:35〜22:55 終演後${label}`,
        region: { ...region, y: 1900, height: 100 },
      },
    ],
  });
  expect(result.schedules).toHaveLength(4);
  expect(result.schedules).toContainEqual(
    expect.objectContaining({
      artist: "Group A",
      type,
      startTime: "10:10",
      endTime: "11:30",
      booth: "B",
      stage: null,
    }),
  );
  expect(result.schedules).toContainEqual(
    expect.objectContaining({
      artist: "Group B",
      type,
      startTime: "21:35",
      endTime: "22:55",
      relativeTimeLabel: "終演後",
      endTimeSource: "explicit",
    }),
  );
  expect(result.schedules.filter((item) => item.type === "live")).toHaveLength(2);
});

it("keeps after-show times unresolved when no shared range is printed", () => {
  const text = `<table><tr><td>09:30〜09:50</td><td>Band</td><td>物販</td><td>終演後</td></tr></table>`;
  const document = createEmptyDocument();
  document.schedules = [];
  const result = finalizeGemmaDocument(document, {
    engine: "glm-ocr",
    image: { width: 1, height: 1 },
    text,
    regions: [
      {
        id: "band",
        kind: "column",
        text,
        order: 0,
        confidence: null,
        region: { x: 0, y: 0, width: 1, height: 1 },
      },
    ],
  });
  expect(result.schedules.find((item) => item.type === "merch")).toMatchObject({
    startTime: null,
    endTime: null,
    relativeTimeLabel: "終演後",
  });
});

it("reads GLM's LaTeX circled booth notation", () => {
  const text =
    "<table><tr><td>09:30~09:50</td><td>Group</td><td>物販</td><td>$\\textcircled{D}$10:10~11:30</td></tr></table>";
  const document = createEmptyDocument();
  document.schedules = [];
  const result = finalizeGemmaDocument(document, {
    engine: "glm-ocr",
    image: { width: 100, height: 100 },
    text,
    regions: [
      {
        id: "table",
        kind: "column",
        order: 0,
        confidence: null,
        text,
        region: { x: 0, y: 0, width: 100, height: 100 },
      },
    ],
  });
  expect(result.schedules.find((item) => item.type === "merch")?.booth).toBe("D");
});

it("keeps an activity's separate venue and booth", () => {
  const text =
    "<table><tr><td>09:30~09:50</td><td>Group</td><td>特典会</td><td>別館 / (B) 10:10~11:30</td></tr></table>";
  const document = createEmptyDocument();
  document.schedules = [];
  const result = finalizeGemmaDocument(document, {
    engine: "glm-ocr",
    image: { width: 100, height: 100 },
    text,
    regions: [
      {
        id: "table",
        kind: "column",
        order: 0,
        confidence: null,
        text,
        region: { x: 0, y: 0, width: 100, height: 100 },
      },
    ],
  });
  expect(result.schedules.find((item) => item.type === "meet_and_greet")).toMatchObject({
    stage: "別館",
    booth: "B",
  });
  expect(result.schedules.find((item) => item.type === "live")?.stage).toBeNull();
});
