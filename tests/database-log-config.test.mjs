import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const image='sha256:preserved-image';
const config={name:'saju-db',services:{'saju-db':{container_name:'saju-db',image,volumes:[{type:'volume',source:'data',target:'/var/lib/postgresql/data'}],logging:{driver:'syslog',options:{'syslog-address':'unixgram:///var/spool/rsyslog/saju.sock','syslog-format':'rfc5424micro',tag:'saju-db','cache-disabled':'true'}}}},volumes:{data:{name:'preserved-volume'}}};
function check(value){return spawnSync('python3',['deploy/logging/validate-database-logs.py','saju-db','preserved-volume',image],{input:JSON.stringify(value),encoding:'utf8'});}
test('database logging overlay preserves image and persistent volume and rejects unsafe changes',()=>{
  assert.equal(check(config).status,0);
  for(const change of [
    c=>c.name='other',
    c=>c.services.other={},
    c=>c.services['saju-db'].image='new-image',
    c=>c.volumes.data.name='wrong-volume',
    c=>c.services['saju-db'].volumes[0].type='bind',
    c=>c.services['saju-db'].logging.options['cache-disabled']='false'
  ]){
    const changed=structuredClone(config);change(changed);assert.notEqual(check(changed).status,0);
  }
});

test('host log configurator edits only the dedicated service and is idempotent',()=>{
  const apply=input=>spawnSync('python3',['deploy/logging/configure-host-nginx.py'],{input,encoding:'utf8'});
  const fixture='server {\n server_name saju.ashwoodfriends.com;\n}\nserver {\n server_name saju.ashwoodfriends.com;\n}\n';
  const out=apply(fixture);
  assert.equal(out.status,0);
  assert.equal(out.stdout.match(/host-access.log/g).length,2);
  assert.equal(apply(out.stdout).stdout,out.stdout);
  assert.notEqual(apply(out.stdout.replace('server {','server {\n access_log /var/log/shared.log;')).status,0);
  assert.notEqual(apply(fixture.replaceAll('saju.ashwoodfriends.com','other.example')).status,0);
  assert.notEqual(apply(fixture.replace('server_name saju','access_log /var/log/custom.log;\n server_name saju')).status,0);
  assert.notEqual(apply(fixture.replace('server_name saju.ashwoodfriends.com;','server_name saju.ashwoodfriends.com other.example;')).status,0);
});
