chrome.webNavigation.onBeforeNavigate.addListener(function(details) {
  chrome.storage.sync.get(['blockedUrls'], function(result) {
    const blockedUrls = result.blockedUrls || [];
    const url = new URL(details.url);
    
    // 检查当前网址是否在阻止列表中
    if (blockedUrls.some(blockedUrl => url.href.includes(blockedUrl))) {
      // 关闭包含被阻止网址的标签页
      chrome.tabs.update(details.tabId, {
        url: 'blocked.html'
      });
    }
  });
}); 