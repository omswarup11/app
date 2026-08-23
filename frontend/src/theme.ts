// Sanjeevan design tokens — from the prototype handoff (high fidelity).
export const C = {
  primary: "#2563EB",
  primaryHover: "#1D4ED8",
  primaryTint: "#EFF6FF",
  primaryTintStrong: "#DBEAFE",
  primaryOnTint: "#1D4ED8",
  teal: "#0F766E",
  tealTint: "#CCFBF1",
  tealBg: "#F0FDFA",
  ink: "#111827",
  inkHover: "#1F2937",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  placeholder: "#CBD5E1",
  border: "#E5E7EB",
  divider: "#F1F5F9",
  appBg: "#F8FAFC",
  card: "#FFFFFF",
  success: "#22C55E",
  successText: "#15803D",
  successBg: "#DCFCE7",
  successSoft: "#F0FDF4",
  successBorder: "#BBF7D0",
  warning: "#F59E0B",
  warningText: "#B45309",
  warningDark: "#92400E",
  warningBg: "#FEF3C7",
  warningSoft: "#FFFBEB",
  warningBorder: "#FDE68A",
  danger: "#EF4444",
  dangerText: "#B91C1C",
  dangerBg: "#FEE2E2",
  dangerSoft: "#FEF2F2",
  dangerBorder: "#FECACA",
  white: "#FFFFFF",
};

export const RADIUS = {
  pill: 999,
  chip: 12,
  input: 14,
  card: 20,
  hero: 24,
  sheet: 28,
};

export const SPACING = { xs: 4, sm: 8, md: 14, lg: 18, xl: 24 };

// Web accepts boxShadow; native maps to elevation-like shadow.
export const shadow = (level: "card" | "hover" | "primary" | "hero" = "card") => {
  const map: Record<string, any> = {
    card: {
      boxShadow: "0 2px 8px rgba(17,24,39,0.04)",
      shadowColor: "#111827",
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    hover: {
      boxShadow: "0 10px 22px rgba(17,24,39,0.08)",
      shadowColor: "#111827",
      shadowOpacity: 0.1,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
    primary: {
      boxShadow: "0 10px 22px rgba(37,99,235,0.25)",
      shadowColor: "#2563EB",
      shadowOpacity: 0.3,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    hero: {
      boxShadow: "0 14px 30px rgba(37,99,235,0.28)",
      shadowColor: "#2563EB",
      shadowOpacity: 0.32,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
      elevation: 8,
    },
  };
  return map[level];
};

export const F = {
  w400: "400" as const,
  w500: "500" as const,
  w600: "600" as const,
  w700: "700" as const,
  w800: "800" as const,
};
