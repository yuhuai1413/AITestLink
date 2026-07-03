export { cn } from "../lib/utils";
import { glassContainer } from "./glass-tokens";

export const iosRadius = {
  card: "rounded-[38px]",
  panel: "rounded-[20px]",
  control: "rounded-[12px]",
  pill: "rounded-[29px]",
  compact: "rounded-[22px]",
  icon: "rounded-[10px]",
  tiny: "rounded-[8px]",
} as const;

export const pageStyles = {
  shell: "min-h-screen pt-14",
  shellPadded: "min-h-screen pt-14 pb-10",
  shellPaddedLg: "min-h-screen pt-14 pb-16",
  shellBackground: "min-h-screen pt-14 bg-background",
  centeredShell: "min-h-screen pt-14 flex items-center justify-center",

  navBar: "h-[45px] py-2.5 sticky top-14 z-10 bg-background/80 backdrop-blur-[40px] backdrop-saturate-200 backdrop-brightness-105",
  navBarInner: "h-full flex items-center justify-between",
  navBread: "flex items-center gap-1.5 text-sm text-muted-foreground font-medium overflow-hidden",
  navBreadBtn: "truncate hover:text-foreground transition-colors",
  navBreadActive: "text-foreground font-bold shrink-0",

  container3xl: "max-w-3xl mx-auto px-4 sm:px-5",
  container4xl: "max-w-4xl mx-auto px-4 sm:px-5",
  container4xlWide: "max-w-4xl mx-auto px-4 sm:px-6",
  container5xl: "max-w-5xl w-full mx-auto px-4 sm:px-5",
  container6xl: "max-w-6xl mx-auto px-4 sm:px-6",

  pageTitle: "text-2xl font-black text-foreground",
  eyebrow: "text-xs font-bold text-muted-foreground uppercase tracking-widest",
  eyebrowTiny: "text-[11px] font-bold text-muted-foreground uppercase tracking-widest",
  bodyMuted: "text-sm text-muted-foreground",

  roundIcon: `rounded-full flex items-center justify-center shrink-0`,
  smallRoundIcon: `w-7 h-7 rounded-full flex items-center justify-center`,
  metricIcon: `w-10 h-10 rounded-full flex items-center justify-center mb-4`,
  historyRow: `flex items-center gap-3 bg-muted hover:bg-muted/80 ${iosRadius.panel} px-4 py-3.5 transition-colors`,
} as const;

export const feedbackPanelStyles = {
  strength: `bg-emerald-50 border-2 border-emerald-200 ${iosRadius.card} p-5`,
  weakness: `bg-rose-50 border-2 border-rose-200 ${iosRadius.card} p-5`,
  suggestion: `bg-violet-50 border-2 border-violet-200 ${iosRadius.card} p-5`,
} as const;

export const loginStyles = {
  shell: "min-h-screen flex flex-col md:flex-row",
  visualSide: "hidden md:flex md:w-[61.8%] relative flex-col overflow-hidden",
  visualBlob: "absolute rounded-full pointer-events-none",
  visualContent: "relative z-10 flex flex-col h-full px-10 xl:px-14 pt-6 pb-8 xl:pt-8 xl:pb-10",
  visualBrandIcon: `w-11 h-11 xl:w-12 xl:h-12 rounded-full flex items-center justify-center`,
  visualCenter: "flex-1 flex flex-col items-center justify-center -mt-4 xl:-mt-8",
  visualEyebrow: "text-white/40 text-xs xl:text-sm font-bold tracking-[0.25em] uppercase mb-5",
  roleText: "text-3xl xl:text-4xl font-black text-transparent bg-clip-text animate-grad-shift",
  orbitWrap: "relative w-[260px] h-[260px] mt-4 xl:mt-6",
  orbitItem: `absolute w-12 h-12 rounded-full flex items-center justify-center animate-orb-reverse`,
  orbitCore: "absolute w-[72px] h-[72px] rounded-full flex items-center justify-center animate-pulse-glow",
  featurePill: `h-11 xl:h-12 min-w-0 ${iosRadius.pill} flex items-center justify-center gap-2 px-3 xl:px-4`,
  formSide: "w-full md:w-[38.2%] md:min-w-[300px] flex flex-col items-center justify-center bg-background px-5 sm:px-6 py-8 sm:py-12 min-h-screen md:min-h-0",
  formPanel: "w-full max-w-[380px]",
  mobileBrandIcon: `w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30`,
  glassField:
    `bg-white/70 ${iosRadius.pill} overflow-hidden border border-white/40 shadow-[0_2px_8px_rgba(0,0,0,0.06)] focus-within:border-primary/40 focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_0_3px_rgba(91,33,182,0.1)] transition-all duration-300`,
  sendCodeButton:
    `shrink-0 relative h-[52px] sm:h-[58px] px-4 sm:px-5 ${iosRadius.pill} text-sm font-bold text-white transition-all backdrop-blur-[40px] backdrop-saturate-200 border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(91,33,182,0.15)] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap`,
  gradientButton:
    `relative w-full h-[52px] sm:h-[58px] ${iosRadius.pill} text-sm font-bold text-white mb-3 border border-white/30 transition-all shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(91,33,182,0.15)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2`,
} as const;

export const profileStyles = {
  heroCard: `${glassContainer} ${iosRadius.card} p-6 mb-4 animate-stat-in`,
  avatarBox: `w-24 h-24 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30 animate-ring-pulse`,
  statusDot: "absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-emerald-400 rounded-full border-[3px] border-card flex items-center justify-center",
  statCard: `${glassContainer} ${iosRadius.card} p-5 animate-stat-in`,
  sectionCard: `${glassContainer} ${iosRadius.card} p-5 mb-4 animate-stat-in`,
  emptyIcon: `w-16 h-16 ${iosRadius.card} bg-muted flex items-center justify-center mb-4`,
  preferenceIcon: `w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0`,
} as const;
