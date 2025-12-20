"use client";

import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

export function useThemePreference() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("ai-gallery-theme");
    if (stored === "light" || stored === "dark") {
      setMode(stored);
      document.documentElement.dataset.theme = stored;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    if (mode === "system") {
      root.removeAttribute("data-theme");
      window.localStorage.removeItem("ai-gallery-theme");
      return;
    }
    root.dataset.theme = mode;
    window.localStorage.setItem("ai-gallery-theme", mode);
  }, [mode]);

  return [mode, setMode] as const;
}

export function ThemeToggle({ mode, onChange }: { mode: ThemeMode; onChange: (next: ThemeMode) => void }) {
  const cycleOrder: ThemeMode[] = ["system", "light", "dark"];
  const next = cycleOrder[(cycleOrder.indexOf(mode) + 1) % cycleOrder.length];
  const label = mode === "system" ? "Auto" : mode === "light" ? "Light" : "Dark";

  return (
    <button type="button" className="theme-button" data-mode={mode} onClick={() => onChange(next)}>
      <span className="theme-button__indicator" aria-hidden />
      <span>{label} theme</span>
    </button>
  );
}
