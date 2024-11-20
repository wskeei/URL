let focusMode = {
  active: false,
  endTime: null,
  blockedUrls: []
};

// 检查URL是否应该被阻止的函数
function shouldBlockUrl(url, callback) {
  chrome.storage.sync.get(['blockedUrls', 'focusMode'], function(data) {
    const blockedUrls = data.blockedUrls || [];
    const focusMode = data.focusMode || { active: false, urls: [], endTime: 0 };
    
    const shouldBlock = blockedUrls.some(item => 
      item.enabled && url.includes(item.url)
    ) || (
      focusMode.active && 
      Date.now() < focusMode.endTime && 
      focusMode.urls.some(blockedUrl => url.includes(blockedUrl))
    );

    callback(shouldBlock);
  });
}

// 阻止页面访问的函数
function blockPage(tabId) {
  const blockedPageUrl = chrome.runtime.getURL('blocked.html');
  chrome.tabs.update(tabId, {
    url: blockedPageUrl
  });
}

// 检查并处理URL
function checkAndBlockUrl(details) {
  // 忽略blocked.html页面本身
  if (details.url.includes(chrome.runtime.getURL('blocked.html'))) {
    return;
  }

  // 检查是否是主框架的导航
  if (details.frameId === 0) {
    shouldBlockUrl(details.url, (shouldBlock) => {
      if (shouldBlock) {
        blockPage(details.tabId);
      }
    });
  }
}

// 监听导航事件
chrome.webNavigation.onBeforeNavigate.addListener(checkAndBlockUrl);
chrome.webNavigation.onCommitted.addListener(checkAndBlockUrl);

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    shouldBlockUrl(tab.url, (shouldBlock) => {
      if (shouldBlock) {
        blockPage(tabId);
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
});

// 初始化时恢复专注模式状态
chrome.storage.local.get(['focusMode'], function(result) {
  if (result.focusMode) {
    focusMode = result.focusMode;
    checkFocusMode();
  }
}); 