// AI-assisted (Claude). Reviewed by the MARS+ team.
// RouteSolver implementation backed by a module Web Worker, with a main-thread fallback.
import { createRouteCore } from './route-core.js';

/**
 * Promise bridge over a Worker-like object. onerror rejects every in-flight call
 * and every later call, so a dead worker cannot leave the UI waiting forever.
 * @param {{postMessage:Function, onmessage:Function|null, onerror:Function|null}} worker
 */
export function createWorkerBridge(worker) {
  let seq = 0;
  let failed = null;
  const pending = new Map();
  const failAll = (err) => {
    failed = err;
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };
  worker.onmessage = (event) => {
    const data = event && event.data;
    const p = data && pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    p.resolve(data.result);
  };
  worker.onerror = (event) => {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    const message = (event && event.message) || 'Worker failed';
    failAll(new Error(message));
  };
  return {
    call(type, payload, transfer = []) {
      if (failed) return Promise.reject(failed);
      return new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        try {
          worker.postMessage({ id, type, payload }, transfer);
        } catch (err) {
          pending.delete(id);
          reject(err);
        }
      });
    },
  };
}

function mainThreadSolver() {
  const core = createRouteCore();
  return {
    init: async (m, b, p) => core.init(m, b, p),
    route: async (a, b) => core.route(a, b),
    legs: async (legs, params) => core.legs(legs, params),
    validateTraverse: async (coords) => core.validateTraverse(coords),
  };
}

/** @returns {import('../../application/ports.js').RouteSolver} */
export function createWorkerRouteSolver() {
  let worker = null;
  try {
    worker = new Worker(new URL('./route-worker.js', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  if (!worker) return mainThreadSolver();
  const bridge = createWorkerBridge(worker);
  return {
    init: (meta, buffer, params) => bridge.call('init', { meta, buffer, params }, [buffer]),
    route: (a, b) => bridge.call('route', { a, b }),
    legs: (legs, params) => bridge.call('legs', { legs, params }),
    validateTraverse: (coords) => bridge.call('validateTraverse', { coords }),
  };
}
