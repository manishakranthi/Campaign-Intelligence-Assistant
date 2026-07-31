/**
 * Recharts takes plain color strings, not Tailwind classes -- these reference CSS custom
 * properties (defined in globals.css) that flip with the .dark class on <html> (toggled by
 * ThemeToggle.tsx), so charts stay theme-aware without any JS-side dark-mode detection.
 */
export const CHART_COLORS = {
  positive: "var(--chart-positive)",
  negative: "var(--chart-negative)",
  neutral: "var(--chart-neutral)",
  accent: "var(--chart-accent)",
  grid: "var(--chart-grid)",
};
