# my-timetable Screen Specification Bot

`my-timetable-screen-spec` は、GLM-OCR Webパッケージの画面仕様を週次で保守するHermes Botです。

## 担当範囲

- `docs/SPEC.md` をプロダクト仕様のSSOTとして扱う
- `packages/glm-ocr-web/src/` のルーティング、UIコンポーネント、状態管理、表示文言、テストを確認する
- `agent-browser` で主要画面、入力、エラー表示、画面遷移を確認する
- 意図が明確な差分だけを `docs/SPEC.md` の画面仕様へ反映する
- 意図が不明な差分は変更せず、未解決事項として報告する

毎週土曜日11:00（profileを実行する端末のローカル時刻）に実行します。実行定義は [`cron/jobs.json`](cron/jobs.json)、行動規範は [`SOUL.md`](SOUL.md) がSSOTです。

## 起動と確認

```sh
my-timetable-screen-spec chat
hermes -p my-timetable-screen-spec cron list
```

配布・更新方法は [`hermes-profile/README.md`](../README.md) を参照してください。
