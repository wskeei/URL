let focusMode = {
  active: false,
  endTime: null,
  blockedUrls: []
};

// 记录访问开始时间的对象
let visitStartTimes = {};

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
  if (details.url.includes(chrome.runtime.getURL('blocked.html'))) {
    return;
  }

  if (details.frameId === 0) {
    shouldBlockUrl(details.url, (shouldBlock) => {
      if (shouldBlock) {
        // 记录访问结束时间并保存统计数据
        if (visitStartTimes[details.tabId]) {
          const duration = (Date.now() - visitStartTimes[details.tabId]) / 1000; // 转换为秒
          saveVisitStats(details.url, duration);
          delete visitStartTimes[details.tabId];
        }
        blockPage(details.tabId);
      } else {
        // 记录访问开始时间
        visitStartTimes[details.tabId] = Date.now();
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
    delete visitStartTimes[tabId];
  }
}); 