import { useState, useEffect } from "react";

export default function Header() {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem("theme") === "dark" || 
      (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  return (
    <header className="bg-card border-b border-border h-12 px-4 flex items-center justify-between select-none shrink-0">
      {/* Left: App Logo & Name */}
      <div className="flex items-center gap-3">
        <img 
          src="/notion-press-logo.png" 
          alt="Notion Press" 
          className="w-7 h-7 rounded-full object-contain bg-black shrink-0" 
        />
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs tracking-tight text-foreground">
            Notion Press <span className="text-muted-foreground font-normal">| Author Support Hub</span>
          </span>
        </div>
      </div>

      {/* Center: Quick Ribbon Status */}
      <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground font-mono">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Gemini 3.6 Flash</span>
        </span>
        <span className="text-border">•</span>
        <span>LangGraph Checkpointer: SQLite</span>
        <span className="text-border">•</span>
        <span>HITL Policy: Active</span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsDark(!isDark)}
          className="px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Toggle Dark / Light Theme"
        >
          <span>{isDark ? "☀️ Light" : "🌙 Dark"}</span>
        </button>
      </div>
    </header>
  );
}
