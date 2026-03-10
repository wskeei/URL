const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backgroundPath = path.join(__dirname, '..', 'src', 'scripts', 'background.js');
const source = fs.readFileSync(backgroundPath, 'utf8');

test('background defines checkFocusMode when it is called during initialization', () => {
  const hasCall = /\bcheckFocusMode\s*\(/.test(source);
  const hasDefinition = /function\s+checkFocusMode\s*\(/.test(source);

  assert.equal(hasCall, true, 'Expected background to call checkFocusMode()');
  assert.equal(hasDefinition, true, 'Expected background to define checkFocusMode()');
});

test('background guards checkFocusMode call with typeof check', () => {
  const hasGuardedCall = /typeof\s+checkFocusMode\s*===\s*['"]function['"]/.test(source);
  assert.equal(hasGuardedCall, true, 'Expected initialization call to guard missing checkFocusMode()');
});
