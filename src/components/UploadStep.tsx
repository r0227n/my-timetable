import { useRef, useState } from "react";
import { FileImage, LockKeyhole, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { modelConfig } from "../services/model-config";
import { validateImageFile } from "../lib/image";
import { useTranslation } from "react-i18next";
import type { AppErrorCode } from "../domain/errors";

interface UploadStepProps {
  webGpu: boolean;
  onFile: (file: File) => void;
  onManual: () => void;
}

export function UploadStep({ webGpu, onFile, onManual }: UploadStepProps) {
  const { t } = useTranslation("upload");
  const { t: tCommon } = useTranslation("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<AppErrorCode | null>(null);

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
          {t("heroLine1")}
          <br />
          <em>{t("heroLine2")}</em>
        </h1>
        <p>{t("description")}</p>
        <div className="privacy-note">
          <ShieldCheck size={21} />
          <div>
            <strong>{t("privacyTitle")}</strong>
            <span>{t("privacyDescription")}</span>
          </div>
        </div>
      </section>

      <section className="upload-card" aria-labelledby="upload-heading">
        <div className="card-topline">
          <span className="card-number">01</span>
          <span>UPLOAD</span>
        </div>
        <h2 id="upload-heading">{t("heading")}</h2>
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
          <strong>{t("drop")}</strong>
          <span>{t("choose")}</span>
          <small>{t("fileHint")}</small>
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
            {tCommon(`errors.${error}`)}
          </p>
        ) : null}
        <button className="text-button" type="button" onClick={onManual}>
          {t("manual")}
        </button>
        <div className="device-row">
          <div>
            <span className={`status-light ${webGpu ? "ok" : "warn"}`} />
            <span>
              <strong>{webGpu ? t("webGpuSupported") : t("webGpuUnsupported")}</strong>
              <small>{webGpu ? t("aiAvailable") : t("manualAvailable")}</small>
            </span>
          </div>
          <div>
            <FileImage size={18} />
            <span>
              <strong>{t("firstModel")}</strong>
              <small>
                {modelConfig.ocr.approximateSize} + {modelConfig.structuring.approximateSize}
              </small>
            </span>
          </div>
        </div>
        <div className="local-chip">
          <LockKeyhole size={13} /> {t("localOnly")}
        </div>
      </section>
    </main>
  );
}
