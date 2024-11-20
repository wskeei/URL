let focusMode = {
  active: false,
  endTime: null,
  blockedUrls: []
};

// 检查专注模式状态
function checkFocusMode() {
  if (focusMode.active && Date.now() >= focusMode.endTime) {
    focusMode.active = false;
    focusMode.blockedUrls = [];
    chrome.storage.local.set({ focusMode: focusMode });
  }
}

// 监听导航事件
chrome.webNavigation.onBeforeNavigate.addListener(function(details) {
  checkFocusMode();
  
  chrome.storage.sync.get(['blockedUrls'], function(result) {
    const blockedUrls = result.blockedUrls || [];
    const url = new URL(details.url);
    
    // 检查是否在专注模式中
    if (focusMode.active) {
      if (focusMode.blockedUrls.some(blockedUrl => url.href.includes(blockedUrl))) {
        chrome.tabs.update(details.tabId, {
          url: 'blocked.html?mode=focus'
        });
        return;
      }
    }
    
    // 检查普通限制
    const isBlocked = blockedUrls.some(item => 
      item.enabled && url.href.includes(item.url)
    );
    
    if (isBlocked) {
      chrome.tabs.update(details.tabId, {
        url: 'blocked.html'
      });
    }
  });
});

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_FOCUS') {
    focusMode = {
      active: true,
      endTime: Date.now() + message.duration * 60 * 1000,
      blockedUrls: message.urls
    };
    chrome.storage.local.set({ focusMode: focusMode });
    sendResponse({ success: true });
  }
  
  if (message.type === 'GET_FOCUS_STATUS') {
    checkFocusMode();
    sendResponse({ focusMode });
  }
});

// 初始化时恢复专注模式状态
chrome.storage.local.get(['focusMode'], function(result) {
  if (result.focusMode) {
    focusMode = result.focusMode;
    checkFocusMode();
  }
}); 