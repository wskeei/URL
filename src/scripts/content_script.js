// content_script.js - Runs on www.bilibili.com/video/*

function extractUidFromHref(href) {
  if (!href) {
    return '';
  }
  const match = String(href).match(/space\.bilibili\.com\/(\d+)/);
  return match && match[1] ? match[1] : '';
}

function pickNameFromElement(element) {
  if (!element) {
    return '';
  }
  const text = (element.textContent || '').trim();
  if (text) {
    return text;
  }
  const title = (element.getAttribute('title') || '').trim();
  return title;
}

function getUploaderInfo() {
  const selectors = [
    '.up-info .name',
    '.up-info--right .username',
    '.up-card-container .up-name',
    '.video-info-owner a[href*="space.bilibili.com"]',
    'a[href*="//space.bilibili.com/"]'
  ];

  let uid = '';
  let name = '';

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!element) {
      continue;
    }

    if (!uid) {
      uid = extractUidFromHref(element.getAttribute('href') || element.href || '');
    }

    if (!name) {
      name = pickNameFromElement(element);
    }

    if (uid && name) {
      break;
    }
  }

  if (!name) {
    const metaOwner = document.querySelector('meta[itemprop="author"]');
    if (metaOwner && metaOwner.content) {
      name = String(metaOwner.content).trim();
    }
  }

  if (!uid && !name) {
    return null;
  }

  return { uid, name };
}

setTimeout(() => {
  const uploader = getUploaderInfo();

  if (uploader) {
    chrome.runtime.sendMessage({
      type: 'BILIBILI_UPLOADER_FOUND',
      uid: uploader.uid,
      name: uploader.name
    }).catch((error) => {
      console.error('Bilibili Whitelist: Error sending uploader info:', error);
    });
    return;
  }

  chrome.runtime.sendMessage({ type: 'BILIBILI_UPLOADER_NOT_FOUND' })
    .catch((error) => {
      console.error('Bilibili Whitelist: Error sending uploader-not-found message:', error);
    });
}, 700);
