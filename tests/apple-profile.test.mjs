import assert from 'node:assert/strict';
import { appleDisplayName } from '../src/server/apple-profile.mjs';
assert.equal(appleDisplayName(JSON.stringify({name:{firstName:'주연',lastName:'문'}})), '주연 문');
assert.equal(appleDisplayName(null), null);
assert.equal(appleDisplayName('{'), null);
assert.equal(appleDisplayName('{"name":{"firstName":123}}'), null);
assert.equal(appleDisplayName('{"name":{"firstName":"  A\\u0000 "}}'), 'A');
assert.equal(appleDisplayName(JSON.stringify({name:{firstName:'a'.repeat(200)}})).length, 100);
console.log('PASS: Apple first-login display name, absent repeat-login name, invalid data and length limit.');
