import { Check, ChevronDown, Cpu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GemmaModelAvailability, GemmaModelId } from "../services/gemma-model";
import { gemmaModels } from "../services/model-config";

interface GemmaModelSelectorProps {
  selected: GemmaModelId;
  e4bAvailability: GemmaModelAvailability;
  onChange: (model: GemmaModelId) => void;
}

export function GemmaModelSelector({ selected, e4bAvailability, onChange }: GemmaModelSelectorProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const select = (model: GemmaModelId) => {
    onChange(model);
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className="model-menu" ref={menuRef}>
      <button
        ref={buttonRef}
        className="model-button"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t("model.button", { model: gemmaModels[selected].shortName })}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Cpu size={17} aria-hidden="true" />
        <span>{gemmaModels[selected].shortName}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open ? (
        <div className="model-dropdown" role="menu" aria-label={t("model.label")}>
          {(["e2b", "e4b"] as const).map((model) => {
            const unavailable = model === "e4b" && !e4bAvailability.available;
            const unavailableReason = unavailable ? (e4bAvailability.reason ?? "memory-unknown") : null;
            return (
              <div className="model-option" key={model}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={model === selected}
                  disabled={unavailable}
                  onClick={() => select(model)}
                >
                  <span>
                    <strong>{gemmaModels[model].shortName}</strong>
                    <small>{gemmaModels[model].approximateSize}</small>
                  </span>
                  {model === selected ? <Check size={16} aria-hidden="true" /> : null}
                </button>
                {unavailableReason ? (
                  <small className="model-unavailable">{t(`model.unavailable.${unavailableReason}`)}</small>
                ) : null}
              </div>
            );
          })}
          <p className="model-change-note">{t("model.nextAnalysis")}</p>
        </div>
      ) : null}
    </div>
  );
}
