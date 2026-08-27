import { useRef, useState } from "react";
import { FileImage, LockKeyhole, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { modelConfig } from "../services/model-config";
import { validateImageFile } from "../lib/image";

interface UploadStepProps {
  webGpu: boolean;
  onFile: (file: File) => void;
  onManual: () => void;
}

export function UploadStep({ webGpu, onFile, onManual }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptFile = (file?: File) => {
    if (!file) return;
    const validation = validateImageFile(file);
    setError(validation);
    if (!validation) onFile(file);
  };

  return (
    <main className="hero-shell">
      <section className="hero-copy">
        <span className="eyebrow">
          <Sparkles size={14} /> ON-DEVICE AI
        </span>
        <h1>
          行きたい瞬間を、
          <br />
          <em>ひとつの予定に。</em>
        </h1>
        <p>
          イベントのタイムテーブル画像を読み取り、出演者を選ぶだけ。あなただけの一日を、端末の中で組み立てます。
        </p>
        <div className="privacy-note">
          <ShieldCheck size={21} />
          <div>
            <strong>画像は端末の外へ送信されません</strong>
            <span>読み取りと整理は、すべてこのブラウザ内で行います。</span>
          </div>
        </div>
      </section>

      <section className="upload-card" aria-labelledby="upload-heading">
        <div className="card-topline">
          <span className="card-number">01</span>
          <span>UPLOAD</span>
        </div>
        <h2 id="upload-heading">タイムテーブルを追加</h2>
        <button
          type="button"
          className={`drop-zone ${dragging ? "dragging" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            acceptFile(event.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
          }}
        >
          <span className="upload-icon">
            <Upload size={25} />
          </span>
          <strong>画像をドロップ</strong>
          <span>またはクリックして選択</span>
          <small>JPEG / PNG / WebP ・ 最大20MB</small>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => acceptFile(event.target.files?.[0])}
        />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="text-button" type="button" onClick={onManual}>
          画像を使わず手入力ではじめる
        </button>
        <div className="device-row">
          <div>
            <span className={`status-light ${webGpu ? "ok" : "warn"}`} />
            <span>
              <strong>{webGpu ? "WebGPU 対応" : "WebGPU 非対応"}</strong>
              <small>{webGpu ? "AI解析を利用できます" : "手入力を利用できます"}</small>
            </span>
          </div>
          <div>
            <FileImage size={18} />
            <span>
              <strong>初回モデル</strong>
              <small>
                {modelConfig.ocr.approximateSize} + {modelConfig.structuring.approximateSize}
              </small>
            </span>
          </div>
        </div>
        <div className="local-chip">
          <LockKeyhole size={13} /> ローカル処理のみ
        </div>
      </section>
    </main>
  );
}
