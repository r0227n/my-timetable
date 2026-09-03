import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnalysisStep } from "./AnalysisStep";

describe("AnalysisStep errors", () => {
  it("shows the failed stage, code, diagnostics, and stage-specific recovery actions", async () => {
    const user = userEvent.setup();
    render(
      <AnalysisStep
        stage="error"
        progress={null}
        failure={{
          code: "gemmaInvalidJson",
          stage: "gemma",
          retryTarget: "gemma",
          retryCount: 1,
          canContinueManually: true,
          diagnostics: "Code: GEMMA_OUTPUT_NOT_JSON\nStage: gemma",
        }}
        onCancel={vi.fn<() => void>()}
        onManual={vi.fn<() => void>()}
        onRetry={vi.fn<() => void>()}
        onBackToAdjust={vi.fn<() => void>()}
      />,
    );

    expect(await screen.findByText("データ整形で失敗しました")).toBeInTheDocument();
    expect(screen.getByText("エラーコード:").parentElement).toHaveTextContent(
      "エラーコード: GEMMA_OUTPUT_NOT_JSON",
    );
    expect(screen.getByRole("button", { name: "Gemmaだけ再試行" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "手動編集へ進む" })).toBeInTheDocument();

    await user.click(screen.getByText("診断情報を表示"));
    expect(screen.getByText(/Stage: gemma/)).toBeInTheDocument();
  });
});
