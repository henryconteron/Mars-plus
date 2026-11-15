// AI-assisted (Claude). Reviewed by the MARS+ team.
// Generation counter for A→B route requests. A newer request, or an explicit
// invalidate (clear), makes an in-flight result stale so it cannot overwrite the UI.
// Compute failures resolve to a visible error status instead of leaving "computing" up.

export function createRouteSession() {
  let token = 0;
  return {
    begin() { return ++token; },
    invalidate() { token += 1; },
    isCurrent(id) { return id === token; },
  };
}

/**
 * @param {ReturnType<typeof createRouteSession>} session
 * @param {number} id token returned by begin()
 * @param {() => Promise<{ok?:boolean, code?:string, ms?:number, stats?:object}>} compute
 */
export async function settleRoute(session, id, compute) {
  try {
    const res = await compute();
    if (!session.isCurrent(id)) return { stale: true };
    if (!res || res.ok !== true) {
      const code = !res || res.code == null ? 'error' : (res.code === 'notReady' ? 'computing' : res.code);
      return { stale: false, status: { kind: 'error', code }, userRoute: null };
    }
    return { stale: false, status: { kind: 'done', ms: res.ms }, userRoute: res.stats ?? null };
  } catch (error) {
    if (!session.isCurrent(id)) return { stale: true, error };
    return { stale: false, status: { kind: 'error', code: 'error' }, userRoute: null, error };
  }
}
