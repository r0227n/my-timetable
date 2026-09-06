import type { OcrResult, OcrTextRegion } from "@my-timetable/glm-ocr-web";

const MAX_ROWS = 4;
const MAX_TEXT = 2200;

/** Retain table columns and header context while bounding each model response. */
export function createGemmaBatches(ocr: OcrResult): OcrResult[] {
  if (!ocr.regions.length) return [ocr];
  const context = collectEventContext(ocr);
  const batches: OcrResult[] = [];
  const sources = ocr.regions.filter((region) => region.kind !== "header");
  for (const region of sources.length ? sources : ocr.regions) {
    const rows = [...region.text.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/giu)].map((match) => match[0]);
    const parts: string[] = [];
    if (rows.length) {
      let headers: string[] = [];
      let pending: string[] = [];
      const flush = () => {
        if (pending.length) parts.push(`<table>${headers.join("")}${pending.join("")}</table>`);
        pending = [];
      };
      for (const row of rows) {
        if (/終演後(?:物販|特典会)/u.test(row)) continue;
        if (!/\d{1,2}[:：]\d{2}|終演後/u.test(row)) {
          flush();
          headers.push(row);
          continue;
        }
        if (pending.length >= MAX_ROWS || pending.join("").length + row.length > MAX_TEXT) flush();
        pending.push(row);
      }
      flush();
      if (!parts.length) parts.push(region.text);
    } else {
      let headings: string[] = [];
      let pending = "";
      let timedLines = 0;
      for (const line of region.text.split(/\r?\n/u)) {
        if (/^#{2,}\s/u.test(line))
          headings = [
            ...headings.filter((heading) => heading.match(/^#+/u)![0].length < line.match(/^#+/u)![0].length),
            line,
          ];
        if (
          pending &&
          (pending.length + line.length > MAX_TEXT || (timedLines >= MAX_ROWS && /\d{1,2}:\d{2}/u.test(line)))
        ) {
          parts.push(pending);
          pending = headings.join("\n");
          timedLines = 0;
        }
        pending += `\n${line}`;
        if (/\d{1,2}:\d{2}/u.test(line)) timedLines++;
      }
      if (pending.trim()) parts.push(pending);
    }
    for (const text of parts) {
      const regions: OcrTextRegion[] = [{ ...region, text }];
      if (context) regions.push({ ...region, id: "event-context", kind: "header", text: context, order: -1 });
      batches.push({ ...ocr, text, regions });
    }
  }
  return batches.length ? batches : [ocr];
}

export function collectEventContext(ocr: OcrResult): string {
  return ocr.regions
    .flatMap((region) => {
      if (region.kind === "header") return [region.text];
      const outside = region.text.replace(/<table\b[^>]*>[\s\S]*?<\/table>/giu, "").trim();
      const shared = [...region.text.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/giu)]
        .map((match) => match[0])
        .filter((row) => /終演後(?:物販|特典会)/u.test(row));
      return [...(/<table\b/iu.test(region.text) && outside ? [outside] : []), ...shared];
    })
    .join("\n");
}
