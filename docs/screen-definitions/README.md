# 画面・実装対応表

この文書は、MVP 1.0 の画面仕様と主実装を対応付ける索引である。プロダクト要件と振る舞いの正本は [`docs/SPEC.md`](../SPEC.md) とし、画面固有の仕様はリンク先を参照する。

| # | 画面 | 仕様 | 主実装 |
|---:|---|---|---|
| 1 | トップ・アップロード | [SPEC 6.1](../SPEC.md#61-トップアップロード画面) | [`UploadStep.tsx`](../../src/components/UploadStep.tsx) |
| 2 | 画像調整 | [SPEC 6.2](../SPEC.md#62-画像調整画面) | [`AdjustStep.tsx`](../../src/components/AdjustStep.tsx) |
| 3 | AI解析 | [SPEC 6.3](../SPEC.md#63-ai解析画面) | [`AnalysisStep.tsx`](../../src/components/AnalysisStep.tsx) |
| 4 | 抽出結果確認 | [SPEC 6.4](../SPEC.md#64-抽出結果確認画面) | [`ReviewStep.tsx`](../../src/components/ReviewStep.tsx) |
| 5 | 予定選択 | [SPEC 6.5](../SPEC.md#65-予定選択画面) | [`SelectionStep.tsx`](../../src/components/SelectionStep.tsx) |
| 6 | タイムライン編集 | [SPEC 6.6](../SPEC.md#66-タイムライン編集画面) | [`TimelineStep.tsx`](../../src/components/TimelineStep.tsx) |
| 7 | エクスポート | [SPEC 6.7](../SPEC.md#67-エクスポート画面) | [`ExportStep.tsx`](../../src/components/ExportStep.tsx) |

ブラウザー確認のスクリーンショットと観測結果は、リポジトリへ追加せずPull Requestの「ブラウザ確認」へ添付する。
