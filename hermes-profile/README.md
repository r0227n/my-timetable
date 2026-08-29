# my-timetable Hermes Bots

このディレクトリでは、用途ごとに独立した2つのHermes profile distributionを管理します。

| profile | 用途 | Routine |
|---|---|---|
| `my-timetable-screen-spec` | `packages/glm-ocr-web/src/` と実画面を確認し、`docs/SPEC.md` の画面仕様を保守する | 毎週土曜日11:00 |
| `my-timetable-docs-review` | `docs/` 配下をレビューし、実装や一次情報と整合するよう更新する | 毎週土曜日11:00 |

各profileは、指示、会話、記憶、スキル、Routineを互いに共有しません。インストールと更新方法はリポジトリの [`README.md`](../README.md#hermes-botをセットアップする) を参照してください。
