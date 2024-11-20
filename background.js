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
  // 检查是否是主框架的导航
  if (details.frameId === 0) {
    chrome.storage.sync.get(['blockedUrls', 'focusMode'], function(data) {
      const blockedUrls = data.blockedUrls || [];
      const focusMode = data.focusMode || { active: false, urls: [], endTime: 0 };
      
      // 检查URL是否应该被阻止
      const shouldBlock = blockedUrls.some(item => 
        item.enabled && details.url.includes(item.url)
      ) || (
        focusMode.active && 
        Date.now() < focusMode.endTime && 
        focusMode.urls.some(url => details.url.includes(url))
      );

      if (shouldBlock) {
        // 使用chrome.runtime.getURL获取blocked.html的URL
        const blockedPageUrl = chrome.runtime.getURL('blocked.html');
        
        // 重定向到阻止页面
        chrome.tabs.update(details.tabId, {
          url: blockedPageUrl
        });
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