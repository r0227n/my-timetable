# AGENTS.md

## 目的

このリポジトリでは、`docs/SPEC.md` に定義されたWebアプリを実装する。

作業を始める前に `docs/SPEC.md` の関連箇所を読み、仕様、制約、対象範囲、完了条件を確認する。実装と仕様が食い違う場合は、暗黙に仕様を変えず、差異を明示して扱う。

## 開発方針

- `docs/SPEC.md` をプロダクト仕様のSSOTとする。仕様を別ファイルやコードコメントへ重複させず、仕様変更はまず同ファイルへ反映する。
- 型、スキーマ、定数、設定、ドメインルールにもそれぞれ明確なSSOTを設け、同じ知識を複数箇所へ複製しない。
- 現在は開発中のため、より単純で一貫した設計になるなら破壊的変更を許容する。不要な互換レイヤーや非推奨APIを残さず、呼び出し元、テスト、文書を同じ変更で更新する。
- SOLID原則を判断軸にし、各モジュールの責務を狭く保つ。UI、ドメインルール、ブラウザAPI、AI推論、永続化、エクスポートの境界を明確にする。
- 抽象化は具体的な変更理由や差し替え点がある場所に置く。単純な処理へ形式的な層を増やすより、依存方向と公開インターフェースを明確にする。
- アップロード画像と抽出データを端末外へ送信しないなど、`docs/SPEC.md` のプライバシー、セキュリティ、静的ホスティングの制約を維持する。

## 作業手順

1. 対象機能に関係する `docs/SPEC.md` の記述と既存実装を確認する。
2. 変更の責務とSSOTを決め、影響する呼び出し元を洗い出す。
3. 必要なら破壊的変更を含めて、整合した状態まで一括して実装する。
4. `package.json` のscriptsをSSOTとして、format check、lint、test、buildを実行する。
5. UIまたはユーザーフローに影響する変更は、`agent-browser` で実際の画面を操作して動作確認する。主要フロー、入力、エラー表示、画面遷移を確認し、スクリーンショットと観測結果をPRへ残す。
6. 仕様、実装、テストが一致し、関連する確認がすべて成功した時点で完了とする。

BotのIssue状態遷移は、Issueの実装を始める前に [`docs/agent-workflow.md`](docs/agent-workflow.md) を読み、その手順に従う。

## Bun開発環境

Bunのバージョンは`mise.toml`、利用可能なコマンドは`package.json`をSSOTとする。新しいworktree、またはlockfile変更後は次を実行する。

```sh
mise install
bun install --frozen-lockfile
```

ローカル開発サーバーは`bun run dev`で起動し、Viteが表示したURLを使用する。`file://`では開かない。

変更後は次の品質ゲートをすべて成功させる。

```sh
bun run format:check
bun run lint
bun run test
bun run build
```

失敗した場合は今回の変更との関係を調べる。修正できない失敗は、再現コマンド、失敗内容、残るリスクを記録してDraft PRにする。

## agent-browserによるUI確認

UI、表示文言、入力、画面遷移、ブラウザAPIへ影響する変更では、自動テストに加えて実画面を確認する。実行前にインストール済みCLIと一致する手順を読み込む。

```sh
agent-browser skills get core
export AGENT_BROWSER_SESSION="$(agent-browser session id --scope worktree --prefix issue-<number>)"
```

名前なしsessionは他のAgentや人間のブラウザ状態と共有されるため使わない。基本ループは次のとおり。

1. `bun run dev`を起動し、Viteが表示したURLを`agent-browser open`で開く。
2. `agent-browser snapshot -i`で操作対象を取得する。
3. snapshotのrefを使って入力または操作する。
4. 画面変更後は再度snapshotを取得し、古いrefを再利用しない。
5. 正常系だけでなく、Issueに関係する入力制約、エラー表示、画面遷移を確認する。
6. 重要な状態をスクリーンショットに保存し、秘密情報が写っていないことを確認してPRへ添付する。生成物はリポジトリへcommitしない。
7. URL、操作、期待結果、観測結果、スクリーンショットをPRの「ブラウザ確認」へ記載する。
8. `agent-browser close`で自分のsessionを終了する。

WebGPUを実際に確認する変更では`agent-browser skills get core --full`のWebGPU手順も読み、レンダリング準備完了後に証拠を取得する。外部モデルの容量や実行環境によって完遂できない確認は、本番仕様を弱めず未確認範囲とリスクを記録する。

## Worktree方針

- 実装作業は1 Issueにつき1 branch、1 worktreeへ分離し、複数Issueを並列に進められる状態を保つ。
- worktreeの確認と作成にはgit標準コマンドを直接使わず、`git gtr list --porcelain`と`git gtr new <branch> --from origin/develop --porcelain`を使用する。
- `git gtr new`が返す`path`内だけで対象Issueの編集、検証、commit、push、PR作成を行う。終了コードが0でない場合は作成失敗として扱う。
- `hook_status`が`skipped-untrusted`または`partial`なら報告する。Agentは`git gtr trust`を実行しない。
- 並行作業間でworktreeやbranchを共有しない。既存worktreeがある場合は`git gtr list --porcelain`のpathを再利用する。
- worktree削除、強制cleanup、branch削除は、ユーザーが対象を明示して依頼した場合だけ行う。
- IssueからPRまで進める作業では`issue-workflow`を使用し、既存PRの再開やbase選択を含む詳細手順に従う。

## Bot実行契約

- 人間が付けた`bot:execute`だけを実装開始の許可とする。Botは取得時に`bot:running`へ遷移し、同一Issueを重複実行しない。
- Issue作成Agentは`.github/ISSUE_TEMPLATE/`の該当Issue Formを入力契約として使う。必要な要件を表現できない場合は、Issue本文へ独自の構造を増やすのではなくIssue Formを更新する。
- 実装PRは`develop`をbaseとする。`main`への昇格とリリースは別工程として扱う。
- mergeは`bot:execute`を付けた人間の許可範囲に含む。ただし、Ready PR、競合なし、必須CI成功、GitHub Rulesets通過のすべてを満たした場合だけ実行する。
- GitHub App、Rulesets、branch protection、認証情報、CI設定をIssue達成のために緩和しない。必要な基盤変更は別Issueへ分離する。

## PRとmerge

1. `pr-create`を使い、`.github/PULL_REQUEST_TEMPLATE.md`に準拠した`develop`向けPRを作成する。
2. 全完了条件、ローカル品質ゲート、必要なブラウザ確認が成功した場合だけReadyにする。それ以外はDraftにする。
3. Ready、merge競合なし、必須CI成功、適用されるGitHub Rulesets通過をすべて確認してからmergeする。
4. RulesetやCIを維持したままmergeできない場合は`bot:blocked`とする。
5. merge後もworktreeとbranchを自動削除しない。

将来のHermes専用GitHub Appには、owner review用Rulesetだけ`For pull requests only`のbypassを付与する。CIと安全性のRulesetにはbypassを付与しない。App作成、権限、secret、Ruleset、自動mergeの実設定は専用Issueで管理する。

## 完了時の報告

変更内容、破壊的変更の有無、実行した検証、未解決事項を簡潔に報告する。検証できなかった項目がある場合は、その理由と残るリスクを明示する。
