import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('Toss AI notice is not a nested layout sidebar', () => {
  const source = readFileSync(new URL('../src/client/design.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf("  if (appsInToss &&"), source.indexOf("  if (page === 'result')"));
  let inserted;
  const host = {querySelector: selector => selector === '.mentor' ? {
    insertAdjacentElement: (_, node) => { inserted = node; }
  } : null};
  vm.runInNewContext(block, {
    appsInToss: true, page: 'chat',
    document: {
      querySelector: () => host,
      createElement: tagName => ({tagName, setAttribute(name, value) {this[name] = value;}})
    }
  });
  assert.equal(inserted.tagName, 'div');
  assert.equal(inserted.role, 'note');
  assert.equal(inserted.className, 'ai-disclosure');
});
