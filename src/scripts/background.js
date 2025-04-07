let focusMode = {
  active: false,
  endTime: null,
  blockedUrls: []
};

// 记录访问开始时间的对象
let visitStartTimes = {};
// --- Storage Keys ---
const SETTINGS_KEY = 'extensionSettings'; // { disableCopy: bool, disableCopyLockExpiry: ts, strictMode: bool, strictModeLockExpiry: ts }
const DAILY_USAGE_KEY = 'dailyTempAccessUsage'; // { "YYYY-MM-DD": { "url": true } }
const BILI_WHITELIST_KEY = 'biliUidWhitelist'; // Array of strings (UIDs)

// --- Global Variables ---
// 存储临时访问权限 { url: expiryTimestamp }
let temporaryAccess = {};
// 存储当前挑战 { url: { challenge: string, duration: number } }
let currentChallenges = {};
// 存储等待内容脚本UID检查的标签页 { tabId: boolean }
let tabsPendingUidCheck = {};

// --- Utility Functions ---
// 获取当天日期字符串 YYYY-MM-DD
function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

// 生成随机挑战字符串 (accepts length parameter)
function generateChallengeString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_-+=[]{};:,.<>?';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 检查URL是否应该被阻止（用于非Bilibili视频页的初始检查）
function shouldBlockUrl(url, callback) {
  // 1. 检查是否有临时访问权限 (Applies to all URLs)
  // Extract base URL for temp access check if needed, or check full URL? Let's check full URL for now.
  const urlToCheckForTempAccess = url; // Or derive a base URL if temp access is domain-based
  if (temporaryAccess[urlToCheckForTempAccess] && Date.now() < temporaryAccess[urlToCheckForTempAccess]) {
    callback(false); // Has temp access, don't block
    return;
  }

  // 2. 检查是否是Bilibili白名单UID主页 (space.bilibili.com)
  const biliSpaceMatch = url.match(/https?:\/\/space\.bilibili\.com\/(\d+)/);
  if (biliSpaceMatch) {
    const uid = biliSpaceMatch[1];
    chrome.storage.sync.get([BILI_WHITELIST_KEY], function(result) {
      let whitelist = result[BILI_WHITELIST_KEY] || [];
      whitelist = whitelist.map(item => (typeof item === 'string' ? { uid: item, note: '' } : item));
      if (whitelist.some(entry => entry.uid === uid)) {
        callback(false); // Whitelisted space page, don't block
        return;
      }
      // Space page UID not whitelisted, check general rules for bilibili.com
      checkGeneralBlockingRules(url, callback); // Check if bilibili.com itself is blocked
    });
    return; // Async check started
  }

  // 3. Bilibili video pages (www.bilibili.com/video/*) are handled *after* load by content script + message listener
  // This function should NOT block them here.
  if (url.includes('www.bilibili.com/video/')) {
     callback(false); // Don't block *yet*, wait for content script
     return;
  }

  // 4. For all OTHER URLs, perform general blocking checks
  checkGeneralBlockingRules(url, callback);
}

// Helper function to check if a URL should be blocked based on general/focus lists
// This is used by shouldBlockUrl (for non-bili URLs) and the message listener (for bili video URLs)
function checkGeneralBlockingRules(url, callback) {
  chrome.storage.sync.get(['blockedUrls', 'focusMode'], function(data) {
    const blockedUrls = data.blockedUrls || [];
    const focusModeData = data.focusMode || { active: false, urls: [], endTime: 0 };

    // Check if the URL matches any enabled blocked URL pattern
    const isGenerallyBlocked = blockedUrls.some(item =>
      item.enabled && url.includes(item.url) // Simple includes check
    );

    // Check if the URL matches any focus mode URL pattern
    const isFocusBlocked = focusModeData.active &&
                           Date.now() < focusModeData.endTime &&
                           focusModeData.urls.some(blockedUrl => url.includes(blockedUrl)); // Simple includes check

    const shouldBlock = isGenerallyBlocked || isFocusBlocked;

    callback(shouldBlock);
  });
}


// 阻止页面访问的函数 (Removed isFocusBlock parameter)
function blockPage(tabId) {
  // No need to pass original URL anymore as override is in popup
  const blockedPageUrl = chrome.runtime.getURL('src/pages/blocked.html');
  chrome.tabs.update(tabId, { url: blockedPageUrl });
}


// 检查并处理URL (Navigation Listeners)
function checkAndBlockUrl(details) {
  const tabId = details.tabId;
  const url = details.url;
  const blockedPageBaseUrl = chrome.runtime.getURL('src/pages/blocked.html');

  // Ignore self, non-http(s), and non-main frame navigations
  if (url.startsWith(blockedPageBaseUrl) || !url.startsWith('http') || details.frameId !== 0) {
    return;
  }

  // --- Handle Bilibili Video Pages ---
  if (url.includes('www.bilibili.com/video/')) {
    // Check if bilibili.com *would* be blocked by general rules
    checkGeneralBlockingRules(url, (wouldBeBlocked) => {
      if (wouldBeBlocked) {
        // Don't block yet, mark for content script check
        console.log(`Bilibili Whitelist: Marking tab ${tabId} (${url}) for UID check.`);
        tabsPendingUidCheck[tabId] = true;
        // Start visit timer here if not already started? Or wait until confirmed allowed? Let's wait.
      } else {
        // Not blocked by general rules, allow navigation and start timer
        if (!visitStartTimes[tabId]) {
          visitStartTimes[tabId] = Date.now();
        }
      }
    });
    return; // Don't proceed to shouldBlockUrl for video pages
  }

  // --- Handle Other URLs ---
  shouldBlockUrl(url, (shouldBlock) => {
    if (shouldBlock) {
      // Block immediately
      console.log(`Blocking tab ${tabId} (${url}) based on shouldBlockUrl.`);
      // End visit timer if started
      if (visitStartTimes[tabId]) {
         const duration = (Date.now() - visitStartTimes[tabId]) / 1000;
         // How to get the original URL if redirected? This is tricky.
         // For now, let's assume the 'url' here is close enough or handle on commit.
         saveVisitStats(url, duration); // Save stats for the URL being blocked
         delete visitStartTimes[tabId];
      }
      blockPage(tabId);
    } else {
      // Allow navigation, start visit timer if not already started
      if (!visitStartTimes[tabId]) {
        visitStartTimes[tabId] = Date.now();
      }
    }
  });
}

// --- Revised onCommitted Listener ---
// We need onCommitted to handle cases where the user navigates *away* from an allowed page
// or potentially to catch the final URL after redirects.
chrome.webNavigation.onCommitted.addListener((details) => {
    const tabId = details.tabId;
    const url = details.url;
    const blockedPageBaseUrl = chrome.runtime.getURL('src/pages/blocked.html');

    // Ignore self, non-http(s), and non-main frame navigations
    if (url.startsWith(blockedPageBaseUrl) || !url.startsWith('http') || details.frameId !== 0) {
      return;
    }

    // If navigating *away* from a page where timer was running, record stats
    if (visitStartTimes[tabId]) {
       // Check if the *new* URL should be blocked. If so, stop timer.
       // This logic gets complex with redirects. Let's simplify:
       // If a timer is running, and the new URL is NOT the blocked page,
       // assume the user navigated away *before* being blocked.
       // We need a better way to associate start time with the *specific* allowed URL.
       // Let's postpone refining stat tracking for now and focus on blocking.

       // If the new URL is the blocked page, the timer was likely stopped by checkAndBlockUrl.
       // If the new URL is *not* the blocked page, and *not* a pending video check,
       // maybe stop the timer? This needs more thought.
    }

    // If this is the final URL of a Bilibili video page that was pending check,
    // the content script will handle it via messages.
    // If it's *not* a video page, re-run the blocking check in case of redirects.
    if (!url.includes('www.bilibili.com/video/')) {
        shouldBlockUrl(url, (shouldBlock) => {
            if (shouldBlock) {
                console.log(`Blocking tab ${tabId} (${url}) on commit.`);
                // Stop timer if running
                if (visitStartTimes[tabId]) {
                    // Save stats logic here (complex)
                    delete visitStartTimes[tabId];
                }
                blockPage(tabId);
            } else {
                 // Ensure timer starts if not already running for this allowed URL
                 if (!visitStartTimes[tabId]) {
                    visitStartTimes[tabId] = Date.now();
                 }
            }
        });
    }
    // If it IS a video page, do nothing here, wait for content script message.

}, { url: [{ urlMatches: 'https?://*/*' }], types: ["main_frame"] });


// Listen for navigation start (mainly to potentially stop timers)
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    const tabId = details.tabId;
    const url = details.url;
    const blockedPageBaseUrl = chrome.runtime.getURL('src/pages/blocked.html');

    // Ignore self, non-http(s), and non-main frame navigations
    if (url.startsWith(blockedPageBaseUrl) || !url.startsWith('http') || details.frameId !== 0) {
      return;
    }

    // If navigating away from a page where timer was running, stop the timer and save stats
    if (visitStartTimes[tabId]) {
        console.log(`Navigation started on tab ${tabId}, stopping timer.`);
        const duration = (Date.now() - visitStartTimes[tabId]) / 1000;
        // Need the URL associated with the start time...
        // This requires storing { tabId: { startTime: ts, url: originalUrl } }
        // Let's skip accurate stat saving on navigation for now.
        delete visitStartTimes[tabId]; // Just delete timer for now
    }

    // If navigating away from a page pending UID check, clear the pending state
    if (tabsPendingUidCheck[tabId]) {
        console.log(`Navigation started on tab ${tabId}, clearing pending UID check.`);
        delete tabsPendingUidCheck[tabId];
    }

}, { url: [{ urlMatches: 'https?://*/*' }], types: ["main_frame"] });




// Listen for tab updates (e.g., user types URL directly - simplified, relies on onCommitted now)
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//   // Check only when loading is complete and URL is present and not the blocked page
//   if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
//      const blockedPageBaseUrl = chrome.runtime.getURL('src/pages/blocked.html');
//      if (tab.url.startsWith(blockedPageBaseUrl)) {
//          return; // Don't re-evaluate the blocked page
//      }
//      // Re-run the commit logic essentially
//      handleCommitOrUpdate(tabId, tab.url);
//   }
// });

// // Helper to consolidate commit/update logic
// function handleCommitOrUpdate(tabId, url) {
//     if (!url.includes('www.bilibili.com/video/')) {
//         shouldBlockUrl(url, (shouldBlock) => {
//             if (shouldBlock) {
//                 console.log(`Blocking tab ${tabId} (${url}) on update/commit.`);
//                 if (visitStartTimes[tabId]) delete visitStartTimes[tabId]; // Stop timer
//                 blockPage(tabId);
//             } else {
//                  if (!visitStartTimes[tabId]) visitStartTimes[tabId] = Date.now(); // Start timer
//             }
//         });
//     }
//     // Video pages handled by messages
// }


// 处理来自popup和content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // --- Messages from Popup ---
  if (message.type === 'START_FOCUS') {
    const endTime = Date.now() + message.duration * 60 * 1000;
    const focusMode = {
      // ... (existing popup message handlers remain the same) ...
      active: true,
      urls: message.urls,
      endTime: endTime
    };
    chrome.storage.sync.set({ focusMode }, () => {
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'GET_FOCUS_STATUS') {
    chrome.storage.sync.get(['focusMode'], (result) => {
      const focusMode = result.focusMode || { active: false, endTime: 0 };
      if (focusMode.active && Date.now() >= focusMode.endTime) {
        focusMode.active = false;
        chrome.storage.sync.set({ focusMode }); // Update storage if expired
      }
      sendResponse({ focusMode });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'ADD_FOCUS_URL') {
    chrome.storage.sync.get(['focusMode'], (result) => {
      const focusMode = result.focusMode || { active: false, urls: [] };
      if (focusMode.active && !focusMode.urls.includes(message.url)) {
        focusMode.urls.push(message.url);
        chrome.storage.sync.set({ focusMode }, () => {
          // Immediately check all tabs for the newly added URL
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
              if (tab.url && tab.url.includes(message.url)) {
                 // Re-evaluate blocking for this tab
                 // If it's a video page, mark for check; otherwise, block directly
                 if (tab.url.includes('www.bilibili.com/video/')) {
                     console.log(`Bilibili Whitelist: Marking tab ${tab.id} (${tab.url}) for UID check due to focus list update.`);
                     tabsPendingUidCheck[tab.id] = true;
                 } else {
                     blockPage(tab.id);
                 }
              }
            });
          });
          sendResponse({ success: true }); // Send response after potential async operations
        });
      } else {
         sendResponse({ success: true }); // URL already present or focus not active
      }
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'THEME_CHANGED') {
    chrome.runtime.sendMessage({ type: 'APPLY_THEME', theme: message.theme })
      .catch(() => { /* Ignore if no other pages listening */ });
    // No response needed, but return true if any async ops were involved (none here)
    return false;
  }

  if (message.type === 'GET_FOCUS_BLOCKED_URLS') {
    chrome.storage.sync.get(['focusMode'], (result) => {
      const focusMode = result.focusMode || { active: false, urls: [] };
      if (focusMode.active && Date.now() < focusMode.endTime) {
        sendResponse({ urls: focusMode.urls });
      } else {
        sendResponse({ urls: [] });
      }
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_ACCESS_CHALLENGE') {
    const challengeLength = message.length || 30;
    const durationMinutes = message.duration || 20;
    const challenge = generateChallengeString(challengeLength);
    currentChallenges[message.url] = { challenge: challenge, duration: durationMinutes };
    sendResponse({ challenge: challenge });
    return true; // Keep channel open for async response
  }

  if (message.type === 'VERIFY_ACCESS_CODE') {
    const challengeData = currentChallenges[message.url];
    if (challengeData && challengeData.challenge === message.code) {
      const durationMinutes = challengeData.duration;
      const expiry = Date.now() + durationMinutes * 60 * 1000;
      temporaryAccess[message.url] = expiry; // Grant access
      delete currentChallenges[message.url];

      // Check strict mode and record usage if needed
      chrome.storage.sync.get([SETTINGS_KEY], (settingsResult) => {
        const settings = settingsResult[SETTINGS_KEY] || {};
        if (settings.strictMode) {
          const today = getTodayDateString();
          chrome.storage.local.get([DAILY_USAGE_KEY], (localResult) => {
            let usageData = localResult[DAILY_USAGE_KEY] || {};
            if (!usageData[today]) usageData[today] = {};
            usageData[today][message.url] = true;
            chrome.storage.local.set({ [DAILY_USAGE_KEY]: usageData }, () => {
              console.log(`Strict mode: Recorded usage for ${message.url} on ${today}`);
              sendResponse({ success: true, url: message.url, grantedDuration: durationMinutes });
            });
          });
        } else {
          sendResponse({ success: true, url: message.url, grantedDuration: durationMinutes });
        }
      });
      return true; // Keep channel open for async response

    } else {
      sendResponse({ success: false });
      return false; // Synchronous response
    }
  }

  if (message.type === 'GET_TEMP_ACCESS_STATUS') {
    cleanupExpiredAccess();
    sendResponse({ temporaryAccess: temporaryAccess });
    return false; // Synchronous response
  }

  if (message.type === 'GET_SETTINGS_STATUS') {
    chrome.storage.sync.get([SETTINGS_KEY], (result) => {
      sendResponse({ settings: result[SETTINGS_KEY] || {} });
    });
    return true; // Keep channel open for async response
  }

   if (message.type === 'UPDATE_SETTING') {
     const { settingName, value } = message;
     chrome.storage.sync.get([SETTINGS_KEY], (result) => {
       let settings = result[SETTINGS_KEY] || {};
       const now = Date.now();
       let lockExpiry = null;
       if (value === true) lockExpiry = now + 24 * 60 * 60 * 1000;

       if (settingName === 'disableCopy') {
         settings.disableCopy = value;
         settings.disableCopyLockExpiry = value ? lockExpiry : null;
       } else if (settingName === 'strictMode') {
         settings.strictMode = value;
         settings.strictModeLockExpiry = value ? lockExpiry : null;
       }

       chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, () => {
         if (chrome.runtime.lastError) {
           sendResponse({ success: false, error: chrome.runtime.lastError.message });
         } else {
           sendResponse({ success: true, settings });
         }
       });
     });
     return true; // Keep channel open for async response
   }

   if (message.type === 'CHECK_DAILY_USAGE') {
     const today = getTodayDateString();
     chrome.storage.local.get([DAILY_USAGE_KEY], (result) => {
        const usageData = result[DAILY_USAGE_KEY] || {};
        const todaysUsage = usageData[today] || {};
        sendResponse({ usedToday: !!todaysUsage[message.url] });
     });
     return true; // Keep channel open for async response
   }


  // --- Messages from Content Script ---

  if (message.type === 'BILIBILI_UID_FOUND') {
    const tabId = sender?.tab?.id;
    const receivedUid = message.uid;

    if (tabId && tabsPendingUidCheck[tabId]) {
      console.log(`Bilibili Whitelist: Received UID ${receivedUid} from tab ${tabId}. Checking whitelist.`);
      delete tabsPendingUidCheck[tabId]; // Processed this tab

      chrome.storage.sync.get([BILI_WHITELIST_KEY], (result) => {
        let whitelist = result[BILI_WHITELIST_KEY] || [];
        whitelist = whitelist.map(item => (typeof item === 'string' ? { uid: item, note: '' } : item));
        if (whitelist.some(entry => entry.uid === receivedUid)) {
          console.log(`Bilibili Whitelist: UID ${receivedUid} is whitelisted. Allowing tab ${tabId}.`);
          if (!visitStartTimes[tabId]) {
             visitStartTimes[tabId] = Date.now();
          }
          sendResponse({ allowed: true });
        } else {
          console.log(`Bilibili Whitelist: UID ${receivedUid} not in whitelist. Blocking tab ${tabId}.`);
          blockPage(tabId);
          sendResponse({ allowed: false });
        }
      });
      return true; // Keep channel open for async response to storage.get
    } else {
       console.log(`Bilibili Whitelist: Received UID ${receivedUid} from unexpected tab ${tabId}. Ignoring.`);
    }
  }

  if (message.type === 'BILIBILI_UID_NOT_FOUND') {
     const tabId = sender?.tab?.id;
     if (tabId && tabsPendingUidCheck[tabId]) {
        console.log(`Bilibili Whitelist: Content script could not find UID on tab ${tabId}. Blocking.`);
        delete tabsPendingUidCheck[tabId]; // Processed this tab
        blockPage(tabId); // Block because UID couldn't be verified
        sendResponse({ allowed: false }); // Optional: respond to content script
     } else {
        console.log(`Bilibili Whitelist: Received UID_NOT_FOUND from unexpected tab ${tabId}. Ignoring.`);
     }
     return false; // Synchronous processing
  }

  // Default: If message type not recognized, return false or undefined
  // Ensure popup handlers return true if they are async.
});


// --- Background Tasks ---

// Function to clean up expired temporary access grants (remains the same)
function cleanupExpiredAccess() {
    const now = Date.now();
    let changed = false;
    for (const url in temporaryAccess) {
        if (temporaryAccess[url] < now) {
            delete temporaryAccess[url];
            changed = true;
        }
    }
    // Consider notifying popup if grants expired? Maybe not necessary.
}

// Function to clear old daily usage data
function clearOldUsageData() {
  const today = getTodayDateString();
  chrome.storage.local.get([DAILY_USAGE_KEY], (result) => {
    const usageData = result[DAILY_USAGE_KEY] || {};
    let updatedUsage = {};
    // Keep only today's data
    if (usageData[today]) {
      updatedUsage[today] = usageData[today];
    }
    // Check if data actually changed before writing
    if (JSON.stringify(usageData) !== JSON.stringify(updatedUsage)) {
       chrome.storage.local.set({ [DAILY_USAGE_KEY]: updatedUsage }, () => {
         console.log("Cleared old daily usage data.");
       });
    }
  });
}

// Schedule periodic cleanup tasks
function scheduleCleanups() {
   cleanupExpiredAccess(); // Run immediately
   clearOldUsageData();    // Run immediately

   // Schedule next run (e.g., every 5 minutes for temp access, maybe less often for daily usage?)
   setInterval(cleanupExpiredAccess, 5 * 60 * 1000);
   // Consider running daily usage cleanup less often, e.g., hourly or on startup
   setInterval(clearOldUsageData, 60 * 60 * 1000); // Check hourly
}

// Run cleanups on startup
scheduleCleanups();


// --- Initialization ---

// Initialize focus mode state (assuming checkFocusMode exists elsewhere or is not needed)
chrome.storage.sync.get(['focusMode'], function(result) { // Changed to sync storage based on popup.js
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

// --- Event Listeners ---

// (Web Navigation and Tab Update listeners remain the same)

// Add listener for extension startup to clear old usage data (remains the same)
chrome.runtime.onStartup.addListener(() => {
  console.log("Extension started up, clearing old usage data.");
  clearOldUsageData();
});


// Tab removal listener (updated)
chrome.tabs.onRemoved.addListener((tabId) => {
  // Clear visit timer if tab is closed
  if (visitStartTimes[tabId]) {
    console.log(`Tab ${tabId} removed, clearing visit timer.`);
    // Save stats before deleting? Still complex.
    delete visitStartTimes[tabId];
  }
  // Clear pending UID check if tab is closed
  if (tabsPendingUidCheck[tabId]) {
    console.log(`Tab ${tabId} removed, clearing pending UID check.`);
    delete tabsPendingUidCheck[tabId];
  }
});


// --- Strict Mode Logic Integration ---
// (This logic is now integrated within the VERIFY_ACCESS_CODE message handler above)
// No separate listener needed here.
