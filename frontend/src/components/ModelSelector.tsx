import { useState, useEffect, useRef } from "react";
import type { LLMModelInfo } from "../types";
import { getModels, selectModel } from "../api";

interface ModelSelectorProps {
  onModelChanged?: (model: LLMModelInfo) => void;
}

export default function ModelSelector({ onModelChanged }: ModelSelectorProps) {
  const [models, setModels] = useState<LLMModelInfo[]>([]);
  const [activeModel, setActiveModel] = useState<LLMModelInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    getModels()
      .then((data) => {
        if (!mounted) return;
        setModels(data.models || []);
        setActiveModel(data.active_model || null);
      })
      .catch((err) => {
        console.warn("Failed to load models list:", err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = async (model: LLMModelInfo) => {
    if (model.id === activeModel?.id || switchingId) return;

    setSwitchingId(model.id);
    setIsLoading(true);
    try {
      const res = await selectModel(model.id);
      setActiveModel(res.active_model);
      setModels((prev) =>
        prev.map((m) => ({
          ...m,
          is_active: m.id === model.id,
        }))
      );
      setFeedback(`Active model switched to ${model.name}`);
      onModelChanged?.(res.active_model);
      setTimeout(() => {
        setFeedback(null);
        setIsOpen(false);
      }, 900);
    } catch (err: any) {
      setFeedback(`Error: ${err.message || "Failed to switch model"}`);
      setTimeout(() => setFeedback(null), 3000);
    } finally {
      setIsLoading(false);
      setSwitchingId(null);
    }
  };

  const getProviderColor = (provider: string) => {
    switch (provider.toLowerCase()) {
      case "google":
        return "text-blue-500 bg-blue-500/10 border-blue-500/20";
      case "openai":
        return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
      case "meta":
        return "text-purple-500 bg-purple-500/10 border-purple-500/20";
      default:
        return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button in Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="group px-2.5 py-1.5 bg-secondary/80 hover:bg-secondary text-secondary-foreground rounded-lg transition-all cursor-pointer border border-border hover:border-border/80 flex items-center gap-2 text-xs font-medium shadow-xs"
        title="Switch primary AI model for email classification"
      >
        {/* Sparkle / AI Chip SVG Icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13.5"
          height="13.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary shrink-0 transition-transform group-hover:scale-110"
        >
          <path d="M12 2v20" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground hidden lg:inline">Model:</span>
          <span className="font-semibold text-foreground tracking-tight">
            {activeModel ? activeModel.name : "Loading LLM..."}
          </span>
          {activeModel?.badge && (
            <span
              className={`hidden sm:inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold tracking-wide border ${
                activeModel.is_recommended
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {activeModel.badge}
            </span>
          )}
        </div>

        {/* Chevron Icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-card border border-border shadow-xl z-50 p-2.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2 py-1.5 border-b border-border mb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-primary"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                Primary Decision Model
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">4-Tier Failover</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Select primary triage LLM. Unselected models automatically serve as resilient fallbacks.
            </p>
          </div>

          {feedback && (
            <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium flex items-center gap-1.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{feedback}</span>
            </div>
          )}

          {/* List of Models */}
          <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-0.5">
            {models.map((model) => {
              const isSelected = model.id === activeModel?.id;
              const isPending = switchingId === model.id;

              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleSelect(model)}
                  disabled={isLoading}
                  className={`w-full text-left p-2.5 rounded-lg transition-all border cursor-pointer relative flex flex-col gap-1 ${
                    isSelected
                      ? "bg-primary/5 border-primary/40 shadow-xs"
                      : "hover:bg-accent/60 border-transparent hover:border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getProviderColor(
                          model.provider
                        )}`}
                      >
                        {model.provider}
                      </span>
                      <span className="text-xs font-semibold text-foreground tracking-tight">
                        {model.name}
                      </span>
                      {model.is_recommended && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          BEST CHOICE
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isPending ? (
                        <span className="text-[11px] text-muted-foreground animate-pulse">Switching...</span>
                      ) : isSelected ? (
                        <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                    {model.description}
                  </p>

                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground font-mono">
                    <span className="flex items-center gap-1">
                      <span className="text-foreground/80 font-semibold">Latency:</span> {model.latency_badge}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-foreground/80 font-semibold">Cost:</span> {model.input_cost_per_m} / 1M
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-2 pt-2 border-t border-border px-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Deterministic guardrails active across all models</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">0% Safety Breach</span>
          </div>
        </div>
      )}
    </div>
  );
}

