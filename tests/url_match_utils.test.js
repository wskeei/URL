const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeBlockedRule,
  doesUrlMatchRule,
  canonicalizeHost
} = require('../src/scripts/url_match_utils.js');

test('canonicalizeHost maps bilibili chinese domain aliases', () => {
  assert.equal(canonicalizeHost('哔哩哔哩.com'), 'bilibili.com');
  assert.equal(canonicalizeHost('xn--2vra6db.com'), 'bilibili.com');
  assert.equal(canonicalizeHost('www.bilibili.com'), 'bilibili.com');
});

test('normalizeBlockedRule normalizes bilibili aliases to bilibili.com', () => {
  assert.equal(normalizeBlockedRule('哔哩哔哩.com'), 'bilibili.com');
  assert.equal(normalizeBlockedRule('https://www.bilibili.com/'), 'bilibili.com');
});

test('doesUrlMatchRule matches bilibili video url by chinese alias rule', () => {
  const videoUrl = 'https://www.bilibili.com/video/BV1ab411c7mD/';
  assert.equal(doesUrlMatchRule(videoUrl, '哔哩哔哩.com'), true);
  assert.equal(doesUrlMatchRule(videoUrl, 'xn--2vra6db.com'), true);
  assert.equal(doesUrlMatchRule(videoUrl, 'bilibili.com'), true);
});

test('doesUrlMatchRule returns false for unrelated domains', () => {
  const videoUrl = 'https://www.bilibili.com/video/BV1ab411c7mD/';
  assert.equal(doesUrlMatchRule(videoUrl, 'youtube.com'), false);
});
