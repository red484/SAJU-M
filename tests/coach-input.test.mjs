import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { findPurchaseFollowUp } from '../src/client/purchase-follow-up.js';
const source=readFileSync(new URL('../src/client/app.js',import.meta.url),'utf8');
const draw=source.slice(source.indexOf('function drawCoachQuota(){'),source.indexOf('async function coachAvailable(){'));
for(const platform of ['android','ios']) {
 for(const state of [{login:true,quota:null},{login:false,quota:null},{login:false,quota:{remaining:0}},{login:false,quota:{remaining:1}},{login:false,quota:{remaining:5}}]) {
  test(`${platform}: draft remains editable with ${JSON.stringify(state)}`,()=>{
   const input={disabled:true,value:'작성 중인 고민'},send={};
   const form={querySelector:s=>s==='textarea'?input:send,before(){}};
   const context={document:{querySelector:s=>s==='#chat-form'?form:null,createElement:()=>({setAttribute(){},append(){}})},installSubscription(){},consultationPreview(){},purchaseFollowUp:()=>null,findPurchaseFollowUp,page:'chat',authUser:{},openModal(){},notice(){},nav(){},nativeApp:true,chatDraft:"",data:{records:[]},noteMode:false, storeBillingAvailable:()=>false, installStoreBilling(){},isAppsInToss:()=>false,coachLoginRequired:state.login,coachQuota:state.quota,quotaText:()=>'',ct:()=>({pending:false})};
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

test('a failed initial journal load allows login, while unsaved loaded records stay protected', async()=>{
 const start=source.indexOf('beforeSignIn:async()=>');
 const callback=source.slice(start+'beforeSignIn:'.length,source.indexOf('}, signedIn:',start)+1);
 const invoke=loaded=>vm.runInNewContext('('+callback+')()', {loaded,saveState:'error',saveQueue:Promise.resolve()});
 await invoke(false);
 await assert.rejects(invoke(true),/파일로 보관/);
});

test('consultation payload omits profile identity fields without changing the local profile or calculated flow',()=>{
 const start=source.indexOf('const chartFor=c=>');
 const end=source.indexOf('\n\n',start);
 const profile=Object.freeze({name:'PRIVATE_LOCAL_NAME',gender:'female',birth:'PRIVATE_LOCAL_BIRTH',topics:['진로']});
 const context={p:()=>profile,result:{pillars:[{gz:'甲子'}],day:0,element:0,strong:[0],weak:[]},SK:['갑'],ELEMENTS:['목'],
   E:{dayName:()=>({name:'기준',label:'갑자'}),flow:()=>[{key:'year',p:{gz:'丙午'},god:'비견',stage:'건록'}]},
   today:()=> '2026-11-05',data:{conversations:[]},recordsFor:()=>[]};
 context.noteMode=false;
 vm.runInNewContext(source.slice(start,end)+';globalThis.makeChart=chartFor;',context);
 const chart=context.makeChart({historyPreferences:{conversations:false},supportMode:'compare',messages:[{role:'user'}]});
 assert.ok(!Object.hasOwn(chart,'name'));assert.ok(!Object.hasOwn(chart,'gender'));assert.ok(!Object.hasOwn(chart,'birth'));
 assert.equal(chart.periodFlow[0].pillar,'丙午');assert.equal(chart.supportMode,'compare');
 assert.equal(profile.name,'PRIVATE_LOCAL_NAME');assert.equal(profile.gender,'female');
});
