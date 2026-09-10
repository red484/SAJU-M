import {mkdir,copyFile,cp,readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile('index.html','utf8');new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);new vm.Script(await readFile('upgrade.js','utf8'));
await mkdir('dist',{recursive:true});for(const file of ['index.html','upgrade.css','upgrade.js'])await copyFile(file,'dist/'+file);await cp('assets','dist/assets',{recursive:true});console.log('Static site validated and built.');
