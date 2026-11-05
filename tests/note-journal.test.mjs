import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {createApiHandler} from '../src/server/api-handler.mjs';
import {FileJournalRepository} from '../src/server/repositories/file-journal-repository.mjs';
import {PostgresJournalRepository} from '../src/server/repositories/postgres-journal-repository.mjs';
import {noteJournal,applyNoteRecords,validNoteRecords} from '../src/shared/note-journal.mjs';
import {AuthRepository} from '../src/server/repositories/auth-repository.mjs';
import {mergeJournal} from '../src/client/journal-merge.js';
const full={profile:{birth:'1990-01-01',name:'private-profile'},conversations:[{id:'chat',messages:[{text:'private-conversation'}]}],savedAnswers:[{id:'answer',text:'private-answer'}],custom:'keep-top-level',records:[{id:'r1',title:'나의 선택',date:'2026-11-05',due:'2026-11-12',result:'pending',expectation:'기준',nextAction:'행동',conversationId:'chat',advice:'private-advice',futureField:'keep-record'}]};
const projection=noteJournal(full);
const mine=structuredClone(projection),theirs=structuredClone(projection);mine.records[0].title='A';theirs.records[0].title='B';assert.equal(mergeJournal(projection,mine,theirs),null,'concurrent changes to the same note record must require resolution');
assert.equal(projection.profile,null);assert.deepEqual(projection.conversations,[]);assert.deepEqual(projection.savedAnswers,[]);
assert.ok(!JSON.stringify(projection).includes('private-'));assert.equal(projection.records[0].conversationId,'chat');
assert.equal(applyNoteRecords(full,[{...projection.records[0],title:'수정',advice:'overwrite'}]).records[0].advice,'private-advice');
for(const bad of [[{id:'x'},{id:'x'}],[null],[{id:'x',actual:{profile:'bad'}}]])assert.equal(validNoteRecords(bad),false);
async function exercise(repository,authRepository){
 const handler=createApiHandler({journalRepository:repository,authRepository:authRepository||{async userFromToken(){return null;}}});
 const server=createServer((req,res)=>void handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;let cookies=new Map(),webCookies;
 const request=async(path,method='GET',data)=>{
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')},...(data?{body:JSON.stringify(data)}:{})});
  for(const cookie of response.headers.getSetCookie()){const [name,value]=cookie.split(';')[0].split('=');cookies.set(name,value);}
  return {status:response.status,body:await response.json()};
 };
 try{
  assert.equal((await request('/api/eligibility','POST',{birth:'1990-01-01'})).status,200);
  assert.equal((await request('/api/journal?view=invalid')).status,400);
  let row=(await request('/api/journal?view=note')).body;assert.equal(row.data,null);
  assert.equal((await request('/api/journal','PUT',{data:full,revision:0})).status,200);
  if(authRepository){
   const password='note-test-only-password-123';
   const registered=await request('/api/auth/password/register','POST',{password,acknowledgeRecovery:true});assert.equal(registered.status,200);
   webCookies=new Map(cookies);cookies=new Map([['ongi_age',cookies.get('ongi_age')]]);
   assert.equal((await request('/api/auth/password/login','POST',{loginId:registered.body.loginId,password})).status,200);
  }
  const expectedCustom=(await request('/api/journal')).body.data.custom;
  row=(await request('/api/journal?view=note')).body;assert.equal(row.revision,1);assert.deepEqual(row.data,projection);
  const local=structuredClone(row.data);local.records[0].actual='돌아본 결과';local.records[0].result='good';local.records.push({id:'r2',title:'새 선택',result:'pending'});
  assert.equal((await request('/api/journal?view=note','PUT',{data:local,revision:1})).status,200);
  let web=(await request('/api/journal')).body;
  assert.deepEqual(web.data.profile,full.profile);assert.deepEqual(web.data.conversations,full.conversations);assert.deepEqual(web.data.savedAnswers,full.savedAnswers);assert.equal(web.data.custom,expectedCustom);assert.equal(web.data.records[0].advice,'private-advice');assert.equal(web.data.records[0].futureField,'keep-record');assert.equal(web.data.records[0].actual,'돌아본 결과');
  // Web edits hidden fields after the note client reads. A stale note write cannot overwrite them.
  const noteBefore=(await request('/api/journal?view=note')).body;
  web.data.records[0].advice='updated-private-advice';
  web.data.profile.name='new-private-profile';web.data.conversations[0].messages.push({text:'new-private-conversation'});
  const noteCookies=cookies;if(webCookies)cookies=webCookies;
  assert.equal((await request('/api/journal','PUT',{data:web.data,revision:web.revision})).status,200);
  cookies=noteCookies;
  local.records[1].title='노트의 수정';assert.equal((await request('/api/journal?view=note','PUT',{data:local,revision:noteBefore.revision})).status,409);
  const latest=(await request('/api/journal?view=note')).body;
  const merged=mergeJournal(noteBefore.data,local,latest.data);assert.ok(merged);
  assert.equal((await request('/api/journal?view=note','PUT',{data:merged,revision:latest.revision})).status,200);
  web=(await request('/api/journal')).body;assert.equal(web.data.profile.name,'new-private-profile');assert.equal(web.data.conversations[0].messages.length,2);assert.equal(web.data.records[1].title,'노트의 수정');assert.equal(web.data.records[0].advice,'updated-private-advice');
  // A note request cannot modify hidden fields, including a crafted profile payload.
  const injected={...latest.data,profile:{birth:'1995-01-01'}};
  assert.equal((await request('/api/journal?view=note','PUT',{data:injected,revision:web.revision})).status,400);
  const current=(await request('/api/journal?view=note')).body;
  current.data.records=current.data.records.filter(r=>r.id!=='r2');
  assert.equal((await request('/api/journal?view=note','PUT',{data:current.data,revision:current.revision})).status,200);
  web=(await request('/api/journal')).body;assert.equal(web.data.records.length,1);assert.equal(web.data.profile.name,'new-private-profile');
  assert.equal((await request('/api/journal?view=note','DELETE')).status,400,'scoped deletion cannot accidentally delete the whole account journal');
  assert.equal((await request('/api/journal')).body.data.records.length,1);
  assert.equal((await request('/api/journal','DELETE')).status,200,'full deletion remains an intentional whole-journal operation');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
const dir=await mkdtemp(join(tmpdir(),'note-journal-'));
try{await exercise(new FileJournalRepository(dir));}finally{await rm(dir,{recursive:true,force:true});}
const db=new PGlite();
try{
 for(const file of (await readdir(new URL('../server/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../server/migrations/'+file,import.meta.url),'utf8'));
 const query=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
 const pool={query,async connect(){return {query,release(){}};}};
 await exercise(new PostgresJournalRepository(pool),new AuthRepository(pool));
}finally{await db.close();}
console.log('note projection, field preservation, revision conflict, retry, record deletion and full deletion: file + PostgreSQL HTTP tests passed');

const {getJournal,putJournal}=await import('../src/client/api/journal.js');
const sent=[];globalThis.fetch=async(url,options)=>{sent.push({url,body:options.body});return {ok:true,json:async()=>({})};};
await getJournal(true);await putJournal(full,1,true);await getJournal();await putJournal(full,1);
assert.equal(sent[0].url,'/api/journal?view=note');assert.equal(sent[1].url,'/api/journal?view=note');
assert.ok(!sent[1].body.includes('private-'));assert.equal(JSON.parse(sent[1].body).data.records[0].advice,undefined);
assert.equal(sent[2].url,'/api/journal');assert.deepEqual(JSON.parse(sent[3].body).data,full);
console.log('client note requests strip hidden data before transmission; web requests remain unchanged');
