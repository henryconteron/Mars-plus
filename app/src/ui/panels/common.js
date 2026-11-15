// AI-assisted (Claude). Reviewed by the MARS+ team.
// Shared text builders for panels (reasons, plan names, explanation statements).
import { fmt, fmtHour } from '../../shared/format.js';

export function reasonText(i18n, reason) {
  if (!reason) return '';
  const v = { ...reason.values };
  if ('hour' in v) v.hour = fmtHour(v.hour);
  if ('tempC' in v) v.tempC = fmt(v.tempC, 1);
  if ('windMs' in v) v.windMs = fmt(v.windMs, 1);
  if ('doseUGy' in v) v.doseUGy = fmt(v.doseUGy, 0);
  if (reason.code === 'dustStorm' && Number.isFinite(v.tau)) {
    return i18n.t('reason.dustStormMeasured', { tau: fmt(v.tau, 2), threshold: fmt(v.threshold, 2) });
  }
  if ('task' in v) v.task = i18n.t(`task.${v.task}`);
  if ('leg' in v) v.leg = i18n.t(`leg.${v.leg}`);
  return i18n.t(`reason.${reason.code}`, v);
}

export const planName = (i18n, id) => i18n.t(`plan.${id}`);
export const filterName = (i18n, n) => i18n.t(`filter.${n}`);

/** Explanation statement -> sentence. */
export function statementText(i18n, st) {
  const v = st.values;
  switch (st.code) {
    case 'recommended':
      return i18n.t('explain.recommended', { planId: v.planId, planName: planName(i18n, v.planId), departure: fmtHour(v.departure), returnTime: fmtHour(v.returnHour), totalMin: Math.round(v.totalMin), dose: fmt(v.doseUGy, 0) });
    case 'whyNotPlan':
      return i18n.t('explain.whyNotPlan', { planId: v.planId, planName: planName(i18n, v.planId), filterName: filterName(i18n, v.filter), reason: reasonText(i18n, v.reason) });
    case 'departureWindow':
      return i18n.t('explain.departureWindow', { planId: v.planId, from: fmtHour(v.from), to: fmtHour(v.to) });
    case 'postpone':
      return i18n.t('explain.postpone', { planId: v.planId, departure: fmtHour(v.departure), filterName: filterName(i18n, v.filter), reason: reasonText(i18n, v.reason) });
    case 'filterCounts':
      return i18n.t('explain.filterCounts', { viable: v.viable, total: v.total, c1: v.counts[1] ?? 0, c2: v.counts[2] ?? 0, c3: v.counts[3] ?? 0, c4: v.counts[4] ?? 0, c5: v.counts[5] ?? 0 });
    default:
      return '';
  }
}
