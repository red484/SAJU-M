import {mkdir,copyFile,cp,readFile,rm,writeFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
await rm('dist',{recursive:true,force:true});await mkdir('dist/client/assets',{recursive:true});await mkdir('dist/server',{recursive:true});
// splitting keeps the 만세력 tables out of the entry chunk; app.js stays the
// entry name so index.html's /app.js is unchanged. outfile and splitting are
// mutually exclusive, hence outdir.
// engine.js is its own entry so it keeps a stable /engine.js URL: a dynamic
// import that fails is cached against its specifier forever, so the retry has
// to request a fresh one (?r=N), which only works with a URL we control.
// splitting still hoists luxon and the lookup tables into a shared chunk.
await build({entryPoints:['src/app.js','src/engine.js'],bundle:true,minify:true,format:'esm',splitting:true,outdir:'dist/client',chunkNames:'chunk-[hash]',target:['es2022']});
await copyFile('THIRD_PARTY_NOTICES.txt','dist/client/THIRD_PARTY_NOTICES.txt');
await copyFile('src/app.css','dist/client/app.css');await copyFile('index.html','dist/client/index.html');
for(const name of ['splash','mark','mentorAvatar','mentorHeader','todayRest','todayTalk','todayDeal','todayDuty','todayStart','hanji','compassCore','branchPine'])await copyFile(`assets/${name}.webp`,`dist/client/assets/${name}.webp`);
// Same-origin asset fallback keeps the Worker portable when an ASSETS binding is absent.
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8','.webp':'image/webp'};
// Walk the whole tree so code-split chunks are picked up as they are emitted,
// instead of listing entry filenames by hand.
async function walk(dir,prefix=''){const out=[];for(const e of await readdir(dir,{withFileTypes:true}))out.push(...e.isDirectory()?await walk(`${dir}/${e.name}`,`${prefix}${e.name}/`):[prefix+e.name]);return out;}
const assets={};for(const f of (await walk('dist/client')).sort()){const bytes=await readFile('dist/client/'+f);const type=TYPES[f.slice(f.lastIndexOf('.'))];if(!type)throw new Error('unknown asset type for '+f);assets['/'+f]={body:bytes.toString('base64'),type};}
await writeFile('src/generated-assets.js','export default '+JSON.stringify(assets));
await build({entryPoints:['src/worker.js'],bundle:true,minify:true,format:'esm',outfile:'dist/server/index.js',target:'es2022'});
await mkdir('dist/.openai',{recursive:true});await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Client, Worker and local assets built successfully.');
