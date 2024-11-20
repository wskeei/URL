function showDebugInfo(message) {
  const debugInfo = document.getElementById('debugInfo');
  debugInfo.style.display = 'block';
  debugInfo.textContent += message + '\n';
}

function loadBlockMessage() {
  const messageElement = document.getElementById('customMessage');
  
  // 确保chrome.storage API可用
  if (!chrome || !chrome.storage || !chrome.storage.sync) {
    messageElement.textContent = '这个网站已被限制访问。';
    showDebugInfo('Chrome storage API not available');
    return;
  }

  chrome.storage.sync.get(['blockMessage'], function(result) {
    if (chrome.runtime.lastError) {
      showDebugInfo('Error: ' + chrome.runtime.lastError.message);
      messageElement.textContent = '这个网站已被限制访问。';
      return;
    }

    if (result && result.blockMessage) {
      messageElement.textContent = result.blockMessage;
      showDebugInfo('Successfully loaded custom message');
    } else {
      messageElement.textContent = '这个网站已被限制访问。';
      showDebugInfo('No custom message found');
    }
  });
}

// 当页面加载完成时执行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadBlockMessage);
} else {
  loadBlockMessage();
}

// 添加错误处理
window.onerror = function(msg, url, line, col, error) {
  showDebugInfo(`Error: ${msg} at ${line}:${col}`);
  return false;
}; 