(function(global) {
  'use strict';

  function asString(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  function isProbablyUid(value) {
    return /^\d+$/.test(asString(value).trim());
  }

  function normalizeBiliName(name) {
    const raw = asString(name);
    if (!raw) {
      return '';
    }

    let normalized = raw;
    try {
      normalized = normalized.normalize('NFKC');
    } catch (error) {
      // Older runtimes may not support Unicode normalization.
    }

    return normalized.trim().toLowerCase().replace(/\s+/g, '');
  }

  function normalizeWhitelistEntry(entry) {
    if (typeof entry === 'string') {
      const value = entry.trim();
      if (!value) {
        return null;
      }
      if (isProbablyUid(value)) {
        return { uid: value, name: '', note: '' };
      }
      return { uid: '', name: value, note: '' };
    }

    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const rawUid = asString(entry.uid).trim();
    const rawName = asString(entry.name).trim();
    const note = asString(entry.note).trim();
    const uid = isProbablyUid(rawUid) ? rawUid : '';
    const name = rawName;

    if (!uid && !name) {
      return null;
    }

    return {
      uid: uid,
      name: name,
      note: note
    };
  }

  function normalizeBiliWhitelist(list) {
    if (!Array.isArray(list)) {
      return [];
    }

    return list
      .map(normalizeWhitelistEntry)
      .filter(Boolean);
  }

  function extractBiliVideoId(url) {
    const rawUrl = asString(url);
    if (!rawUrl) {
      return null;
    }

    const bvidMatch = rawUrl.match(/\/video\/(BV[0-9A-Za-z]+)/i);
    if (bvidMatch && bvidMatch[1]) {
      return {
        type: 'bvid',
        id: bvidMatch[1]
      };
    }

    const aidMatch = rawUrl.match(/\/video\/av(\d+)/i);
    if (aidMatch && aidMatch[1]) {
      return {
        type: 'aid',
        id: aidMatch[1]
      };
    }

    return null;
  }

  function isUploaderWhitelisted(whitelist, uploader) {
    const entries = normalizeBiliWhitelist(whitelist);
    const uploaderUid = isProbablyUid(uploader && uploader.uid) ? asString(uploader.uid).trim() : '';
    const uploaderNameNormalized = normalizeBiliName(uploader && uploader.name);

    return entries.some((entry) => {
      if (entry.uid && uploaderUid && entry.uid === uploaderUid) {
        return true;
      }

      if (entry.name && uploaderNameNormalized) {
        return normalizeBiliName(entry.name) === uploaderNameNormalized;
      }

      return false;
    });
  }

  function createWhitelistEntry(inputValue, noteValue) {
    const input = asString(inputValue).trim();
    const note = asString(noteValue).trim();

    if (!input) {
      return null;
    }

    if (isProbablyUid(input)) {
      return {
        uid: input,
        name: '',
        note: note
      };
    }

    return {
      uid: '',
      name: input,
      note: note
    };
  }

  function findDuplicateEntry(whitelist, candidateEntry) {
    const entries = normalizeBiliWhitelist(whitelist);
    const candidate = normalizeWhitelistEntry(candidateEntry);

    if (!candidate) {
      return null;
    }

    if (candidate.uid && entries.some((entry) => entry.uid === candidate.uid)) {
      return 'uid';
    }

    if (candidate.name) {
      const candidateNameNormalized = normalizeBiliName(candidate.name);
      const hasSameName = entries.some((entry) => (
        entry.name && normalizeBiliName(entry.name) === candidateNameNormalized
      ));
      if (hasSameName) {
        return 'name';
      }
    }

    return null;
  }

  const api = {
    isProbablyUid: isProbablyUid,
    normalizeBiliName: normalizeBiliName,
    normalizeBiliWhitelist: normalizeBiliWhitelist,
    extractBiliVideoId: extractBiliVideoId,
    isUploaderWhitelisted: isUploaderWhitelisted,
    createWhitelistEntry: createWhitelistEntry,
    findDuplicateEntry: findDuplicateEntry
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.BiliWhitelistUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
