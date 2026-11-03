import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launchMetaEmbeddedSignup } from '../src/features/whatsapp/embeddedSignup.js';

function scenario(setupPath = 'new_business') {
  const listeners = new Set();
  const timers = new Map();
  let callback, options;
  const browser = {
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
    setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
  };
  const sdk = { login: (fn, opts) => { callback = fn; options = opts; } };
  const promise = launchMetaEmbeddedSignup({ appId: 'app', configId: 'config', setupPath, attemptId: 'attempt-1' }, sdk, browser);
  return {
    promise, listeners, timers,
    get options() { return options; },
    auth: data => callback(data),
    emit: (data, origin = 'https://www.facebook.com') => [...listeners].forEach(fn => fn({ data, origin })),
    expire: () => [...timers.values()].forEach(fn => fn()),
  };
}

test('Meta CANCEL at envelope level is reported immediately, not as a timeout', async () => {
  const s = scenario();
  s.emit({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { current_step: 'PHONE_NUMBER' } });
  s.expire();
  await assert.rejects(s.promise, /cancelad/i);
  assert.equal(s.listeners.size, 0);
});

test('coexistence launch and WABA-only FINISH work in either callback order', async () => {
  for (const codeFirst of [true, false]) {
    const s = scenario('business_app_existing');
    const code = () => s.auth({ authResponse: { code: 'one-time-code' } });
    const finish = () => s.emit({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data: { waba_id: 'waba', business_id: 'business' } });
    if (codeFirst) { code(); finish(); } else { finish(); code(); }
    s.expire();
    const result = await s.promise;
    assert.equal(result.wabaId, 'waba');
    assert.equal(result.businessId, 'business');
    assert.equal(result.attemptId, 'attempt-1');
    assert.equal(s.options.extras.version, 'v4');
    assert.equal(s.options.extras.featureType, 'whatsapp_business_app_onboarding');
    assert.equal(s.timers.size, 0);
  }
});

test('untrusted origins and non-final events cannot complete signup', async () => {
  const s = scenario();
  s.auth({ authResponse: { code: 'code' } });
  const finish = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: 'waba', phone_number_id: 'phone' } };
  s.emit(finish, 'https://facebook.com.evil.test');
  s.emit(finish, 'http://www.facebook.com');
  s.emit({ ...finish, event: 'START' });
  assert.equal(s.listeners.size, 1);
  s.emit(JSON.stringify(finish));
  assert.equal((await s.promise).phoneNumberId, 'phone');
  assert.equal(s.options.extras.featureType, undefined);
});

test('denied authorization is actionable and clears listeners and timer', async () => {
  const s = scenario();
  s.auth({ status: 'not_authorized' });
  await assert.rejects(s.promise, /autoriz/i);
  assert.equal(s.listeners.size, 0);
  assert.equal(s.timers.size, 0);
});
