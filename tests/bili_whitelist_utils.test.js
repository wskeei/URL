const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractBiliVideoId,
  normalizeBiliName,
  normalizeBiliWhitelist,
  isUploaderWhitelisted,
  createWhitelistEntry,
  findDuplicateEntry
} = require('../src/scripts/bili_whitelist_utils.js');

test('extractBiliVideoId supports BV links', () => {
  const result = extractBiliVideoId('https://www.bilibili.com/video/BV1ab411c7mD/?spm_id_from=333.999.0.0');
  assert.deepEqual(result, { type: 'bvid', id: 'BV1ab411c7mD' });
});

test('extractBiliVideoId supports av links', () => {
  const result = extractBiliVideoId('https://www.bilibili.com/video/av170001');
  assert.deepEqual(result, { type: 'aid', id: '170001' });
});

test('normalizeBiliName trims spaces, folds case and width', () => {
  const result = normalizeBiliName('  ＡＢＣ　学堂  ');
  assert.equal(result, 'abc学堂');
});

test('normalizeBiliWhitelist upgrades legacy values', () => {
  const whitelist = normalizeBiliWhitelist(['123', { uid: '456', note: 'old' }, { name: '  测试UP  ', note: 'name' }]);

  assert.deepEqual(whitelist, [
    { uid: '123', name: '', note: '' },
    { uid: '456', name: '', note: 'old' },
    { uid: '', name: '测试UP', note: 'name' }
  ]);
});

test('isUploaderWhitelisted matches by uid or normalized name', () => {
  const whitelist = normalizeBiliWhitelist([
    { uid: '12345', note: 'uid-only' },
    { name: '学习UP主', note: 'name-only' }
  ]);

  assert.equal(isUploaderWhitelisted(whitelist, { uid: '12345', name: '其他名字' }), true);
  assert.equal(isUploaderWhitelisted(whitelist, { uid: '999', name: '  学习UP主  ' }), true);
  assert.equal(isUploaderWhitelisted(whitelist, { uid: '999', name: '无关UP' }), false);
});

test('createWhitelistEntry supports name input and uid input', () => {
  assert.deepEqual(createWhitelistEntry('  学习UP主 ', '课程'), { uid: '', name: '学习UP主', note: '课程' });
  assert.deepEqual(createWhitelistEntry('123456', ''), { uid: '123456', name: '', note: '' });
});

test('findDuplicateEntry detects duplicate uid and duplicate name', () => {
  const whitelist = normalizeBiliWhitelist([
    { uid: '111' },
    { name: '高数老师' }
  ]);

  assert.equal(findDuplicateEntry(whitelist, { uid: '111', name: '', note: '' }), 'uid');
  assert.equal(findDuplicateEntry(whitelist, { uid: '', name: '  高数老师 ', note: '' }), 'name');
  assert.equal(findDuplicateEntry(whitelist, { uid: '222', name: '英语老师', note: '' }), null);
});
