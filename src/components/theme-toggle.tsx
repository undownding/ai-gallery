"use client";

import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

export function useThemePreference() {
  // 服务器端和客户端首次渲染都使用 "system"，确保 hydration 一致
  // DOM 主题已通过 layout.tsx 中的内联脚本设置，避免闪屏
  const [mode, setMode] = useState<ThemeMode>("system");
  const [mounted, setMounted] = useState(false);

  // 客户端挂载后立即从 DOM 和 localStorage 同步状态
  useEffect(() => {
    if (typeof window === "undefined") return;
    setMounted(true);
    
    // 优先从 DOM 读取（内联脚本已设置），确保与显示一致
    const root = document.documentElement;
    const domTheme = root.getAttribute("data-theme");
    
    let initialMode: ThemeMode = "system";
    if (domTheme === "light" || domTheme === "dark") {
      initialMode = domTheme;
    } else {
      // 如果 DOM 没有设置，从 localStorage 读取
      const stored = window.localStorage.getItem("ai-gallery-theme");
      if (stored === "light" || stored === "dark" || stored === "system") {
        initialMode = stored;
      }
    }
    
    setMode(initialMode);
  }, []);

  // 当 mode 改变时更新 DOM 和 localStorage（仅在挂载后）
  useEffect(() => {
    if (typeof window === "undefined" || !mounted) return;
    const root = document.documentElement;
    if (mode === "system") {
      root.removeAttribute("data-theme");
      window.localStorage.setItem("ai-gallery-theme", "system");
      return;
    }
    root.dataset.theme = mode;
    window.localStorage.setItem("ai-gallery-theme", mode);
  }, [mode, mounted]);

  return [mode, setMode] as const;
}

export function ThemeToggle({ mode, onChange }: { mode: ThemeMode; onChange: (next: ThemeMode) => void }) {
  const cycleOrder: ThemeMode[] = ["system", "light", "dark"];
  const next = cycleOrder[(cycleOrder.indexOf(mode) + 1) % cycleOrder.length];
  const label = mode === "system" ? "Auto" : mode === "light" ? "Light" : "Dark";

  return (
    <button
      type="button"
      className="theme-button"
      data-mode={mode}
      onClick={() => onChange(next)}
      suppressHydrationWarning
    >
      <span className="theme-button__indicator" aria-hidden />
      <span suppressHydrationWarning>{label} theme</span>
    </button>
  );
}
