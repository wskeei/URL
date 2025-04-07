// content_script.js - Runs on www.bilibili.com/video/*

function getUploaderUid() {
  // Try finding the link to the uploader's space in common locations
  // Selector might need adjustment if Bilibili changes layout
  const spaceLinkSelectors = [
    '.up-info .name', // Common layout
    '.up-card-container .up-name', // Another possible layout
    'a[href*="//space.bilibili.com/"]' // General fallback for links containing the space URL
  ];

  for (const selector of spaceLinkSelectors) {
    const linkElement = document.querySelector(selector);
    if (linkElement && linkElement.href) {
      const match = linkElement.href.match(/space\.bilibili\.com\/(\d+)/);
      if (match && match[1]) {
        console.log('Bilibili Whitelist: Found UID', match[1]);
        return match[1];
      }
    }
  }

  // Fallback if specific selectors fail, check meta tags (less reliable)
  const metaOwner = document.querySelector('meta[itemprop="author"]');
  if (metaOwner && metaOwner.content) {
      // This might be the name, not UID - less ideal
      console.log('Bilibili Whitelist: Found potential author name from meta:', metaOwner.content);
      // Cannot reliably get UID from here in most cases.
  }

  console.log('Bilibili Whitelist: Could not find uploader UID on page.');
  return null;
}

// Send the UID back to the background script
// Use a small delay to ensure the page elements are likely loaded
setTimeout(() => {
  const uid = getUploaderUid();
  if (uid) {
    chrome.runtime.sendMessage({ type: 'BILIBILI_UID_FOUND', uid: uid })
      .catch(error => console.error('Bilibili Whitelist: Error sending UID message:', error));
  } else {
    // Optionally send a message indicating UID not found, so background knows
     chrome.runtime.sendMessage({ type: 'BILIBILI_UID_NOT_FOUND' })
       .catch(error => console.error('Bilibili Whitelist: Error sending UID_NOT_FOUND message:', error));
  }
}, 500); // 500ms delay, might need adjustment
