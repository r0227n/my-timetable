# React 多言語化方式の調査

調査日: 2026-08-27

## 結論

本プロジェクトには **i18next + react-i18next** を採用し、最初の対応言語を日本語 (`ja`) と英語 (`en`) にするのが適している。

理由は次のとおり。

- `react-i18next` は `initReactI18next` と `useTranslation` により React の再描画と言語変更を統合できる。[公式セットアップ](https://react.i18next.com/latest) / [useTranslation](https://react.i18next.com/latest/usetranslation-hook)
- i18next は対応言語、言語フォールバック、名前空間、動的 import による翻訳リソースの遅延ロードを公式に提供している。[設定項目](https://www.i18next.com/overview/configuration-options) / [翻訳の追加・読込](https://www.i18next.com/how-to/add-or-load-translations)
- ブラウザ言語検出プラグインは `localStorage` と `navigator` の優先順位、保存キー、保存先を明示設定できるため、仕様書の `ui.language` をそのまま SSOT にできる。[i18next-browser-languageDetector](https://github.com/i18next/i18next-browser-languageDetector)
- JSON リソースをアプリと一緒にビルドでき、画像・抽出データや翻訳対象文字列を外部サービスへ送らない。GitHub Pages の静的配信と本プロジェクトのプライバシー制約を維持できる。

## 候補比較

| 候補 | 長所 | 本プロジェクトでの注意 | 評価 |
|---|---|---|---|
| i18next + react-i18next | React hook、言語検出、フォールバック、名前空間、遅延ロードを組み合わせられる。JSON を直接管理できる | メッセージ抽出は別途仕組みを選ぶ必要がある。設定の自由度が高いため、言語決定と永続化を一箇所に閉じる必要がある | 推奨 |
| FormatJS / React Intl | ICU Message Syntax、日時・数値・複数形、メッセージ抽出が一体化している。TypeScript を公式サポートする。[React Intl](https://formatjs.github.io/docs/react-intl/) | 言語検出・`ui.language` 永続化・カタログロードはアプリ側で設計する。既存 UI 全体を段階移行する用途では記述・抽出ツールの導入範囲が広い | ICU 中心の翻訳運用や翻訳ベンダー連携を最優先する場合の有力候補 |
| Lingui | React、Vite plugin、CLI による抽出・コンパイル、PO 等の標準的なカタログ形式を一体提供する。[Lingui 公式](https://lingui.dev/) | macro、Vite plugin、抽出・コンパイル工程を追加する。現時点の小規模・静的 SPA には導入時の変更範囲が大きい | 翻訳抽出ワークフローが先に必要になった場合に再評価 |
| 独自 Context + `Intl` | 依存が少ない | 複数形、補間、リッチテキスト、欠落キー、フォールバック、名前空間、ロード状態を独自実装することになる | 非推奨 |

FormatJS は `IntlProvider`、`useIntl`、メッセージ記述子と CLI 抽出を提供する。[React Intl API](https://formatjs.github.io/docs/react-intl/api/) / [メッセージ宣言](https://formatjs.github.io/docs/getting-started/message-declaration/)。一方、現在必要なのはブラウザ設定と一体化した段階的な UI 翻訳であり、その部分を直接カバーする i18next の方が適合する。

## 推奨設計

### 責務と配置

```text
src/i18n/
  config.ts                 # 対応言語、既定言語、名前空間の SSOT
  i18n.ts                   # i18next 初期化だけを担当
  format.ts                 # Intl を使う日時・数値の純粋関数
  locales/
    ja/common.json
    ja/upload.json
    ja/review.json
    ja/timeline.json
    ja/export.json
    en/common.json
    en/upload.json
    en/review.json
    en/timeline.json
    en/export.json
```

- `config.ts` に `SUPPORTED_LANGUAGES = ["ja", "en"] as const`、`DEFAULT_LANGUAGE = "ja"`、`LANGUAGE_STORAGE_KEY = "ui.language"` を置く。
- 画面コンポーネントは `useTranslation(namespace)` のみを利用し、`localStorage` や言語検出を直接扱わない。
- ドメイン値（例: `LIVE`、時刻、予定種別）は翻訳済み文字列へ変換せず、表示境界で翻訳する。ICS、Google Calendar、SVG/PNG に含める表示文言は、出力時に明示された UI 言語を渡して翻訳する。

### 言語検出と保存

検出順は次のとおりに固定する。

1. `localStorage["ui.language"]`
2. `navigator.languages` / `navigator.language`
3. 既定の `ja`

`i18next-browser-languagedetector` は検出順、`lookupLocalStorage`、キャッシュ先を設定できるが、初回の `navigator` 検出結果まで自動保存すると、その後ブラウザ設定を変更しても以前の値が優先される。このプロジェクトでは `caches: []` とし、ユーザーが言語セレクターを操作した時だけ `ui.language` を保存する。プラグイン公式 README は `supportedLngs` を指定すると検出結果から利用可能な言語を選べることも説明している。[ブラウザ言語検出](https://github.com/i18next/i18next-browser-languageDetector)

言語変更時は一つのアプリケーションサービスで以下をまとめて行う。

1. 対応言語であることを検証する。
2. `i18n.changeLanguage(language)` を await する。
3. 成功後に `localStorage.setItem("ui.language", language)` を行う。
4. `document.documentElement.lang` を `i18n.resolvedLanguage` に更新する。
5. RTL 言語を将来追加する場合は `document.documentElement.dir = i18n.dir()` も更新する。

壊れた値・未対応値・Storage 例外は無視し、`navigator`、最終的に `ja` へフォールバックする。Cookie や別の storage key は使わない。

### i18next 設定

概念上の設定は次のとおり。

```ts
{
  supportedLngs: ["ja", "en"],
  fallbackLng: "ja",
  load: "languageOnly",
  defaultNS: "common",
  ns: [],
  partialBundledLanguages: true,
  interpolation: { escapeValue: false },
  react: { useSuspense: true },
  detection: {
    order: ["localStorage", "navigator"],
    lookupLocalStorage: "ui.language",
    caches: [],
  },
}
```

React は文字列を既定でエスケープするため、react-i18next の公式例も `escapeValue: false` を設定している。[公式セットアップ](https://react.i18next.com/latest)。翻訳文字列を `dangerouslySetInnerHTML` へ渡さず、リンクや強調を含む文は `Trans` で React 要素として組み立てる。

### 翻訳リソースと遅延ロード

- キーは日本語本文そのものではなく、`upload.dropzone.title` のような安定した意味キーにする。
- `common` はヘッダー、ナビゲーション、共通操作、エラーなど初期表示に必要な最小集合にする。
- 画面単位の名前空間を設け、各コンポーネントが必要な名前空間を宣言する。react-i18next は名前空間の分割と必要な名前空間が読み込まれるまでの Suspense を公式にサポートする。[複数翻訳ファイル](https://react.i18next.com/guides/multiple-translation-files)
- `i18next-resources-to-backend` と `import("./locales/${language}/${namespace}.json")` を使い、Vite のチャンクとして同一デプロイに含める。i18next はこの動的 import 方式を公式に例示している。[翻訳の追加・読込](https://www.i18next.com/how-to/add-or-load-translations)
- GitHub Pages の `base` を壊しやすい `/locales/...` のルート絶対 URL は使わない。動的 import なら Vite がビルド時 URL を解決する。
- 初期表示のちらつきを防ぐため、i18next 初期化完了後に root を render し、画面名前空間の読込中は既存のアプリローディング UI を Suspense fallback に使う。
- 翻訳リソースを `localStorage` にキャッシュしない。翻訳はビルド済み静的アセットであり、ブラウザ HTTP キャッシュに任せる。仕様上の永続キーを `ui.language` と `ui.theme` だけに保つ。

### 日時・数値・複数形

- 日時・数値の文字列連結や言語別分岐を避け、`Intl.DateTimeFormat`、`Intl.NumberFormat`、必要に応じて `Intl.ListFormat` を用いる。ECMAScript `Intl` はロケール依存の表示を提供する。[MDN Internationalization](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Internationalization)
- `Intl.DateTimeFormat` には UI 言語を明示し、予定データが持つタイムゾーン（既定 `Asia/Tokyo`）を `timeZone` として明示する。UI 言語とイベントのタイムゾーンは別概念として扱う。[Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- 件数を含む文は i18next の `count` と言語別 plural key を用い、`"全" + count + "件"` のように組み立てない。
- 日時フォーマット結果は実装差が仕様上許容され、ノーブレークスペースや双方向制御文字を含む場合があるため、テストで完全一致の固定文字列を過度に要求しない。[DateTimeFormat.format](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/format)

### TypeScript

- 日本語 `common.json` を基準リソースとして i18next の `CustomTypeOptions` を module augmentation し、存在しないキーをコンパイル時に検出する。
- 対応言語、名前空間、言語セレクターの option はすべて `config.ts` から導出し、文字列 union を別々に定義しない。
- 翻訳キーを動的な任意文字列として組み立てず、種別から翻訳キーへの型付き対応表を置く。

## テスト方針

1. **設定単体テスト**: `ui.language` が `en` なら英語、未対応値なら browser language、どちらも利用不能なら `ja` になる。
2. **永続化テスト**: 初回の browser language 検出では保存せず、ユーザー変更時だけ `ui.language` を保存する。言語以外の作業データを保存しない。
3. **コンポーネントテスト**: テスト専用 i18next instance を毎テスト生成し、`ja` / `en` の主要表示、補間、複数形、アクセシブル名を検証する。グローバル singleton の状態をテスト間で共有しない。
4. **欠落キー検査**: 日本語と英語でキー集合が一致することをテストする。`fallbackLng` があるため、英訳漏れが実行時に日本語で隠れないよう CI で失敗させる。
5. **フォーマット単体テスト**: locale と timeZone を明示し、意味のある部分または `formatToParts()` を検証する。実装依存の空白を含む完成文字列だけに依存しない。
6. **主要フロー**: 言語切替後にヘッダー、各ステップ、エラー、確認ダイアログ、エクスポート成果物が同じ言語になり、再読込後も選択言語が維持されることをブラウザで確認する。
7. **HTML 属性**: 言語変更時に `<html lang>` が更新されることを検証する。

i18next はテスト用に `lng: "cimode"` を設定すると翻訳キー自体を返せるため、未翻訳箇所の発見にも利用できる。[i18next API](https://www.i18next.com/overview/api)

## 導入手順

1. `i18next`、`react-i18next`、`i18next-browser-languagedetector`、`i18next-resources-to-backend` を依存へ追加する。
2. `src/i18n/config.ts` と `src/i18n/i18n.ts` を作り、言語決定・保存・HTML 属性同期を集約する。
3. `ja/common.json` と `en/common.json`、TypeScript の型拡張、テスト用 instance factory を用意する。
4. `main.tsx` で i18next 初期化完了後に描画し、Suspense fallback を追加する。
5. `AppHeader` に言語セレクターを追加する。言語変更で作業中データを破棄しない。
6. 共通 UI から画面単位にハードコード文字列を移行する。alert、入力 placeholder、`aria-label`、画像 `alt`、エラー文字列も対象にする。
7. ドメイン・サービス層が日本語 UI 文字列を返している箇所は、安定した error code / status と表示境界の翻訳へ分離する。
8. 日時・数値表示を `src/i18n/format.ts` に集約する。ICS の機械可読形式はロケール依存にしない。
9. キー整合性テスト、両言語の UI テスト、ビルド、ブラウザ主要フローを検証する。
10. `docs/SPEC.md` に対応言語、言語セレクターの配置、出力物の言語、言語切替時の挙動を追記してから完了とする。

## 完了条件案

- 日本語と英語を UI から切り替えられ、再読込後も明示選択が `ui.language` から復元される。
- 初回は browser language が対応済みなら採用し、それ以外は日本語になる。
- 主要画面、操作、エラー、アクセシブル名、確認ダイアログにハードコードされた日本語が残っていない。
- 日時・数値・件数が選択言語で表示され、イベントのタイムゾーンは維持される。
- `<html lang>` が現在の解決済み言語と一致する。
- 翻訳リソースは静的アセットとして配信され、翻訳やユーザーデータが端末外へ送信されない。
- 翻訳キーの両言語整合性テスト、型検査、lint、テスト、build、ブラウザ主要フローが成功する。

## 注意点

- 本 Issue の実装前に `docs/SPEC.md` を更新し、初期値 `ja` と「初回 browser language 検出」の関係を明文化する必要がある。推奨は「保存済み設定がなければ対応済み browser language、未対応なら `ja`」である。
- UI 翻訳と OCR 対象言語は別機能である。UI を英語化しても OCR モデルや抽出対象言語を自動変更しない。
- イベント名、出演者名、OCR 結果などのユーザーデータは翻訳しない。
- `fallbackLng: "ja"` は障害時の表示継続策であり、英語リソースの欠落を許容する品質基準にはしない。
- 翻訳済み文を分割して JSX の語順を固定しない。言語による語順変更が必要な文は、一つのメッセージとして補間または `Trans` を使う。
