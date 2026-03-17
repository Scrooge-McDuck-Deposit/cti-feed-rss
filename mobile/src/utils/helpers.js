/**
 * Funzioni di utilità per l'app CTI Feed RSS.
 */

import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';

/**
 * Formatta una data ISO in formato leggibile italiano.
 */
export function formatDate(dateString) {
  if (!dateString) return 'N/D';
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    return format(date, 'dd MMM yyyy, HH:mm', { locale: it });
  } catch {
    return 'N/D';
  }
}

/**
 * Restituisce il tempo relativo (es. "2 ore fa").
 */
export function timeAgo(dateString) {
  if (!dateString) return '';
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    return formatDistanceToNow(date, { addSuffix: true, locale: it });
  } catch {
    return '';
  }
}

/**
 * Tronca il testo a una lunghezza massima.
 */
export function truncateText(text, maxLength = 150) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

/**
 * Converte il nome della severità in italiano.
 */
export function severityLabel(severity) {
  const labels = {
    critical: 'Critico',
    high: 'Alto',
    medium: 'Medio',
    low: 'Basso',
    informational: 'Informativo',
  };
  return labels[severity] || severity;
}

/**
 * Converte il nome della categoria in italiano.
 */
export function categoryLabel(category) {
  const labels = {
    finance: 'Finanza',
    healthcare: 'Sanità',
    government: 'Governo',
    energy: 'Energia',
    telecommunications: 'Telecomunicazioni',
    manufacturing: 'Manifattura',
    education: 'Istruzione',
    retail: 'Retail',
    technology: 'Tecnologia',
    transportation: 'Trasporti',
    defense: 'Difesa',
    critical_infrastructure: 'Infrastrutture Critiche',
    general: 'Generale',
    unknown: 'Non classificato',
  };
  return labels[category] || category;
}

/**
 * Icona per la categoria.
 */
export function categoryIcon(category) {
  const icons = {
    finance: 'cash-outline',
    healthcare: 'medkit-outline',
    government: 'business-outline',
    energy: 'flash-outline',
    telecommunications: 'call-outline',
    manufacturing: 'construct-outline',
    education: 'school-outline',
    retail: 'cart-outline',
    technology: 'laptop-outline',
    transportation: 'airplane-outline',
    defense: 'shield-outline',
    critical_infrastructure: 'warning-outline',
    general: 'globe-outline',
    unknown: 'help-circle-outline',
  };
  return icons[category] || 'help-circle-outline';
}

/**
 * Formatta la dimensione in bytes in formato leggibile.
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
