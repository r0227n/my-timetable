# My Timetable

イベントのタイムテーブル画像をブラウザ内で読み取り、予定を修正・選択するReactアプリです。画像、OCR結果、編集内容はサーバーへ送信せず、タブを閉じると破棄します。

## 利用できる機能

- JPEG / PNG / WebP画像のアップロードと20MB上限の検証
- 回転、切り抜き、明るさ、コントラスト調整、長辺4096pxへの縮小
- ブラウザ内OCRとGemma 4 E2Bによる構造化
- イベント情報・予定の追加、編集、複製、削除、確認
- 出演者単位・予定単位の選択、検索、絞り込み
- 時間重複と移動時間不足の検出
- 個人用タイムラインのレイアウト・色・表示項目調整
- SVG、PNG、ICSファイルの保存
- OAuth設定済み環境でのGoogle Calendar直接登録
- WebGPU非対応・解析失敗時の手入力フロー
- テーマ以外の作業データを永続保存しない設計

## ローカルで動作確認する

### 1. アプリを起動する

miseを用意し、リポジトリのルートで次を実行します。リポジトリの `mise.toml` に固定されたBunがインストールされます。

```sh
mise install
bun install --frozen-lockfile
bun run dev
```

ターミナルに表示されたURLをChromeまたはEdgeで開きます。通常は次のURLです。

```text
http://localhost:5173/my-timetable/
```

`index.html` をFinderなどから直接開く `file://.../index.html` では、Viteが提供するJavaScriptやCSSを読み込めないため動作しません。必ず `bun run dev` で起動したURLを使用してください。

### 2. 手入力フローを確認する

AIモデルをダウンロードせず、Phase 1の編集・選択機能をすぐに確認できます。

1. トップ画面で「画像を使わず手入力ではじめる」を選択します。
2. イベント名と開催日を入力します。
3. 予定一覧へ出演者名、種別、開始・終了時刻、相対時刻、ステージ、属性などを入力します。
4. 必要に応じて行の追加、複製、削除、「確認済み」の切り替えを試します。
5. 「予定を選ぶ」を押します。
6. 出演者単位・予定単位の選択、検索、種別・ステージの絞り込みを確認します。
7. 時間が重なる予定を追加し、重複警告と移動時間バッファの警告を確認します。
8. 選択した予定からタイムラインを調整し、SVG、PNG、ICSを保存します。

「予定を選ぶ」は、1件以上の出演者名を入力するまで無効です。開催日はICSまたはGoogle Calendarへの出力前に必要です。

### 3. 画像アップロード・調整を確認する

1. トップ画面へJPEG、PNG、またはWebP画像をドロップするか、「画像をドロップ」領域をクリックして選択します。
2. 画像の回転、明るさ、コントラスト、上下左右の切り抜きを操作します。
3. 「元に戻す」で、すべての調整が初期値へ戻ることを確認します。
4. 20MBを超える画像や未対応形式を選択し、エラーメッセージが表示されることを確認します。

### 4. AI解析を確認する

AI解析にはWebGPU対応の最新版ChromeまたはEdgeを推奨します。「解析を開始」を押すと、端末内で次の処理を行います。

1. GLM-OCR ONNXによるブラウザ内文字認識
2. LiteRT-LM上のGemma 4 E2Bによる予定データの構造化
3. 抽出結果確認画面への表示

初回は約750MBのGLM-OCRモデルに加えて約2.01GBのGemmaモデルを取得します。十分な空き容量と安定した回線を用意してください。モデル取得や解析に失敗した場合も、「手入力で続ける」から残りのフローを確認できます。

画像と抽出データは外部サーバーへ送信しません。モデルファイルだけを外部配信元から取得し、Cache Storageへ保存します。Google Calendarへ登録する場合に限り、最終確認後に選択した予定をGoogle Calendar APIへ送信します。

## Google Calendar連携を設定する

Google Cloudでブラウザ向けOAuthクライアントを作成し、開発時は `VITE_GOOGLE_CLIENT_ID` 環境変数へクライアントIDを設定します。本番はGitHubリポジトリ変数 `VITE_GOOGLE_CLIENT_ID` を設定してください。クライアントシークレットは使用しません。

### 5. 本番ビルドを確認する

GitHub Pagesと同じ静的ビルドをローカルで確認するには、次を実行します。

```sh
bun run build
bun run preview
```

ターミナルに表示されたpreview URLを開き、アップロードから予定選択までを再確認してください。

## 開発時の品質確認

品質確認は次のコマンドで行います。

```sh
bun run format:check
bun run lint
bun run test
bun run build
```

ソース整形にはOxfmt、静的解析にはOxlintを使用します。

## Hermes profileをセットアップする

Hermesの再現可能な設定は [`hermes-profile/`](hermes-profile/) でGit管理しています。モデル設定、profileの指示、distribution manifestが対象です。APIキーを格納する `.env`、会話履歴、メモリ、ログ、キャッシュ、データベースなどの機密情報・端末固有データはリポジトリへ保存しません。

### 初回セットアップ

リポジトリのルートでprofile distributionをインストールします。

```sh
hermes profile install ./hermes-profile --name my-timetable --alias -y
hermes -p my-timetable project create "my-timetable" "$PWD" \
  --slug my-timetable --primary "$PWD" --use
```

これにより、`my-timetable` コマンドで専用profileを起動でき、このリポジトリがHermes projectのprimary folderとして参照されます。

```sh
my-timetable chat
```

ローカルのOllama互換エンドポイント `http://127.0.0.1:11434/v1` と、既定モデル `orcarouter/Qwen3.8-27B-Uncensored:latest` を使用します。モデルは事前に利用可能な状態にしてください。

### Git管理された設定を既存profileへ同期する

`hermes-profile/` の更新を取得した後、次を実行します。

```sh
hermes profile update my-timetable --force-config -y
```

`--force-config` により、ローカルの `config.yaml` をGit管理された設定で置き換えます。`.env`、履歴、メモリなどのユーザーデータはHermesの更新対象外であり、そのまま保持されます。

既存の `my-timetable` profileを初めてGit管理へ移行する場合は、次のようにローカルdistributionを紐付け直します。

```sh
hermes profile install ./hermes-profile --name my-timetable --alias --force -y
```

設定を変更するときは `~/.hermes/profiles/my-timetable/` を直接編集せず、`hermes-profile/` を更新してGitへコミットし、上記の同期コマンドを実行してください。

## AI実行基盤

アプリはOCRランタイムを直接参照せず、独自パッケージ [`@my-timetable/glm-ocr-web`](packages/glm-ocr-web) の公開APIだけを利用します。ONNX Runtime Web、モデル配信元、Cache Storage、フォールバックOCRはパッケージ内に隠蔽しています。

OCRは `onnx-community/GLM-OCR-ONNX` のq4グラフをTransformers.js経由のONNX Runtime Web / WebGPUで実行します。モデル選定の検証結果は [`docs/SPEC.md`](docs/SPEC.md) の「Phase 0技術判断」を参照してください。

構造化にはGoogleのLiteRT-LM Web APIと `gemma-4-E2B-it-web.litertlm` を使用します。`@litert-lm/core` の `0.16.0` は2026-08-27時点で配布tarballに実装ファイルが含まれていないため、正常な配布物を含む `0.15.0` に固定しています。初回モデル取得は約2.01GBです。

## デプロイ

`main` へのpush、または手動実行でGitHub Pagesへ公開します。Viteのbaseは `/my-timetable/` に設定済みです。
