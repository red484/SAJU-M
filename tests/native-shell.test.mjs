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
  const state = { pending: [], permission: 'granted', asked: 0, opened: [], requests: [], remote: async () => ({ status: 503, body: {} }) };
  globalThis.fetch = async (url, options) => {
    state.requests.push({ url, options });
    const result = await state.remote();
    return { status: result.status, ok: result.status === 200, json: async () => result.body };
  };
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

// Server reads only reconcile native reservations, not the editable journal or drafts.
const remote = await device('android');
await remote.events.get('appStateChange')({isActive:true});
assert.equal(remote.state.requests.length,0,'do not read another journal before startup finishes');
remote.shell.setReviewReminder('first',true);
await remote.shell.syncReviewReminders(records);
const changedDue = new Date(Date.now()+86400000*4).toISOString().slice(0,10);
remote.state.remote=async()=>({status:200,body:{revision:2,data:{records:[{...records[0],due:changedDue},records[1]]}}});
await remote.events.get('appStateChange')({isActive:true});
assert.deepEqual(remote.state.pending.map(n=>n.extra.recordId),['first'],'server records do not enable another device opt-in');
assert.match(remote.state.pending[0].schedule.at.toISOString(),new RegExp(changedDue));
assert.equal(records[0].due,due,'a remote read cannot overwrite the open form model');
assert.match(await remote.shell.reviewReminderStatus({...records[0],due:'2000-01-01'}),/예약됐어요/,'OS reservation takes precedence over the stale form date');
assert.equal(remote.state.requests[0].url,'/api/journal');
assert.equal(remote.state.requests[0].options.credentials,'include');
assert.equal(remote.state.requests[0].options.method,undefined,'foreground journal access is read-only');
remote.state.remote=async()=>({status:200,body:{revision:3,data:{records:[{...records[0],result:'good'}]}}});
await remote.events.get('appStateChange')({isActive:true});
assert.equal(remote.state.pending.length,0,'review completed on another device cancels the reservation');
await remote.shell.syncReviewReminders(records);
remote.state.remote=async()=>({status:200,body:{revision:4,data:null}});
await remote.events.get('appStateChange')({isActive:true});
assert.equal(remote.state.pending.length,0,'remote journal deletion cancels the reservation');
await remote.shell.syncReviewReminders(records);
remote.state.remote=async()=>{throw Error('offline');};
await remote.events.get('appStateChange')({isActive:true});
assert.equal(remote.state.pending.length,1,'offline keeps the last known reservation');
remote.state.remote=async()=>({status:200,body:{}});
await remote.events.get('appStateChange')({isActive:true});
assert.equal(remote.state.pending.length,1,'an invalid response is not an empty journal');
remote.state.remote=async()=>({status:200,body:{revision:3,data:{records:[null]}}});
await remote.events.get('appStateChange')({isActive:true});
assert.equal(remote.state.pending.length,1,'invalid records cannot poison later foreground syncs');
remote.state.remote=async()=>({status:401,body:{}});
await remote.events.get('appStateChange')({isActive:true});
assert.equal(remote.state.pending.length,0,'expired account access cancels stale private reminders');
assert.equal(remote.shell.reviewReminderEnabled('first'),true,'permission to remind is still device-local');

// Resolve a deliberately slow GET after a newer local save/clear; it must not win.
let resolveRead, startedRead;
const reading = new Promise(resolve=>{startedRead=resolve;});
remote.state.remote=()=>new Promise(resolve=>{resolveRead=resolve;startedRead();});
const returning=remote.events.get('appStateChange')({isActive:true});
await reading;
await remote.shell.clearReviewReminders();
resolveRead({status:200,body:{revision:2,data:{records}}});
await returning;
assert.equal(remote.state.pending.length,0,'slow foreground reads cannot restore cleared reminders');
remote.shell.setReviewReminder('first',true);
await remote.shell.syncReviewReminders(records);
const saving=new Promise(resolve=>{startedRead=resolve;});
const returningAgain=remote.events.get('appStateChange')({isActive:true});
await saving;
await remote.shell.syncReviewReminders([{...records[0],due:changedDue}]);
resolveRead({status:200,body:{revision:2,data:{records}}});
await returningAgain;
assert.match(remote.state.pending[0].schedule.at.toISOString(),new RegExp(changedDue),'a newer local save wins over a slow remote read');
console.log('foreground remote reminder reconciliation tests passed');

const remoteNote = await device('ios');
await remoteNote.shell.syncReviewReminders(records);
remoteNote.state.remote=async()=>({status:200,body:{revision:2,data:{records:[{...records[0],due:changedDue}]}}});
await remoteNote.events.get('appStateChange')({isActive:true});
assert.equal(remoteNote.state.requests[0].url,'/api/journal?view=note','background note refresh must not read the full web journal');
assert.equal(remoteNote.state.pending.length,1,'note app also follows remote deletion without requiring Android opt-in');
assert.match(remoteNote.state.pending[0].schedule.at.toISOString(),new RegExp(changedDue));

const editing = await device('android');
editing.shell.setReviewReminder('first',true);
const editableRecords = records.map(record=>({...record}));
await editing.shell.syncReviewReminders(editableRecords);
editableRecords[0].due=changedDue;
editing.state.remote=async()=>{throw Error('offline');};
await editing.events.get('appStateChange')({isActive:true});
assert.match(editing.state.pending[0].schedule.at.toISOString(),new RegExp(due),'unsaved edits cannot replace the last synchronized reminder when offline');
