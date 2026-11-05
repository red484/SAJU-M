import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createApiHandler} from '../src/server/api-handler.mjs';
let journals=0,accounts=0,owned=true;
const handler=createApiHandler({journalRepository:{async sessionOwner(){return owned?'current-owner':null;},async delete(){journals++;}},authRepository:{async userFromToken(){return {id:'current-owner'};},async appleSubject(){return null;},async deleteAccount(){accounts++;}}});
const server=createServer((req,res)=>void handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const remove=(path,body)=>fetch(base+path,{method:'DELETE',headers:{'Content-Type':'application/json'},body:typeof body==='string'?body:body===undefined?undefined:JSON.stringify(body)});
try{
 for(const expectedUserId of ['previous-owner',null,123]){
  const response=await remove('/api/auth/account',{expectedUserId});assert.equal(response.status,409);assert.equal((await response.json()).code,'DELETION_TARGET_CHANGED');
 }
 assert.equal(accounts,0);
 assert.equal((await remove('/api/auth/account',{expectedUserId:'current-owner'})).status,200);assert.equal(accounts,1);
 assert.equal((await remove('/api/auth/account')).status,200,'existing app deletion remains compatible');
 const switched=await remove('/api/journal',{anonymousOnly:true});assert.equal(switched.status,409);assert.equal((await switched.json()).code,'DELETION_TARGET_CHANGED');assert.equal(journals,0);
 for(const body of ['{','x'.repeat(4097)]){const result=await remove('/api/journal',body);assert.ok([400,413].includes(result.status));assert.equal(journals,0);}
 owned=false;assert.equal((await remove('/api/journal',{anonymousOnly:true})).status,200);assert.equal(journals,1);
 assert.equal((await remove('/api/journal')).status,200,'legacy anonymous deletion remains compatible');
 console.log('server deletion target, anonymous-to-account switch and malformed confirmation tests passed');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}

const {deleteAccount}=await import('../src/client/api/auth.js');
const {deleteJournal}=await import('../src/client/api/journal.js');
const requests=[];globalThis.fetch=async(path,options)=>{requests.push({path,body:options.body?JSON.parse(options.body):null});return {ok:true,json:async()=>({ok:true})};};
await deleteAccount(false,'shown-owner');await deleteAccount(true,'shown-owner');await deleteJournal(true);await deleteJournal();
assert.deepEqual(requests.map(r=>r.body),[{expectedUserId:'shown-owner'},{manualAppleRevocation:true,expectedUserId:'shown-owner'},{anonymousOnly:true},null]);

const {PGlite}=await import('@electric-sql/pglite');
const {readdir,readFile}=await import('node:fs/promises');
const {PostgresJournalRepository}=await import('../src/server/repositories/postgres-journal-repository.mjs');
const {JournalTargetChangedError}=await import('../src/server/repositories/file-journal-repository.mjs');
const db=new PGlite();
try{
 for(const file of (await readdir(new URL('../server/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../server/migrations/'+file,import.meta.url),'utf8'));
 const query=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
 const pool={query,async connect(){return {query,release(){}};}};
 const repo=new PostgresJournalRepository(pool),id='a'.repeat(64),user='11111111-1111-4111-8111-111111111111';
 await query('INSERT INTO app_users (id) VALUES ($1)',[user]);
 await repo.put(id,{profile:null,records:[{id:'keep'}],conversations:[]},0);
 assert.equal(await repo.sessionOwner(id),null);
 // The HTTP precheck saw anonymous; account linkage changes before the deletion transaction.
 await query('UPDATE anonymous_sessions SET user_id=$2 WHERE id=$1',[id,user]);
 await query('UPDATE saju_journals SET user_id=$2 WHERE session_id=$1',[id,user]);
 await assert.rejects(repo.delete(id,{anonymousOnly:true}),JournalTargetChangedError);
 assert.equal((await repo.get(id)).data.records[0].id,'keep');
 assert.equal((await query("SELECT count(*)::int AS count FROM audit_logs WHERE event_type='journal.deleted'")).rows[0].count,0);
 await query('UPDATE anonymous_sessions SET user_id=NULL WHERE id=$1',[id]);await query('UPDATE saju_journals SET user_id=NULL WHERE session_id=$1',[id]);
 await repo.delete(id,{anonymousOnly:true});assert.equal((await repo.get(id)).data,null);
 console.log('transactional anonymous deletion rejects ownership changes and rolls back without deleting data');
}finally{await db.close();}
