# @my-timetable/glm-ocr-web

ブラウザ内GLM-OCRの実行基盤。アプリからTransformers.js、ONNX Runtime Web、モデル配布構成、キャッシュ実装を隠すためのパッケージです。

## エンジン

- `glm-ocr`: `onnx-community/GLM-OCR-ONNX` のq4グラフをONNX Runtime Web / WebGPUで実行します。画像は端末外へ送信しません。

モデル、プロセッサー、自己回帰デコーダーはパッケージ内に隠蔽し、アプリ側は `createOcrEngine()` のみを参照します。
