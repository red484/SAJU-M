import {mkdir,copyFile,cp,readFile,rm,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
await rm('dist',{recursive:true,force:true});await mkdir('dist/client/assets',{recursive:true});await mkdir('dist/server',{recursive:true});
// splitting keeps the 만세력 tables out of the entry chunk; app.js stays the
// entry name so index.html's /app.js is unchanged. outfile and splitting are
// mutually exclusive, hence outdir.
// engine.js is its own entry so it keeps a stable /engine.js URL: a dynamic
// import that fails is cached against its specifier forever, so the retry has
// to request a fresh one (?r=N), which only works with a URL we control.
// splitting still hoists luxon and the lookup tables into a shared chunk.
await build({entryPoints:['src/client/app.js','src/client/engine.js'],bundle:true,minify:true,format:'esm',splitting:true,outdir:'dist/client',chunkNames:'chunk-[hash]',target:['es2022']});
await copyFile('THIRD_PARTY_NOTICES.txt','dist/client/THIRD_PARTY_NOTICES.txt');
await writeFile('dist/client/app.css',(await readFile('src/client/styles/app.css','utf8'))+'\n'+(await readFile('src/client/styles/design.css','utf8')));await copyFile('index.html','dist/client/index.html');
for(const name of ['splash','mark','mentorAvatar','mentorHeader','todayRest','todayTalk','todayDeal','todayDuty','todayStart','hanji','compassCore','branchPine','element-wood','element-fire','element-earth','element-metal',...['wood','fire','earth','metal'].flatMap(e=>[0,1,3].map(n=>`element-${e}-${n}`))])await copyFile(`assets/${name}.webp`,`dist/client/assets/${name}.webp`);
await copyFile('assets/ink-waterfall.png','dist/client/assets/ink-waterfall.png');
await copyFile('assets/chat-mountains.png','dist/client/assets/chat-mountains.png');
await copyFile('assets/chat-crane.png','dist/client/assets/chat-crane.png');
await copyFile('assets/element-plate.png','dist/client/assets/element-plate.png');
// 마루 부리는 직접 호스팅합니다. 구글 폰트를 쓰지 않으므로 외부 요청이 없습니다.
await mkdir('dist/client/assets/fonts',{recursive:true});
for(const w of ['Regular','SemiBold','Bold'])await copyFile(`assets/fonts/MaruBuri-${w}.woff2`,`dist/client/assets/fonts/MaruBuri-${w}.woff2`);
for(const name of ['branchPlum','branchMaple','scenery'])await copyFile(`assets/${name}.webp`,`dist/client/assets/${name}.webp`);
console.log('Client assets built successfully.');
