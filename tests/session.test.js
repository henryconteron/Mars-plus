// AI-assisted (Claude). Reviewed by the MARS+ team.
// Stale A→B results are discarded, and a worker failure becomes a visible error.
import { test, assert, assertEqual } from './harness.js';
import { createRouteSession, settleRoute } from '../app/src/application/route-session.js';
import { createWorkerBridge } from '../app/src/infrastructure/routing/worker-route-solver.js';

function deferred() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

async function rejects(promise) {
  try {
    await promise;
    return null;
  } catch (err) {
    return err;
  }
}

test('route session: a slower earlier request does not overwrite a newer result', async () => {
  const session = createRouteSession();
  const first = deferred();
  const id1 = session.begin();
  const p1 = settleRoute(session, id1, () => first.promise);
  const id2 = session.begin();
  const second = await settleRoute(session, id2, async () => ({ ok: true, ms: 4, stats: { id: 2 } }));
  assertEqual(second.stale, false);
  assertEqual(second.userRoute.id, 2);
  first.release({ ok: true, ms: 20, stats: { id: 1 } });
  const stale = await p1;
  assertEqual(stale.stale, true);
});

test('route session: clear invalidates an in-flight result', async () => {
  const session = createRouteSession();
  const pending = deferred();
  const id = session.begin();
  const p = settleRoute(session, id, () => pending.promise);
  session.invalidate();
  pending.release({ ok: true, ms: 1, stats: { id: 'old' } });
  assertEqual((await p).stale, true);
});

test('route session: a thrown compute becomes a user-visible error', async () => {
  const session = createRouteSession();
  const id = session.begin();
  const settled = await settleRoute(session, id, async () => { throw new Error('worker died'); });
  assertEqual(settled.stale, false);
  assertEqual(settled.status.kind, 'error');
  assertEqual(settled.status.code, 'error');
  assertEqual(settled.userRoute, null);
  assert(/worker died/.test(settled.error.message), 'the original error is kept for the console');
});

test('route session: solver failures keep their code, and notReady stays on the computing message', async () => {
  const session = createRouteSession();
  const blocked = await settleRoute(session, session.begin(), async () => ({ ok: false, code: 'blocked' }));
  assertEqual(blocked.status.kind, 'error');
  assertEqual(blocked.status.code, 'blocked');
  assertEqual(blocked.userRoute, null);
  const notReady = await settleRoute(session, session.begin(), async () => ({ ok: false, code: 'notReady' }));
  assertEqual(notReady.status.code, 'computing');
});

test('worker bridge: resolves the matching message and ignores a late or unknown id', async () => {
  const sent = [];
  const worker = {
    onmessage: null,
    onerror: null,
    postMessage(msg) { sent.push(msg); },
  };
  const bridge = createWorkerBridge(worker);
  const pending = bridge.call('route', { a: 1, b: 2 });
  worker.onmessage({ data: { id: 999, result: { ok: false } } });
  worker.onmessage({ data: { id: sent[0].id, result: { ok: true, stats: { n: 1 } } } });
  assertEqual((await pending).stats.n, 1);
  worker.onmessage({ data: { id: sent[0].id, result: { ok: false } } });
});

test('worker bridge: onerror rejects in-flight calls and every call after that', async () => {
  const worker = {
    onmessage: null,
    onerror: null,
    postMessage() {},
  };
  const bridge = createWorkerBridge(worker);
  const first = bridge.call('route', {});
  const second = bridge.call('legs', {});
  worker.onerror({ message: 'boom', preventDefault() {} });
  const e1 = await rejects(first);
  const e2 = await rejects(second);
  const e3 = await rejects(bridge.call('route', {}));
  assert(e1 instanceof Error && /boom/.test(e1.message), 'in-flight route rejects');
  assert(e2 instanceof Error, 'in-flight legs reject too');
  assert(e3 instanceof Error, 'the dead worker does not hang the next request');
});

test('worker bridge: a postMessage failure rejects that call and leaves the worker usable', async () => {
  const sent = [];
  const worker = {
    onmessage: null,
    onerror: null,
    postMessage() { throw new Error('clone'); },
  };
  const bridge = createWorkerBridge(worker);
  const err = await rejects(bridge.call('route', {}));
  assert(/clone/.test(err.message));
  worker.postMessage = (msg) => { sent.push(msg); };
  const pending = bridge.call('route', { a: 1 });
  worker.onmessage({ data: { id: sent[0].id, result: { ok: true } } });
  assertEqual((await pending).ok, true);
});
