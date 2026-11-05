import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
const {outputFiles}=await build({entryPoints:['src/client/deleted-device-storage.js'],bundle:true,write:false,format:'esm',plugins:[{name:'native',setup(build){
 build.onResolve({filter:/native-shell\.js$/},args=>({path:args.path,namespace:'native'}));
 build.onLoad({filter:/.*/,namespace:'native'},()=>({contents:'export async function clearReviewReminders(){globalThis.cleared++;}'}));
}}]});
const storage=items=>{const values=new Map(items);return {values,get length(){return values.size;},key:i=>[...values.keys()][i],getItem:key=>values.get(key)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
globalThis.localStorage=storage([['dalbit-v2','private'],['dalbit-guest-mode','guest'],['ongi-product-metrics','yes'],['unrelated','keep']]);
globalThis.sessionStorage=storage([['ongi-concern-draft','private'],['ongi-concern-draft:conversation','private'],['ongi-age-token','keep'],['unrelated','keep']]);
globalThis.cleared=0;
const {clearDeletedDeviceStorage}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
await clearDeletedDeviceStorage();
assert.deepEqual([...localStorage.values],[['unrelated','keep']]);
assert.deepEqual([...sessionStorage.values],[['ongi-age-token','keep'],['unrelated','keep']]);
assert.equal(globalThis.cleared,1);
const app=readFileSync('src/client/app.js','utf8'),startup=app.slice(app.indexOf('async function startApp(){'),app.indexOf('\nstartApp();'));
assert.ok(startup.indexOf('await deletionResult()')<startup.indexOf('await confirmAge()'),'verified Apple deletion cleanup must precede the age screen');
assert.match(startup,/response.ok&&body.deleted/,'a query parameter alone must never trigger cleanup');
console.log('direct deletion cleanup and verified Apple return tests passed');

const {outputFiles:ui}=await build({entryPoints:['src/client/account-deletion.js'],bundle:true,write:false,format:'esm',plugins:[{name:'api',setup(build){
 build.onResolve({filter:/(api\/(auth|journal)\.js|deleted-device-storage\.js)$/},args=>({path:args.path,namespace:'api'}));
 build.onLoad({filter:/.*/,namespace:'api'},()=>({contents:'export const deletionResult=(...a)=>globalThis.deletion.deletionResult(...a),currentUser=(...a)=>globalThis.deletion.currentUser(...a),deleteAccount=(...a)=>globalThis.deletion.deleteAccount(...a),deleteJournal=(...a)=>globalThis.deletion.deleteJournal(...a),clearDeletedDeviceStorage=()=>globalThis.deletion.cleanup();'}));
}}]});
function element(){return {textContent:'',hidden:false,disabled:false,removed:false,remove(){this.removed=true;}};}
function form(){const nodes=new Map(['[role=alert]','[data-apple-deletion]','[data-apple-reauth]','[data-apple-manual]'].map(key=>[key,element()]));nodes.get('[data-apple-deletion]').hidden=true;return {...element(),valid:false,reportValidity(){return this.valid;},querySelector:key=>nodes.get(key),querySelectorAll:()=>[...nodes.values()],append(input){this.expected=input;},submit(){globalThis.submitted=this.action;globalThis.expectedUser=this.expected?.value;}};}
globalThis.document={querySelector:()=>null,createElement:()=>form(),body:{append(){}}};
const {mountDeletion,startDeletion}=await import('data:text/javascript;base64,'+Buffer.from(ui[0].text).toString('base64'));
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
const ok=body=>({response:{ok:true},body});
async function fixture(user=null){
 const state={calls:[],cleared:0};
 globalThis.deletion={currentUser:async()=>ok({user}),deleteAccount:async (manual,expected)=>{state.expected=expected;state.calls.push(['account',manual]);return ok({ok:true});},deleteJournal:async anonymousOnly=>{state.anonymousOnly=anonymousOnly;state.calls.push(['journal']);return ok({ok:true});},cleanup:async()=>{state.cleared++;}};
 const root={...element(),status:element(),append(form){this.form=form;},querySelector(){return this.status;}};
 await mountDeletion(root);return {root,state};
}
for(const user of [null,{id:'owner'}]){
 const {root,state}=await fixture(user);
 root.form.onsubmit({preventDefault(){}});await flush();assert.equal(state.calls.length,0,'explicit irreversible deletion checkbox is required');
 root.form.valid=true;root.form.onsubmit({preventDefault(){}});await flush();
 assert.deepEqual(state.calls,[user?['account',false]:['journal']]);assert.equal(state.cleared,1);assert.equal(root.form.removed,true);if(user)assert.equal(state.expected,user.id);else assert.equal(state.anonymousOnly,true);
}
{
 const {root,state}=await fixture({id:'owner'});globalThis.deletion.currentUser=async()=>ok({user:{id:'different'}});
 root.form.valid=true;root.form.onsubmit({preventDefault(){}});await flush();assert.equal(state.calls.length,0);assert.equal(state.cleared,0);assert.match(root.form.querySelector('[role=alert]').textContent,/바뀌었어요/);
}
{
 const {root,state}=await fixture();globalThis.deletion.deleteJournal=async()=>({response:{ok:false},body:{error:'인증 만료'}});
 root.form.valid=true;root.form.onsubmit({preventDefault(){}});await flush();assert.equal(state.cleared,0);assert.equal(root.form.removed,false);assert.match(root.form.querySelector('[role=alert]').textContent,/인증 만료/);
}
{
 const {root,state}=await fixture({id:'apple'});
 globalThis.deletion.deleteAccount=async manual=>{state.calls.push(['account',manual]);return manual?ok({ok:true}):{response:{ok:false},body:{code:'APPLE_REAUTH_REQUIRED',reauthorize:true}};};
 root.form.valid=true;root.form.onsubmit({preventDefault(){}});await flush();assert.equal(state.cleared,0);assert.equal(root.form.querySelector('[data-apple-deletion]').hidden,false);
 root.form.querySelector('[data-apple-manual]').onclick();await flush();assert.deepEqual(state.calls,[['account',false],['account',true]]);assert.equal(state.cleared,1);assert.match(root.status.textContent,/직접 해제/);
}
{
 const {root,state}=await fixture({id:'apple'});globalThis.submitted=null;
 root.form.querySelector('[data-apple-reauth]').onclick();assert.equal(globalThis.submitted,null);
 root.form.valid=true;root.form.querySelector('[data-apple-reauth]').onclick();assert.equal(globalThis.submitted,'/api/auth/start?provider=apple&intent=delete&returnTo='+encodeURIComponent('/account-deletion/?account=deleted'));assert.equal(state.cleared,0);assert.equal(globalThis.expectedUser,'apple');
}
{
 globalThis.deletion.currentUser=async()=>{throw Error('offline');};
 const root={...element(),status:element(),querySelector(){return this.status;},append(){assert.fail('no delete form after failed account check');}};
 await mountDeletion(root);assert.match(root.status.textContent,/확인하지 못했어요/);
}
console.log('direct deletion confirmation, actor changes, failures and Apple choice tests passed');

for(const verified of [false,true]){
 const {root,state}=await fixture();globalThis.location={href:'https://example.com/account-deletion/?account=deleted'};
 globalThis.deletion.deletionResult=async()=>ok({deleted:verified});
 await startDeletion(root);assert.equal(state.cleared,verified?1:0,'only a server-confirmed callback can clear local data');
 if(verified)assert.match(root.textContent,/삭제가 완료/);
}
