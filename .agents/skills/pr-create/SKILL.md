---
name: pr-create
description: Gitブランチの差分と検証結果を確認し、リポジトリのPRテンプレートに準拠したGitHub Pull Requestを作成する。PR作成、Draft PR、PR本文準備を依頼されたときに使用する。
---

# PR Create

レビュー可能なブランチを、検証結果と未解決事項が追跡できるPull Requestにする。リポジトリの指示、`.github/PULL_REQUEST_TEMPLATE.md`、Issue本文をそれぞれのSSOTとして扱う。

## 準備

1. `AGENTS.md`と配下の指示を読み、PRのbase branchと必須検証を特定する。明示がなければGitHubのdefault branchを使う。
2. 現在ブランチ、追跡先、作業ツリー、baseとの差分、関連Issue、同じhead branchまたはIssueの既存PRを確認する。
3. base branch上、差分なし、未解決conflict、秘密情報・デバッグ生成物の混入、由来不明の変更がある場合はPRを作成せず報告する。既存PRがあれば新規作成せず、そのPRを更新対象として扱う。

## PRテンプレート

`.github/PULL_REQUEST_TEMPLATE.md`を読み、その見出しとチェック項目を保った本文を作る。テンプレートがなければ、概要、関連Issue、変更内容、仕様との整合、破壊的変更、検証結果、ブラウザ確認、未解決事項を含むテンプレートを作業ブランチへ追加する。

本文には次を満たす具体的な事実を書く。

- 関連Issueがある場合はURLと`Closes #<number>`で示す。ない場合は理由を明記する。
- Issueの完了条件は短い識別名、証拠、結果で対応づけ、Issue本文の長文を複製しない。
- 実行したコマンドと成否、ブラウザで操作したフローと結果を記録する。
- 破壊的変更がなければ「なし」、未解決事項がなければ「なし」と明記する。
- 未実施項目を成功扱いにせず、失敗原因と残るリスクを記載する。

## 検証と公開

環境から利用可能な型検査、lint、test、build、format checkを特定して実行する。UIまたはユーザーフローへ影響する変更は`agent-browser`でローカルアプリを操作し、主要フロー、入力、エラー、画面遷移を確認する。

全必須検証と完了条件が成功した場合だけReady PRにする。失敗が残る場合は、変更が保存され、失敗が再現可能で、秘密情報や不要な生成物がないことを確認したうえでDraft PRにする。

論理的な単位で変更をcommitし、head branchをpushしてから`gh pr create`または既存PRの編集を行う。pushまたはPR操作が失敗した場合は外部状態を確認して安全に1回だけ再試行し、解消しなければ停止する。認証設定、branch protection、レビュー状態は変更しない。PRのマージ、Issueの手動close、branch削除は行わない。

## 完了報告

PR番号、タイトル、URL、base/head、ReadyまたはDraft、検証結果、破壊的変更、未解決事項を報告する。
