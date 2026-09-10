import assets from './generated-assets.js';
const reply=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...extra}});
export default {async fetch(request,env){const url=new URL(request.url);if(!url.pathname.startsWith('/api/')){if(env.ASSETS)return env.ASSETS.fetch(request);const a=assets[url.pathname==='/'?'/index.html':url.pathname];if(!a)return new Response('Not found',{status:404});return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(a.body),c=>c.charCodeAt(0)),{headers:{'Content-Type':a.type,'Cache-Control':url.pathname.startsWith('/assets/')?'public, max-age=86400':'no-cache','X-Content-Type-Options':'nosniff'}});}
 if(url.pathname!='/api/journal')return reply({error:'없는 경로입니다.'},404);
 if(!['GET','PUT','DELETE'].includes(request.method))return reply({error:'허용되지 않은 요청입니다.'},405);
 if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return reply({error:'이 사이트에서 다시 시도해 주세요.'},403);
 let token=request.headers.get('Cookie')?.match(/(?:^|;\s*)dalbit_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 const fresh=!token;if(!token)token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
 const cookie=`dalbit_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${url.protocol==='https:'?'; Secure':''}`;
 const headers=fresh?{'Set-Cookie':cookie}:{};
 try{
 if(request.method==='GET'){const row=await env.DB.prepare('SELECT payload,revision FROM journals WHERE id=?').bind(id).first();return reply({data:row?JSON.parse(row.payload):null,revision:row?.revision||0},200,headers);}
 if(request.method==='DELETE'){await env.DB.prepare('DELETE FROM journals WHERE id=?').bind(id).run();return reply({ok:true},200,{'Set-Cookie':`dalbit_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${url.protocol==='https:'?'; Secure':''}`});}
 if(Number(request.headers.get('Content-Length')||0)>1000000)return reply({error:'저장 용량을 초과했어요. 기록을 내보낸 뒤 정리해 주세요.'},413);
 const raw=await request.text();if(new TextEncoder().encode(raw).length>1000000)return reply({error:'저장 용량을 초과했어요.'},413);
 let body;try{body=JSON.parse(raw);}catch{return reply({error:'저장할 내용을 확인해 주세요.'},400);}
 const {data,revision}=body;if(!data||typeof data!=='object'||!Number.isInteger(revision)||revision<0||!Array.isArray(data.records)||!Array.isArray(data.conversations))return reply({error:'데이터 형식이 올바르지 않아요.'},400);
 const payload=JSON.stringify(data),now=new Date().toISOString();let result;
 if(revision===0)result=await env.DB.prepare('INSERT INTO journals (id,payload,revision,updated_at) VALUES (?,?,1,?) ON CONFLICT(id) DO NOTHING').bind(id,payload,now).run();
 else result=await env.DB.prepare('UPDATE journals SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(payload,now,id,revision).run();
 if(!result.meta.changes)return reply({error:'다른 탭에서 기록이 변경됐어요. 먼저 내보내기로 현재 내용을 보관한 뒤 새로고침해 주세요.'},409);
 return reply({ok:true,revision:revision+1},200,headers);
 }catch(error){console.error('Journal request failed',error?.message);return reply({error:'저장소에 연결하지 못했어요. 입력 내용은 현재 화면에 유지됩니다. 잠시 후 다시 시도해 주세요.'},503);}
}};
