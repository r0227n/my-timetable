---
name: issue-workflow
description: GitHub Issueの番号、#番号、URLから要件と完了条件を読み、git gtrでIssue専用worktreeを作成し、実装、検証、PR作成まで進める。Issueを並列に実装してPRにする依頼で使用する。
---

# Issue Workflow

Issueを、仕様・実装・テストが一致したレビュー可能なPull Requestへ変換する。Issue本文はタスク要件、`docs/SPEC.md`はプロダクト仕様のSSOTとして扱う。1 Issueにつき1 branch、1 `git gtr` worktreeを割り当て、他のIssueと独立して進める。

## Issueを確定する

1. `1`、`#1`、完全なGitHub Issue URLを受け付ける。URLが現在のremoteと異なるリポジトリを指す場合は、対象変更が明示されるまで停止する。
2. `gh issue view`でOpen/Closed、本文、完了条件、ラベル、関連PRを取得する。Closedなら停止する。
3. `AGENTS.md`と`docs/SPEC.md`の関連箇所、既存実装、テストを読み、Issueとの一致を確認する。矛盾は暗黙に解消せず報告して停止する。ただしIssueが具体的なSPEC更新を完了条件として明示している場合、その更新を最初の実装作業に含める。

## 並列worktreeを確保する

1. `git gtr list --porcelain`で既存worktreeを確認する。同じIssueを閉じる既存PRのhead branchがgtr worktreeにあれば、返されたpathで再開する。branchだけが存在する場合は、そのbranch用worktreeを`git gtr new <branch> --porcelain`で作成する。
2. 新規作業ではremoteのbaseをfetchし、`feature/issue-<number>-<english-kebab-slug>`を`git gtr new <branch> --from origin/develop --porcelain`で作成する。ユーザーがbaseを明示した場合だけ`--from`を変更する。base refが存在しない、または安全にfetchできない場合は停止する。
3. 終了コードが0のときだけ成功とし、tab区切りの`path`、`branch`、`hook_status`を読む。以後の編集、検証、commit、push、PR作成はすべて返された絶対`path`内で行う。呼び出し元のworktreeは調整用として保ち、既存変更をstash、破棄、別Issueへ混入しない。
4. `hook_status`が`skipped-untrusted`または`partial`なら報告する。Agentは`git gtr trust`を実行しない。依存関係が未準備なら、リポジトリから確認した通常のセットアップ手順を対象worktree内で明示的に実行する。

並行中のIssueとworktree、branchを共有しない。同じbranchを複数worktreeへ強制作成せず、既存pathを再利用する。

## 実装する

Issueの完了条件を検証可能な作業項目へ分解し、各変更の責務とSSOTを決める。SPEC更新が要求されていればコードより先に反映する。実装、呼び出し元、テスト、文書を整合する状態まで更新し、不要な互換層を残さない。

環境から必須の型検査、lint、test、build、format checkを特定して実行する。UIまたはユーザーフローへ影響する変更は`agent-browser`で実際の画面を操作し、主要フロー、入力、エラー、画面遷移を確認する。Issueが複数言語や永続化などを要求する場合は、その状態ごとに再読み込みを含めて確認する。外部モデルなどローカルで完遂できない依存は、本番仕様を弱めず、確認範囲と残るリスクを記録する。

## PRへ渡す

対象worktree内で`pr-create`を使い、リポジトリのPRテンプレートに準拠したPRを`develop`向けに作成する。ユーザーがbaseを明示した場合はそのbaseへ向ける。全必須検証と完了条件が成功すればReady、失敗が残れば再現情報を含むDraftにする。pushまたはPR作成の失敗は安全に1回だけ再試行し、認証やbranch protectionを変更しない。

PR作成後もworktreeを残す。マージ、Issueの手動close、worktree削除、branch削除は、ユーザーが対象を明示して依頼した場合だけ行う。`git gtr rm --force`、`git gtr rm --delete-branch`、`git gtr clean`を自律実行しない。

## 完了報告

Issue番号、worktreeの絶対path、branch、作成時の`hook_status`、PR URL、変更内容、破壊的変更、検証結果、未解決事項を報告する。検証できなかった項目は理由と残るリスクを示す。
