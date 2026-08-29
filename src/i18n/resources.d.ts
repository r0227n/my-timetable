import common from "./locales/ja/common.json";
import upload from "./locales/ja/upload.json";
import adjust from "./locales/ja/adjust.json";
import analysis from "./locales/ja/analysis.json";
import review from "./locales/ja/review.json";
import selection from "./locales/ja/selection.json";
import timeline from "./locales/ja/timeline.json";
import exportResources from "./locales/ja/export.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      upload: typeof upload;
      adjust: typeof adjust;
      analysis: typeof analysis;
      review: typeof review;
      selection: typeof selection;
      timeline: typeof timeline;
      export: typeof exportResources;
    };
  }
}
