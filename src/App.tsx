import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { StepNav } from "./components/StepNav";
import { UploadStep } from "./components/UploadStep";
import { AdjustStep } from "./components/AdjustStep";
import { AnalysisStep } from "./components/AnalysisStep";
import { ReviewStep } from "./components/ReviewStep";
import { SelectionStep } from "./components/SelectionStep";
import { TimelineStep } from "./components/TimelineStep";
import { ExportStep } from "./components/ExportStep";
import { createEmptyDocument, type TimetableDocument } from "./domain/timetable";
import { selectableSchedules } from "./domain/schedule-review";
import type { TimelineOptions } from "./domain/export";
import { defaultAdjustments, renderAdjustedImage, type ImageAdjustments } from "./lib/image";
import { analyzeTimetable, type AnalysisUpdate } from "#analysis";
import { clearAllModelCaches } from "./services/model-cache";
import { useTranslation } from "react-i18next";
import { localizeError } from "./i18n/errors";
import {
  getE4BAvailability,
  resolveStoredGemmaModel,
  storeGemmaModel,
  type GemmaModelId,
} from "./services/gemma-model";

type AnalysisState = {
  stage: "preparing" | "model" | "ocr" | "gemma" | "error";
  progress: number | null;
  error: unknown | null;
};

const initialAnalysis: AnalysisState = {
  stage: "preparing",
  progress: null,
  error: null,
};

const initialTimelineOptions: TimelineOptions = {
  width: 1080,
  height: 1350,
  background: "#f4f0e7",
  accent: "#df5d3d",
  title: "",
  layout: "vertical",
  showDate: true,
  showVenue: true,
  showType: true,
  showStage: true,
  showBooth: true,
};

const DebugPanel =
  import.meta.env.MODE === "debug"
    ? lazy(() => import("./components/DebugPanel").then((module) => ({ default: module.DebugPanel })))
    : null;

export default function App() {
  const { t } = useTranslation(["common", "analysis"]);
  const [step, setStep] = useState(0);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [analysisImageUrl, setAnalysisImageUrl] = useState<string | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const analysisImageUrlRef = useRef<string | null>(null);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(defaultAdjustments);
  const [timetable, setTimetable] = useState<TimetableDocument>(createEmptyDocument);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [timelineOptions, setTimelineOptions] = useState<TimelineOptions>(initialTimelineOptions);
  const [analysis, setAnalysis] = useState<AnalysisState>(initialAnalysis);
  const controller = useRef<AbortController | null>(null);
  const [dark, setDark] = useState(() => localStorage.getItem("ui.theme") === "dark");
  const [debugOpen, setDebugOpen] = useState(false);
  const webGpu = Boolean(navigator.gpu);
  const [e4bAvailability] = useState(getE4BAvailability);
  const [gemmaModel, setGemmaModel] = useState<GemmaModelId>(() => resolveStoredGemmaModel(e4bAvailability));

  useEffect(() => {
    window.document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("ui.theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => storeGemmaModel(gemmaModel), [gemmaModel]);
  useEffect(
    () => () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (analysisImageUrlRef.current) URL.revokeObjectURL(analysisImageUrlRef.current);
    },
    [],
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (step > 0) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [step]);

  const startAnalysis = async () => {
    if (!sourceUrl) return;
    const nextController = new AbortController();
    controller.current = nextController;
    setAnalysis(initialAnalysis);
    setStep(2);
    try {
      const image = await renderAdjustedImage(sourceUrl, adjustments);
      replaceObjectUrl(analysisImageUrlRef, image, setAnalysisImageUrl);
      const result = await analyzeTimetable(image, handleAnalysisUpdate, nextController.signal, gemmaModel);
      setTimetable(result.document);
      setStep(3);
    } catch (error) {
      if (nextController.signal.aborted) {
        setStep(1);
        return;
      }
      setAnalysis((current) => ({
        ...current,
        stage: "error",
        error,
      }));
    } finally {
      if (controller.current === nextController) controller.current = null;
    }
  };

  const handleAnalysisUpdate = (update: AnalysisUpdate) => {
    setAnalysis({
      stage: update.step === "ocr" ? (update.stage === "recognition" ? "ocr" : "model") : "gemma",
      progress: update.progress,
      error: null,
    });
  };
  const manual = () => {
    replaceObjectUrl(analysisImageUrlRef, null, setAnalysisImageUrl);
    setTimetable(createEmptyDocument());
    setStep(3);
  };

  return (
    <div className="app-frame">
      <AppHeader
        dark={dark}
        onToggleTheme={() => setDark((value) => !value)}
        gemmaModel={gemmaModel}
        e4bAvailability={e4bAvailability}
        onGemmaModelChange={setGemmaModel}
        onOpenDebug={DebugPanel ? () => setDebugOpen(true) : undefined}
        onClearModelCache={async () => {
          try {
            await clearAllModelCaches();
            window.alert(t("header.cacheCleared"));
          } catch {
            window.alert(t("header.cacheClearFailed"));
          }
        }}
      />
      {DebugPanel && debugOpen ? (
        <Suspense fallback={null}>
          <DebugPanel gemmaModel={gemmaModel} onClose={() => setDebugOpen(false)} />
        </Suspense>
      ) : null}
      <StepNav current={step} />
      {step === 0 ? (
        <UploadStep
          webGpu={webGpu}
          gemmaModel={gemmaModel}
          onFile={(nextFile) => {
            replaceObjectUrl(sourceUrlRef, nextFile, setSourceUrl);
            replaceObjectUrl(analysisImageUrlRef, null, setAnalysisImageUrl);
            setAdjustments(defaultAdjustments);
            setStep(1);
          }}
          onManual={manual}
        />
      ) : null}
      {step === 1 && sourceUrl ? (
        <AdjustStep
          sourceUrl={sourceUrl}
          adjustments={adjustments}
          onChange={setAdjustments}
          onBack={() => setStep(0)}
          onAnalyze={() => void startAnalysis()}
        />
      ) : null}
      {step === 2 ? (
        <AnalysisStep
          stage={analysis.stage}
          progress={analysis.progress}
          error={analysis.error ? localizeError(analysis.error, "analysisFailed") : null}
          onCancel={() => controller.current?.abort()}
          onManual={manual}
          onRetry={() => void startAnalysis()}
        />
      ) : null}
      {step === 3 ? (
        <ReviewStep
          document={timetable}
          sourceUrl={analysisImageUrl ?? sourceUrl}
          onChange={setTimetable}
          onBack={() => setStep(sourceUrl ? 1 : 0)}
          onNext={() => {
            setSelected(new Set(selectableSchedules(timetable).map((item) => item.id)));
            setStep(4);
          }}
        />
      ) : null}
      {step === 4 ? (
        <SelectionStep
          document={{ ...timetable, schedules: selectableSchedules(timetable) }}
          selected={selected}
          onSelectedChange={setSelected}
          onBack={() => setStep(3)}
          onNext={() => setStep(5)}
        />
      ) : null}
      {step === 5 ? (
        <TimelineStep
          document={timetable}
          schedules={timetable.schedules.filter((item) => selected.has(item.id))}
          options={timelineOptions}
          onChange={setTimelineOptions}
          onBack={() => setStep(4)}
          onNext={() => setStep(6)}
        />
      ) : null}
      {step === 6 ? (
        <ExportStep
          document={timetable}
          schedules={timetable.schedules.filter((item) => selected.has(item.id))}
          options={timelineOptions}
          onBack={() => setStep(5)}
        />
      ) : null}
      <footer className="app-footer">
        <span>MY TIMETABLE · MVP</span>
        <span>{t("footer")}</span>
      </footer>
    </div>
  );
}

function replaceObjectUrl(
  reference: { current: string | null },
  blob: Blob | null,
  setUrl: (url: string | null) => void,
): void {
  if (reference.current) URL.revokeObjectURL(reference.current);
  const nextUrl = blob ? URL.createObjectURL(blob) : null;
  reference.current = nextUrl;
  setUrl(nextUrl);
}
