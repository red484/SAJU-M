import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the production shell with the Capacitor bridge replaced by device doubles.
const { outputFiles } = await build({
  entryPoints: ['src/client/native-shell.js'], bundle: true, write: false, format: 'esm',
  plugins: [{ name: 'device-bridge', setup(build) {
    build.onResolve({ filter: /^@capacitor\// }, args => ({ path: args.path, namespace: 'device' }));
    build.onLoad({ filter: /.*/, namespace: 'device' }, () => ({ contents:
      'export const {Capacitor,App,Browser,Directory,Filesystem,LocalNotifications,Network,Share}=globalThis.__device;' }));
  } }]
});
const bundle = outputFiles[0].text;
let instance = 0;
async function device(platform) {
  const values = new Map(), events = new Map();
  const state = { pending: [], permission: 'granted', asked: 0, opened: [] };
  globalThis.location = { search: '' };
  globalThis.localStorage = { get length(){return values.size;}, key:i=>[...values.keys()][i]??null, getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  globalThis.sessionStorage = globalThis.localStorage;
  globalThis.document = { documentElement: { classList: { add() {}, toggle() {} } }, addEventListener() {} };
  globalThis.__device = {
    Capacitor: { isNativePlatform: () => true, getPlatform: () => platform },
    App: { async addListener(event, callback) { events.set(event, callback); } }, Browser: {}, Directory: {}, Filesystem: {}, Share: {},
    Network: { async getStatus() { return { connected: true }; }, async addListener() {} },
    LocalNotifications: {
      async addListener(event, callback) { events.set(event, callback); },
      async getPending() { return { notifications: state.pending }; },
      async cancel() { state.pending = []; },
      async checkPermissions() { return { display: state.permission }; },
      async requestPermissions() { state.asked++; return { display: 'denied' }; },
      async schedule({ notifications }) { state.pending = notifications; }
    }
  };
  const shell = await import('data:text/javascript;base64,' + Buffer.from(bundle).toString('base64') + '#' + instance++);
  await shell.setupNativeShell({ openRecord: id => state.opened.push(id), remindersChanged:()=>{state.refreshed=(state.refreshed||0)+1;} });
  return { shell, state, events, values };
}
const due = new Date(Date.now()+86400000*2).toISOString().slice(0,10);
const records = ['first', 'second'].map(id => ({ id, title: id, due, result: 'pending' }));
const android = await device('android');
assert.equal(android.shell.noteMode, false);
const tap = android.events.get('localNotificationActionPerformed');
assert.equal(typeof tap, 'function', 'Android must handle a tapped review reminder');
tap({ notification: { extra: { recordId: 'first' } } });
tap({ notification: {} });
assert.deepEqual(android.state.opened, ['first']);
await android.shell.syncReviewReminders(records);
assert.equal(android.state.pending.length, 0, 'Android requires device opt-in');
android.shell.setReviewReminder('first', true);
await android.shell.syncReviewReminders(records);
assert.deepEqual(android.state.pending.map(n => n.extra.recordId), ['first']);
await android.shell.syncReviewReminders([{ ...records[0], result: 'good' }]);
assert.equal(android.state.pending.length, 0, 'Completing a review cancels its reminder');
await android.shell.syncReviewReminders(records);
android.shell.setReviewReminder('first', false);
await android.shell.syncReviewReminders([]);
assert.equal(android.state.pending.length, 0, 'Deletion cancels local reservations');
assert.equal(android.values.size, 0);
android.shell.setReviewReminder('second', true);
android.state.permission = 'prompt';
await android.shell.syncReviewReminders(records);
assert.equal(android.state.asked, 1);
assert.equal(android.state.pending.length, 0, 'Permission denial must not create reminders');
const other = await device('android');
await other.shell.syncReviewReminders(records);
assert.equal(other.state.pending.length, 0, 'Another device must not inherit notification opt-in');
const ios = await device('ios');
assert.equal(ios.shell.noteMode, true);
await ios.shell.syncReviewReminders(records);
assert.equal(ios.state.pending.length, 2, 'Note app retains its automatic review reminders');
console.log('native review reminder tests passed');

const deletingDevice = await device('android');
deletingDevice.values.set('unrelated-preference','keep');
deletingDevice.shell.setReviewReminder('first',true);
deletingDevice.shell.setReviewReminder('second',true);
await deletingDevice.shell.syncReviewReminders(records);
assert.equal(deletingDevice.state.pending.length,2);
await deletingDevice.shell.clearReviewReminders();
assert.equal(deletingDevice.state.pending.length,0);
assert.deepEqual([...deletingDevice.values],[['unrelated-preference','keep']]);

const resume = await device('android');
resume.shell.setReviewReminder('first',true);
resume.state.permission='denied';
await resume.shell.syncReviewReminders(records);
assert.equal(resume.state.pending.length,0);
resume.state.permission='granted';
await resume.events.get('appStateChange')({isActive:false});
assert.equal(resume.state.pending.length,0);
await resume.events.get('appStateChange')({isActive:true});
assert.deepEqual(resume.state.pending.map(n=>n.extra.recordId),['first']);
assert.equal(resume.state.refreshed,1);
assert.equal(resume.state.pending[0].isExactNotification,false,'review reminders must not open exact-alarm special access settings');
resume.state.permission='prompt';
await resume.events.get('appStateChange')({isActive:true});
assert.equal(resume.state.asked,0,'foreground return cannot prompt for notification permission');
assert.equal(resume.state.pending.length,0);
resume.state.permission='granted';resume.shell.setReviewReminder('first',false);
await resume.events.get('appStateChange')({isActive:true});
assert.equal(resume.state.pending.length,0,'foreground does not turn device opt-in back on');
await resume.shell.clearReviewReminders();
await resume.events.get('appStateChange')({isActive:true});
assert.equal(resume.state.pending.length,0,'deleted device reminders cannot return on resume');
