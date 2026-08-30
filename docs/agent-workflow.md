# Agent開発ワークフロー

## 目的

Issueを、仕様・実装・検証が一致したレビュー可能なPull Requestへ変換するための実行手順を定義する。プロダクト仕様は`docs/SPEC.md`、開発コマンドは`package.json`、Issueの入力項目は`.github/ISSUE_TEMPLATE/`をSSOTとする。

## 実装開始の許可

対話型Agentは、人間からIssue番号またはURLを指定して実装を依頼された時点で作業を開始できる。`bot:execute`ラベルの有無を開始条件にせず、`bot:*`ラベルも変更しない。同じIssueを閉じる既存PRまたはworktreeがあれば新規作成せず再開する。

実装依頼はPR作成までを許可する。merge、Issueの手動close、worktree削除、branch削除には、それぞれ対象を特定した明示的な依頼を必要とする。

## 自動実行基盤の状態遷移

将来の自動実行基盤では、実行許可と実行状態に次のラベルを使い、同時に複数の状態ラベルを付けない。

```text
bot:execute -> bot:running -> bot:done
                           -> bot:blocked
```

1. 自動実行基盤は、人間が`bot:execute`を付けたOpen Issueだけを実行対象とする。作成者や`agent-created`の有無は問わない。
2. 取得時に`bot:execute`を外して`bot:running`を付ける。この遷移を論理ロックとし、将来の実行基盤ではIssue番号単位のconcurrencyも設定する。
3. 同じIssueを閉じる既存PRまたはworktreeがあれば新規作成せず再開する。
4. PRのmergeまで完了したら`bot:running`を外して`bot:done`を付ける。
5. 人間の判断、権限、認証、仕様変更の承認が必要なら、理由と再開条件をIssueへ記録し、`bot:running`を外して`bot:blocked`を付ける。
6. 再開時は人間が不足を解消し、`bot:blocked`を外して`bot:execute`を付け直す。一時的な通信失敗以外を自動再試行せず、同一の一時エラーも再試行は1回までとする。

Issue作成Agentは該当Issue Formの全必須項目を満たし、検証可能な完了条件を記載する。`docs/SPEC.md`の変更が必要なら、その更新を完了条件に明記する。Issue Formで必要な情報を表現できない場合は、Formを先に改善する。

## 実装の開始

1. `AGENTS.md`、Issue本文、`docs/SPEC.md`の関連節、既存実装、テストを読む。
2. Issueと仕様が矛盾し、IssueにSPEC更新が明記されていなければ`bot:blocked`とする。推測で仕様を変更しない。
3. `issue-workflow`に従い、`git gtr`で1 Issue専用の`feature/issue-<number>-<slug>` worktreeを`origin/develop`から確保する。
4. `git gtr`が返したpath内だけで編集、検証、commit、push、PR作成を行う。
5. Issueの完了条件を検証項目へ分解し、各項目の証拠をPR本文へ対応付ける。
