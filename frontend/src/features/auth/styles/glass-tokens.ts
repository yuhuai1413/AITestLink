/**
 * Apple-aligned Liquid Glass design tokens.
 *
 * All glass effects in the app MUST derive from these constants.
 * Two consumer layers share the same values:
 *   1. GlassContainer  — static frosted panels (cards, nav bars, dropdowns)
 *   2. LiquidGlassIndicator — interactive hover highlight that tracks the cursor
 *
 * Reference: Apple WWDC 2025 "Meet Liquid Glass" / HIG Material section.
 * CSS `backdrop-filter` is a simplified approximation of the native Metal shader,
 * but these values reproduce ~90% of the visual impression.
 */

/* ── Raw values (programmatic / CSS custom properties) ──────────────── */

export const GLASS = {
  /** Backdrop blur radius — Apple standard ~40px */
  blur: "40px",
  /** Color saturation boost behind the glass — Apple uses ~200% */
  saturate: 2.0,
  /** Slight brightness lift to simulate light refraction */
  brightness: 1.05,
  /** Micro contrast bump for readability */
  contrast: 1.05,
} as const;

/* ── Tailwind class strings (consumed by className) ─────────────────── */

/** Core backdrop filter: blur + saturate + brightness + contrast */
export const glassFilter =
  "backdrop-blur-[40px] backdrop-saturate-200 backdrop-brightness-105 backdrop-contrast-105";

/** Base tinted background — 135° three-stop white gradient */
export const glassBg =
  "bg-gradient-to-br from-white/25 via-white/[0.05] to-white/15";

/** Subtle border simulating the glass edge catch-light */
export const glassBorder = "border border-white/30";

/** Multi-layer depth shadow — diffuse, no hard edges */
export const glassShadow = [
  "shadow-[0_4px_16px_rgba(0,0,0,0.08)]",
  "shadow-[0_12px_40px_rgba(0,0,0,0.04)]",
].join(" ");

/** Specular highlight layer — top-left light source, applied via ::before */
export const glassSpecular =
  "before:absolute before:inset-0 before:z-[1] before:rounded-[inherit] " +
  "before:bg-gradient-to-br before:from-white/40 before:via-white/[0.03] before:to-transparent " +
  "before:mix-blend-soft-light before:pointer-events-none";

/** Rim light — 1px inner edge glow, applied via ::after */
export const glassRim =
  "after:absolute after:inset-0 after:z-[2] after:rounded-[inherit] " +
  "after:shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),inset_0_0_0_1px_rgba(255,255,255,0.2)] " +
  "after:pointer-events-none";

/**
 * Complete GlassContainer class string.
 * Combine with a border-radius token from iosRadius or a custom value.
 */
export const glassContainer = [
  "relative overflow-hidden",
  glassFilter,
  glassBg,
  glassBorder,
  glassShadow,
  glassSpecular,
  glassRim,
].join(" ");

/**
 * LiquidGlassIndicator overlay class string.
 * Lighter shadow (indicator is decorative, not structural) + pill default.
 */
export const glassIndicator = [
  "pointer-events-none absolute rounded-full",
  glassFilter,
  glassBg,
  glassBorder,
  "shadow-[0_4px_16px_rgba(0,0,0,0.06)]",
  glassSpecular,
  glassRim,
  "duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
].join(" ");
