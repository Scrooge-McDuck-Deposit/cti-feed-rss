/**
 * Tema dell'applicazione CTI Feed RSS.
 * Dark theme ottimizzato per la lettura di intelligence.
 */

export const colors = {
  // Background
  background: '#0f172a',
  surface: '#1e293b',
  surfaceLight: '#334155',
  card: '#1e293b',
  cardElevated: '#253349',

  // Primary
  primary: '#3b82f6',
  primaryDark: '#2563eb',
  primaryLight: '#60a5fa',

  // Accent
  accent: '#06b6d4',
  accentDark: '#0891b2',

  // Text
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  textInverse: '#0f172a',

  // Borders
  border: '#334155',
  borderLight: '#475569',

  // Severity Colors
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
  informational: '#3b82f6',

  // Category Colors
  finance: '#f59e0b',
  healthcare: '#ef4444',
  government: '#8b5cf6',
  energy: '#f97316',
  telecommunications: '#06b6d4',
  manufacturing: '#64748b',
  education: '#10b981',
  retail: '#ec4899',
  technology: '#3b82f6',
  transportation: '#6366f1',
  defense: '#dc2626',
  critical_infrastructure: '#b91c1c',
  general: '#94a3b8',
  unknown: '#64748b',

  // Status
  success: '#22c55e',
  warning: '#eab308',
  error: '#ef4444',
  info: '#3b82f6',

  // Other
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.5)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
  xxxl: 28,
  title: 32,
};

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
};

export const severityColor = (severity) => {
  const map = {
    critical: colors.critical,
    high: colors.high,
    medium: colors.medium,
    low: colors.low,
    informational: colors.informational,
  };
  return map[severity] || colors.textMuted;
};

export const categoryColor = (category) => {
  return colors[category] || colors.general;
};

export default { colors, spacing, fontSize, borderRadius, shadows, severityColor, categoryColor };
