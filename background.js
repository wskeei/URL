let focusMode = {
  active: false,
  endTime: null,
  blockedUrls: []
};

// 记录访问开始时间的对象
let visitStartTimes = {};
// 存储临时访问权限 { url: expiryTimestamp }
let temporaryAccess = {};
// 存储当前挑战 { tabId: { challenge: string, url: string } }
let currentChallenges = {};

// 生成随机挑战字符串
function generateChallengeString(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_-+=[]{};:,.<>?';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 检查URL是否应该被阻止的函数
function shouldBlockUrl(url, callback) {
  // 检查是否有临时访问权限
  if (temporaryAccess[url] && Date.now() < temporaryAccess[url]) {
    callback(false); // Don't block
    return;
  }

  chrome.storage.sync.get(['blockedUrls', 'focusMode'], function(data) {
    const blockedUrls = data.blockedUrls || [];
    const focusModeData = data.focusMode || { active: false, urls: [], endTime: 0 };

    const isGenerallyBlocked = blockedUrls.some(item =>
      item.enabled && url.includes(item.url)
    );

    const isFocusBlocked = focusModeData.active &&
                           Date.now() < focusModeData.endTime &&
                           focusModeData.urls.some(blockedUrl => url.includes(blockedUrl));

    const shouldBlock = isGenerallyBlocked || isFocusBlocked;

    callback(shouldBlock); // Only pass whether to block or not
  });
}

// 阻止页面访问的函数 (Removed isFocusBlock parameter)
function blockPage(tabId) {
  // No need to pass original URL anymore as override is in popup
  const blockedPageUrl = chrome.runtime.getURL('blocked.html');
  chrome.tabs.update(tabId, { url: blockedPageUrl });
}


// 检查并处理URL
function checkAndBlockUrl(details) {
  const blockedPageBaseUrl = chrome.runtime.getURL('blocked.html');
  if (details.url.startsWith(blockedPageBaseUrl)) {
    return; // Don't block the blocked page itself
  }

  // Ignore non-main frame navigations
  if (details.frameId !== 0) {
    return;
  }

  shouldBlockUrl(details.url, (shouldBlock) => { // Removed isFocusBlock from callback
    if (shouldBlock) {
      // Record end time if tracking started
      if (visitStartTimes[details.tabId]) {
        const duration = (Date.now() - visitStartTimes[details.tabId]) / 1000; // seconds
        // Use the URL stored when tracking started, not the potentially blocked URL
        const visitedUrl = Object.keys(visitStartTimes).find(key => visitStartTimes[key] === visitStartTimes[details.tabId]);
        if (visitedUrl) {
             saveVisitStats(visitedUrl, duration); // Save stats for the actual visited URL
        }
        delete visitStartTimes[details.tabId];
      }
      blockPage(details.tabId, details.url, isFocusBlock); // Pass original URL and focus block status
    } else {
      // Record start time only if not already tracking for this tab
      // And only if it's not the blocked page
       if (!visitStartTimes[details.tabId] && !details.url.startsWith(blockedPageBaseUrl)) {
           // Store URL along with start time to handle redirects correctly
           visitStartTimes[details.tabId] = Date.now();
            // We need a way to associate the start time with the URL being visited *at that time*.
            // This logic remains complex. Let's stick to the current approach for now.
       }
    }
  });
}


// Listen for navigation events (main frame only)
chrome.webNavigation.onBeforeNavigate.addListener(checkAndBlockUrl, { url: [{ urlMatches: 'https?://*/*' }], types: ["main_frame"] });
// onCommitted might be better for capturing the final URL after redirects
chrome.webNavigation.onCommitted.addListener(checkAndBlockUrl, { url: [{ urlMatches: 'https?://*/*' }], types: ["main_frame"] });


// Listen for tab updates (e.g., user types URL directly)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check only when loading is complete and URL is present and not the blocked page
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
     const blockedPageBaseUrl = chrome.runtime.getURL('blocked.html');
     if (tab.url.startsWith(blockedPageBaseUrl)) {
         return; // Don't re-evaluate the blocked page
     }
    shouldBlockUrl(tab.url, (shouldBlock) => { // Removed isFocusBlock from callback
      if (shouldBlock) {
        blockPage(tabId); // Simplified blockPage call
      }
    });
  }
});

// 处理来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_FOCUS') {
    const endTime = Date.now() + message.duration * 60 * 1000;
    const focusMode = {
      active: true,
      urls: message.urls,
      endTime: endTime
    };
    chrome.storage.sync.set({ focusMode }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.type === 'GET_FOCUS_STATUS') {
    chrome.storage.sync.get(['focusMode'], (result) => {
      const focusMode = result.focusMode || { active: false, endTime: 0 };
      if (focusMode.active && Date.now() >= focusMode.endTime) {
        focusMode.active = false;
        chrome.storage.sync.set({ focusMode });
      }
      sendResponse({ focusMode });
    });
    return true;
  }

  if (message.type === 'ADD_FOCUS_URL') {
    chrome.storage.sync.get(['focusMode'], (result) => {
      const focusMode = result.focusMode || { active: false, urls: [] };
      if (focusMode.active && !focusMode.urls.includes(message.url)) {
        focusMode.urls.push(message.url);
        chrome.storage.sync.set({ focusMode }, () => {
          // 立即检查所有标签页
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
              if (tab.url && tab.url.includes(message.url)) {
                blockPage(tab.id);
              }
            });
          });
        });
      }
      sendResponse({ success: true });
    });
    return true;
  }

  // 处理主题变更消息
  if (message.type === 'THEME_CHANGED') {
    // 广播主题变更消息到所有打开的插件页面
    chrome.runtime.sendMessage({ 
      type: 'APPLY_THEME',
      theme: message.theme 
    }).catch(() => {
      // 忽略错误，因为可能没有其他页面在监听
    });
    return true; // Keep message channel open for async response
  }

  // 获取当前专注模式下限制的URL列表
  if (message.type === 'GET_FOCUS_BLOCKED_URLS') {
    chrome.storage.sync.get(['focusMode'], (result) => {
      const focusMode = result.focusMode || { active: false, urls: [] };
      if (focusMode.active && Date.now() < focusMode.endTime) {
        sendResponse({ urls: focusMode.urls });
      } else {
        sendResponse({ urls: [] }); // Return empty if not active
      }
    });
    return true; // Keep message channel open for async response
  }

  // 获取临时访问挑战 (Now called from popup, no sender.tab.id needed)
  if (message.type === 'GET_ACCESS_CHALLENGE') {
    const challenge = generateChallengeString();
    // Store challenge temporarily, associated with the URL it's for
    // We need a way to manage multiple concurrent challenges if the popup is opened multiple times.
    // Let's store challenges by URL for simplicity, overwriting previous ones for the same URL.
    currentChallenges[message.url] = challenge;
    sendResponse({ challenge: challenge });
    // Clean up challenge after a short time if not used? Maybe not necessary.
    return true; // Keep message channel open
  }

  // 验证临时访问代码 (Now called from popup)
  if (message.type === 'VERIFY_ACCESS_CODE') {
    const storedChallenge = currentChallenges[message.url]; // Check challenge by URL
    if (storedChallenge && storedChallenge === message.code) {
      // Grant access for 20 minutes
      const expiry = Date.now() + 20 * 60 * 1000;
      temporaryAccess[message.url] = expiry;
      delete currentChallenges[message.url]; // Remove used challenge for this URL
      sendResponse({ success: true, url: message.url });

      // Clean up expired temporary access grants periodically
      cleanupExpiredAccess();

    } else {
      sendResponse({ success: false });
    }
    return true; // Keep message channel open
  }

  // 获取临时访问状态
  if (message.type === 'GET_TEMP_ACCESS_STATUS') {
    // Clean up expired grants before sending status
    cleanupExpiredAccess();
    sendResponse({ temporaryAccess: temporaryAccess });
    // No need to return true here as it's synchronous after cleanup
  }
});

// Function to clean up expired temporary access grants
function cleanupExpiredAccess() {
    const now = Date.now();
    for (const url in temporaryAccess) {
        if (temporaryAccess[url] < now) {
            delete temporaryAccess[url];
        }
    }
    // Schedule next cleanup (e.g., every 5 minutes)
    setTimeout(cleanupExpiredAccess, 5 * 60 * 1000);
}

// Initial cleanup call
cleanupExpiredAccess();

// 初始化时恢复专注模式状态
chrome.storage.local.get(['focusMode'], function(result) {
  if (result.focusMode) {
    focusMode = result.focusMode;
    checkFocusMode();
  }
});

// 保存访问统计数据
function saveVisitStats(url, duration) {
  chrome.storage.local.get(['visitStats'], function(result) {
    const stats = result.visitStats || {};
    const today = new Date().toISOString().split('T')[0];
    
    if (!stats[url]) {
      stats[url] = [];
    }
    
    stats[url].push({
      date: today,
      duration: duration,
      timestamp: Date.now()
    });
    
    // 只保留最近90天的数据
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const cutoffDate = ninetyDaysAgo.toISOString().split('T')[0];
    
    Object.keys(stats).forEach(url => {
      stats[url] = stats[url].filter(visit => visit.date >= cutoffDate);
    });
    
    chrome.storage.local.set({ visitStats: stats });
  });
}

// 添加标签页关闭事件监听
chrome.tabs.onRemoved.addListener((tabId) => {
  if (visitStartTimes[tabId]) {
    // If a tab is closed while being tracked, record the duration
    // This might be inaccurate if the user was idle, but better than losing the data
    // const duration = (Date.now() - visitStartTimes[tabId]) / 1000;
    // Need the URL associated with this tabId... this part is tricky.
    // Let's skip saving stats on tab close for now to avoid complexity.
    delete visitStartTimes[tabId];
  }
  // No need to remove challenges by tabId anymore
});
