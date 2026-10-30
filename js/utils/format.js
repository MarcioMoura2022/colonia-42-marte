/**
 * utils/format.js
 * ---------------------------------------------------------------------------
 * Formatação de números, taxas, custos e tempo para a interface.
 */

/** 1234.56 -> "1.2k" · 12.4 -> "12.4" · 0 -> "0" */
export function formatNumber(value) {
  const n = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(n);

  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (abs >= 100) return `${Math.round(n)}`;
  if (abs >= 10) return n.toFixed(1).replace(/\.0$/, '');
  if (abs >= 1) return n.toFixed(1).replace(/\.0$/, '');
  return n.toFixed(2);
}

/** Taxa por segundo: 1.4 -> "+1.4/s", -0.2 -> "-0.2/s" */
export function formatRate(value) {
  if (Math.abs(value) < 0.05) return '0.0/s';
  const sign = value > 0 ? '+' : '−';
  return `${sign}${Math.abs(value).toFixed(1)}/s`;
}

/** Percentual inteiro a partir de uma fração 0..1. */
export function formatPercent(fraction) {
  return `${Math.round(fraction * 100)}%`;
}

/** Custo inteiro para os chips do menu. */
export function formatCost(value) {
  return Math.round(value).toString();
}

/** 3725 -> "1h 2m" */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Relógio decorativo: fração do sol (0..1) -> "06:00". */
export function formatSolTime(fraction) {
  const minutes = Math.floor(((fraction * 24 + 6) % 24) * 60);
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Sinal curto para deltas de recursos. */
export function formatDelta(value) {
  if (Math.abs(value) < 0.5) return '0';
  return `${value > 0 ? '+' : '−'}${Math.round(Math.abs(value))}`;
}
