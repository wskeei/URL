const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backgroundPath = path.join(__dirname, '..', 'src', 'scripts', 'background.js');
const source = fs.readFileSync(backgroundPath, 'utf8');

test('background listens history-state navigation for SPA video transitions', () => {
  const hasHistoryListener = /chrome\.webNavigation\.onHistoryStateUpdated\.addListener\(/.test(source);
  assert.equal(hasHistoryListener, true, 'Expected onHistoryStateUpdated listener for SPA navigation');
});

test('history-state path can trigger bilibili whitelist re-check', () => {
  const hasHistoryRecheck = /handleMainFrameNavigation\(details,\s*'history-state'\)/.test(source);
  assert.equal(hasHistoryRecheck, true, 'Expected SPA history-state handler to re-check bilibili video whitelist');
});
