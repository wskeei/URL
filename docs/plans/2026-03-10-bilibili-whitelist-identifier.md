# Bilibili Whitelist Identifier Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace fragile Bilibili whitelist detection with robust uploader identification and support name-based whitelist entries.

**Architecture:** Add shared Bilibili whitelist utility functions for normalization and matching, use Bilibili video API in background for primary uploader detection, and keep content-script message as fallback. Update popup whitelist UI/data model to allow name or UID entries while maintaining backward compatibility.

**Tech Stack:** Chrome Extension MV3, vanilla JavaScript, Node.js built-in test runner (`node --test`)

---

### Task 1: Add failing tests for whitelist identity logic

**Files:**
- Create: `tests/bili_whitelist_utils.test.js`

**Step 1: Write failing tests**
- Add tests for:
  - video ID extraction from Bilibili URL (`BV`, `av`)
  - whitelist normalization from legacy string/object entries
  - name normalization (trim/full-width space/case)
  - uploader matching by UID and by normalized name
  - entry creation from user input (name vs UID)

**Step 2: Run test to verify it fails**
Run: `node --test tests/bili_whitelist_utils.test.js`
Expected: FAIL because utility module does not exist yet.

### Task 2: Implement shared whitelist utilities

**Files:**
- Create: `src/scripts/bili_whitelist_utils.js`
- Test: `tests/bili_whitelist_utils.test.js`

**Step 1: Write minimal implementation**
- Implement utilities with browser-global + Node export:
  - `extractBiliVideoId(url)`
  - `normalizeBiliName(name)`
  - `normalizeBiliWhitelist(list)`
  - `isUploaderWhitelisted(whitelist, uploader)`
  - `createWhitelistEntry(input, note)`
  - `findDuplicateEntry(whitelist, entry)`

**Step 2: Run tests**
Run: `node --test tests/bili_whitelist_utils.test.js`
Expected: PASS.

### Task 3: Integrate robust detection in background script

**Files:**
- Modify: `src/scripts/background.js`
- Modify: `manifest.json`

**Step 1: Wire utilities**
- Load `bili_whitelist_utils.js` from background service worker.

**Step 2: Add API-based uploader detection**
- Add Bilibili API fetch (`x/web-interface/view`) using `bvid/aid` from URL.
- On blocked Bilibili video page, verify uploader by API first.
- Fallback to content-script result when API fails.

**Step 3: Update whitelist check logic**
- Replace UID-only checks with UID-or-name matching helper.
- Keep compatibility for legacy `biliUidWhitelist` entries.

**Step 4: Update permissions**
- Add `host_permissions` for `*://api.bilibili.com/*`.

### Task 4: Update content script and popup whitelist UX

**Files:**
- Modify: `src/scripts/content_script.js`
- Modify: `src/pages/popup.html`
- Modify: `src/scripts/popup.js`

**Step 1: Content script message upgrade**
- Send uploader info message (`uid` + `name`) when possible.
- Keep old behavior compatible with fallback message type.

**Step 2: Popup UX/data update**
- Keep current input control but allow "UP主名称或UID".
- Store entries as `{ uid, name, note }`.
- Render name-first list display with UID fallback.
- Duplicate detection for UID/name collisions.

### Task 5: Verify end-to-end behavior

**Files:**
- Test: `tests/bili_whitelist_utils.test.js`

**Step 1: Run automated verification**
Run: `node --test tests/bili_whitelist_utils.test.js`
Expected: PASS.

**Step 2: Sanity check extension files**
Run: `git -C /Users/zeiy/Project/URL diff -- manifest.json src/scripts/background.js src/scripts/content_script.js src/pages/popup.html src/scripts/popup.js src/scripts/bili_whitelist_utils.js tests/bili_whitelist_utils.test.js`
Expected: Only intended changes.
