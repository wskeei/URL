document.addEventListener('DOMContentLoaded', function() {
  const urlInput = document.getElementById('urlInput');
  const addButton = document.getElementById('addButton');
  const blockedList = document.getElementById('blockedList');

  // 加载已阻止的网址
  loadBlockedUrls();

  // 添加新网址
  addButton.addEventListener('click', function() {
    const url = urlInput.value.trim();
    if (url) {
      chrome.storage.sync.get(['blockedUrls'], function(result) {
        const blockedUrls = result.blockedUrls || [];
        if (!blockedUrls.includes(url)) {
          blockedUrls.push(url);
          chrome.storage.sync.set({ blockedUrls: blockedUrls }, function() {
            loadBlockedUrls();
            urlInput.value = '';
          });
        }
      });
    }
  });

  function loadBlockedUrls() {
    chrome.storage.sync.get(['blockedUrls'], function(result) {
      const blockedUrls = result.blockedUrls || [];
      blockedList.innerHTML = '';
      
      blockedUrls.forEach(function(url) {
        const li = document.createElement('li');
        li.innerHTML = `
          <span>${url}</span>
          <button class="delete-btn" data-url="${url}">删除</button>
        `;
        blockedList.appendChild(li);
      });

      // 添加删除按钮事件
      document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', function() {
          const urlToDelete = this.getAttribute('data-url');
          const newBlockedUrls = blockedUrls.filter(url => url !== urlToDelete);
          chrome.storage.sync.set({ blockedUrls: newBlockedUrls }, function() {
            loadBlockedUrls();
          });
        });
      });
    });
  }
}); 