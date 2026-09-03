import { useState, useEffect } from "react";

interface HeaderProps {
  unreadCount?: number;
}

export default function Header({ unreadCount = 0 }: HeaderProps) {
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
    <header className="bg-card border-b border-border h-12 px-3 sm:px-4 flex items-center justify-between select-none shrink-0 gap-2">
      {/* Left: App Logo & Title */}
      <div className="flex items-center gap-2.5 shrink-0">
        <img 
          src="/notion-press-logo.png" 
          alt="Notion Press" 
          className="w-6 h-6 sm:w-7 sm:h-7 object-contain shrink-0" 
        />
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-xs sm:text-sm tracking-tight text-foreground truncate max-w-[140px] sm:max-w-none">
            Notion Press <span className="text-muted-foreground font-normal hidden sm:inline">| Author Support Hub</span>
          </span>
        </div>
      </div>



      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setIsDark(!isDark)}
          className="px-2.5 py-1.5 bg-secondary/80 hover:bg-secondary text-secondary-foreground rounded-lg transition-colors cursor-pointer shrink-0 border border-border flex items-center gap-1.5 text-xs font-medium shadow-xs"
          title={`Switch to ${isDark ? "Light" : "Dark"} Mode`}
        >
          {isDark ? (
            /* Sun icon */
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2"/>
              <path d="M12 20v2"/>
              <path d="m4.93 4.93 1.41 1.41"/>
              <path d="m17.66 17.66 1.41 1.41"/>
              <path d="M2 12h2"/>
              <path d="M20 12h2"/>
              <path d="m6.34 17.66-1.41 1.41"/>
              <path d="m19.07 4.93-1.41 1.41"/>
            </svg>
          ) : (
            /* Moon icon */
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-700 dark:text-slate-300">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
            </svg>
          )}
          <span className="hidden sm:inline text-[11px] text-muted-foreground">{isDark ? "Light" : "Dark"}</span>
        </button>
      </div>
    </header>
  );
}
