// AI-assisted (Claude). Reviewed by the MARS+ team.
// Module Web Worker: keeps A* off the main thread so the UI never freezes.
import { createRouteCore } from './route-core.js';

const core = createRouteCore();
self.onmessage = (e) => {
  const { id, type, payload } = e.data;
  try {
    let result;
    if (type === 'init') { core.init(payload.meta, payload.buffer, payload.params); result = { ok: true }; }
    else if (type === 'route') result = core.route(payload.a, payload.b, payload.options);
    else if (type === 'legs') result = core.legs(payload.legs, payload.params);
    else if (type === 'validateTraverse') result = core.validateTraverse(payload.coords);
    else result = { ok: false, code: 'unknownMessage' };
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, result: { ok: false, code: 'error', message: String(err) } });
  }
};
