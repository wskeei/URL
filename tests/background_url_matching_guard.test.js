const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backgroundPath = path.join(__dirname, '..', 'src', 'scripts', 'background.js');
const source = fs.readFileSync(backgroundPath, 'utf8');

test('background general blocking uses URL matcher helper instead of raw includes', () => {
  const usesMatcherForBlocked = /doesUrlMatchRule\(url,\s*item\.url\)/.test(source);
  const usesMatcherForFocus = /doesUrlMatchRule\(url,\s*blockedUrl\)/.test(source);

  assert.equal(usesMatcherForBlocked, true, 'Expected blockedUrls check to use doesUrlMatchRule()');
  assert.equal(usesMatcherForFocus, true, 'Expected focus URLs check to use doesUrlMatchRule()');
});
