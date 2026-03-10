(function(global) {
  'use strict';

  const HOST_ALIASES = {
    '哔哩哔哩.com': 'bilibili.com',
    'www.哔哩哔哩.com': 'bilibili.com',
    'xn--2vra6db.com': 'bilibili.com',
    'www.xn--2vra6db.com': 'bilibili.com'
  };

  function asString(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  function canonicalizeHost(host) {
    let value = asString(host).trim().toLowerCase();
    if (!value) {
      return '';
    }

    if (HOST_ALIASES[value]) {
      return HOST_ALIASES[value];
    }

    if (value.startsWith('www.')) {
      value = value.slice(4);
    }

    if (HOST_ALIASES[value]) {
      return HOST_ALIASES[value];
    }

    return value;
  }

  function extractHost(input) {
    const raw = asString(input).trim();
    if (!raw) {
      return '';
    }

    const normalized = raw.includes('://') ? raw : `https://${raw}`;

    try {
      const url = new URL(normalized);
      return canonicalizeHost(url.hostname);
    } catch (error) {
      const hostCandidate = raw.replace(/^https?:\/\//i, '').split('/')[0];
      return canonicalizeHost(hostCandidate);
    }
  }

  function normalizeBlockedRule(rule) {
    const raw = asString(rule).trim();
    if (!raw) {
      return '';
    }

    const host = extractHost(raw);
    if (!host) {
      return raw.toLowerCase();
    }

    const pathPart = raw.includes('://')
      ? (() => {
          try {
            const u = new URL(raw);
            return u.pathname && u.pathname !== '/' ? u.pathname : '';
          } catch (error) {
            return '';
          }
        })()
      : (raw.includes('/') ? raw.slice(raw.indexOf('/')) : '');

    if (!pathPart || pathPart === '/') {
      return host;
    }

    return `${host}${pathPart}`.toLowerCase();
  }

  function doesUrlMatchRule(targetUrl, rule) {
    const url = asString(targetUrl).trim();
    const normalizedRule = normalizeBlockedRule(rule);

    if (!url || !normalizedRule) {
      return false;
    }

    const normalizedUrl = url.toLowerCase();
    if (normalizedUrl.includes(normalizedRule)) {
      return true;
    }

    const urlHost = extractHost(url);
    const ruleHost = extractHost(normalizedRule);

    if (urlHost && ruleHost) {
      if (urlHost === ruleHost || urlHost.endsWith(`.${ruleHost}`)) {
        return true;
      }
    }

    return false;
  }

  const api = {
    canonicalizeHost,
    normalizeBlockedRule,
    doesUrlMatchRule
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.UrlMatchUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
