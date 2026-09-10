import {mkdir,copyFile,cp,readFile,rm,writeFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
await rm('dist',{recursive:true,force:true});await mkdir('dist/client/assets',{recursive:true});await mkdir('dist/server',{recursive:true});
await build({entryPoints:['src/app.js'],bundle:true,minify:true,format:'esm',outfile:'dist/client/app.js',target:['es2022']});
await copyFile('THIRD_PARTY_NOTICES.txt','dist/client/THIRD_PARTY_NOTICES.txt');
await copyFile('src/app.css','dist/client/app.css');await copyFile('index.html','dist/client/index.html');
for(const name of ['splash','mark','mentorAvatar','mentorHeader','todayRest'])await copyFile(`assets/${name}.webp`,`dist/client/assets/${name}.webp`);
// Same-origin asset fallback keeps the Worker portable when an ASSETS binding is absent.
const assets={};for(const f of ['index.html','app.js','app.css','THIRD_PARTY_NOTICES.txt',...(await readdir('dist/client/assets')).map(f=>'assets/'+f)]){const bytes=await readFile('dist/client/'+f);assets['/'+f]={body:bytes.toString('base64'),type:f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'text/javascript; charset=utf-8':f.endsWith('.css')?'text/css; charset=utf-8':f.endsWith('.txt')?'text/plain; charset=utf-8':'image/webp'};}
await writeFile('src/generated-assets.js','export default '+JSON.stringify(assets));
await build({entryPoints:['src/worker.js'],bundle:true,minify:true,format:'esm',outfile:'dist/server/index.js',target:'es2022'});
await mkdir('dist/.openai',{recursive:true});await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Client, Worker and local assets built successfully.');
