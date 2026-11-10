import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {ageEligibility} from '../src/shared/age-policy.mjs';
import {eligibleProfile} from '../src/server/profile-age.mjs';
import {ageToken,ageVerified,requiresAge} from '../src/server/age-gate.mjs';
import {createApiHandler} from '../src/server/api-handler.mjs';
assert.equal(ageEligibility('2012-11-05','2026-11-05'),true);
assert.equal(ageEligibility('2012-11-06','2026-11-05'),false);
for(const birth of ['2012-02-30','2028-01-01','1899-12-31','',null])assert.equal(ageEligibility(birth,'2026-11-05'),false);
assert.equal(ageEligibility('2012-02-29','2026-02-28'),false);
assert.equal(ageEligibility('2012-02-29','2026-03-01'),true);
assert.equal(eligibleProfile({birth:'2020-01-01',calendar:'solar'}),false);
assert.equal(eligibleProfile({birth:'2020-01-01',calendar:'lunar'}),false);
assert.equal(eligibleProfile({birth:'1990-01-01',calendar:'lunar'}),true);
assert.equal(eligibleProfile({birth:'2012-09-22',calendar:'lunar'},'2026-11-05'),true);
assert.equal(eligibleProfile({birth:'2012-09-23',calendar:'lunar'},'2026-11-05'),false);
const token=ageToken();
assert.equal(ageVerified({headers:{'x-ongi-age':token}}),true);
assert.equal(ageVerified({headers:{'x-ongi-age':token+'x'}}),false);
assert.equal(ageVerified({headers:{'x-ongi-age':token+'.extra'}}),false);
assert.equal(ageVerified({headers:{'x-ongi-age':ageToken(Date.now()-31*86400000)}}),false);
const req={headers:{cookie:'dalbit_delete_state=fake'}};
assert.equal(requiresAge(req,new URL('https://example.com/api/auth/callback/apple')),true);
assert.equal(requiresAge({method:'GET',headers:{}},new URL('https://example.com/api/auth/start?provider=google&intent=delete')),true);
assert.equal(requiresAge({method:'POST',headers:{}},new URL('https://example.com/api/auth/native/create')),true);
assert.equal(requiresAge({method:'POST',headers:{}},new URL('https://example.com/api/auth/native/complete')),true);
assert.equal(requiresAge({headers:{cookie:'dalbit_delete_auth=fake; dalbit_delete_state=x; dalbit_oauth_state=x'}},new URL('https://example.com/api/auth/callback/google')),true);
let writes=0,storedProfile=null;
const api=createApiHandler({journalRepository:{async get(){return {revision:0,data:storedProfile?{profile:storedProfile,records:[],conversations:[]}:null};},async put(){writes++;return {revision:1};},async delete(){}},authRepository:{async userFromToken(){return null;}}});
const server=createServer((req,res)=>void api(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const call=(path,body,token)=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{'X-Ongi-Age':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
try{
 for(const path of ['/api/journal','/api/auth/start?provider=google','/api/auth/guest','/api/auth/toss','/api/auth/password/register','/api/auth/password/login','/api/auth/callback/google','/api/coach','/api/epic','/api/toss-billing/grant']){
  const result=await call(path,path.includes('start')||path.includes('callback')||path==='/api/journal'?null:{});
  assert.equal(result.status,403,path);assert.equal((await result.json()).code,'AGE_CONFIRMATION_REQUIRED');
 }
 const denied=await call('/api/eligibility',{birth:'2020-01-01'});assert.equal(denied.status,403);assert.equal((await denied.json()).token,undefined);
 const accepted=await call('/api/eligibility',{birth:'1990-01-01'});assert.equal(accepted.status,200);const proof=await accepted.json();assert.ok(!JSON.stringify(proof).includes('1990'));
 assert.equal((await call('/api/journal',null,proof.token)).status,200);
 for(const birth of ['2020-01-01','not-a-date']){
  const result=await fetch(base+'/api/journal',{method:'PUT',headers:{'Content-Type':'application/json','X-Ongi-Age':proof.token},body:JSON.stringify({revision:0,data:{profile:{birth,calendar:'solar'},records:[],conversations:[]}})});assert.equal(result.status,403);
 }
 assert.equal(writes,0,'rejected profiles never reach persistence');
 storedProfile={birth:'2020-01-01',calendar:'solar'};assert.equal((await call('/api/journal',null,proof.token)).status,403,'old underage profiles cannot resume service');storedProfile=null;
 const deleted=await fetch(base+'/api/journal',{method:'DELETE'});assert.equal(deleted.status,200,'deletion stays available without age confirmation');
 const external=await fetch(base+'/api/eligibility',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({birth:'1990-01-01'})});assert.equal(external.status,403);
 console.log('age boundary, signed confirmation, API bypass and profile validation tests passed');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
