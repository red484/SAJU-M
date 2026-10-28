import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/client/app.js',import.meta.url),'utf8');
const draw=source.slice(source.indexOf('function drawCoachQuota(){'),source.indexOf('async function coachAvailable(){'));
for(const platform of ['android','ios']) {
 for(const state of [{login:true,quota:null},{login:false,quota:null},{login:false,quota:{remaining:0}},{login:false,quota:{remaining:5}}]) {
  test(`${platform}: draft remains editable with ${JSON.stringify(state)}`,()=>{
   const input={disabled:true,value:'작성 중인 고민'},send={};
   const form={querySelector:s=>s==='textarea'?input:send,before(){}};
   const context={document:{querySelector:s=>s==='#chat-form'?form:null,createElement:()=>({setAttribute(){},append(){}})},installSubscription(){},page:'chat',authUser:{},openModal(){},notice(){},nav(){},nativeApp:true,noteMode:false,isAppsInToss:()=>false,coachLoginRequired:state.login,coachQuota:state.quota,quotaText:()=>'',ct:()=>({pending:false})};
   vm.runInNewContext(draw+';drawCoachQuota()',context);
   assert.equal(input.disabled,false);assert.equal(input.value,'작성 중인 고민');assert.equal(send.disabled,false);
  });
 }
}
test('password login refreshes allowance even when AI availability was cached',()=>{
 const signedIn=source.slice(source.indexOf('signedIn:async()=>'),source.indexOf('const uid='));
 assert.match(signedIn,/await refreshCoachQuota\(\)/);
 assert.doesNotMatch(signedIn,/await coachAvailable\(\)/);
});
test('blocked submission refreshes controls without destroying draft via render',()=>{
 const send=source.slice(source.indexOf('async function sendMessage(text)'),source.indexOf("text=text.trim()",source.indexOf('async function sendMessage(text)')));
 assert.doesNotMatch(send,/render\(\)/);
 assert.match(send,/coachQuota.remaining===0/);
});
