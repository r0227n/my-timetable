---
name: issue-workflow
description: GitHub Issueの番号、#番号、URLから要件と完了条件を読み、base同期、作業ブランチ作成、実装、検証、PR作成まで進める。Issueを実装してPRにする依頼で使用する。
---

# Issue Workflow

Issueを、仕様・実装・テストが一致したレビュー可能なPull Requestへ変換する。Issue本文はタスク要件、`docs/SPEC.md`はプロダクト仕様のSSOTとして扱う。

## Issueを確定する

1. `1`、`#1`、完全なGitHub Issue URLを受け付ける。URLが現在のremoteと異なるリポジトリを指す場合は、対象変更が明示されるまで停止する。
2. `gh issue view`でOpen/Closed、本文、完了条件、ラベル、関連PRを取得する。Closedなら停止する。
3. `needs-triage`付きIssueは原則停止する。ユーザーがそのIssueの実行を明示している場合は、その承認を記録して続行する。
4. `AGENTS.md`と`docs/SPEC.md`の関連箇所、既存実装、テストを読み、Issueとの一致を確認する。矛盾は暗黙に解消せず報告して停止する。ただしIssueが具体的なSPEC更新を完了条件として明示している場合、その更新を最初の実装作業に含める。

## 安全なブランチを作る

作業ツリーがcleanであることを確認する。既存変更をstash、破棄、別commitへ混入しない。

base branchはリポジトリの指示、ユーザー指定、GitHub default branchの順に解決する。remoteのbaseをfetchし、local baseを`pull --ff-only`で同期する。baseがremoteにない、divergeしている、または安全に同期できない場合は停止する。

同じIssueを閉じる既存PRがあれば、そのhead branchを再開する。同名branchだけが存在する場合は状態を報告して停止する。新規作業はbaseから`feature/issue-<number>-<english-kebab-slug>`を作る。

## 実装する

Issueの完了条件を検証可能な作業項目へ分解し、各変更の責務とSSOTを決める。SPEC更新が要求されていればコードより先に反映する。実装、呼び出し元、テスト、文書を整合する状態まで更新し、不要な互換層を残さない。

環境から必須の型検査、lint、test、build、format checkを特定して実行する。UIまたはユーザーフローへ影響する変更は`agent-browser`で実際の画面を操作し、主要フロー、入力、エラー、画面遷移を確認する。Issueが複数言語や永続化などを要求する場合は、その状態ごとに再読み込みを含めて確認する。外部モデルなどローカルで完遂できない依存は、本番仕様を弱めず、確認範囲と残るリスクを記録する。

## PRへ渡す

`pr-create`を使い、リポジトリのPRテンプレートに準拠したPRをbase branch向けに作成する。全必須検証と完了条件が成功すればReady、失敗が残れば再現情報を含むDraftにする。pushまたはPR作成の失敗は安全に1回だけ再試行し、認証やbranch protectionを変更しない。

PR作成後にマージ、Issueの手動close、branch削除は行わない。

## 完了報告

Issue番号、branch、PR URL、変更内容、破壊的変更、検証結果、未解決事項を報告する。検証できなかった項目は理由と残るリスクを示す。
