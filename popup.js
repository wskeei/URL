document.addEventListener('DOMContentLoaded', function() {
  const urlInput = document.getElementById('urlInput');
  const addButton = document.getElementById('addButton');
  const blockedList = document.getElementById('blockedList');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabs = document.querySelectorAll('.tab-content');
  const focusTimeInput = document.getElementById('focusTime');
  const startFocusBtn = document.getElementById('startFocus');
  const focusStatus = document.getElementById('focusStatus');
  const urlCheckboxes = document.getElementById('urlCheckboxes');
  const blockMessage = document.getElementById('blockMessage');
  const saveMessage = document.getElementById('saveMessage');

  // 标签切换
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}Tab`).classList.add('active');
    });
  });

  // 加载已阻止的网址
  loadBlockedUrls();

  // 添加新网址
  addButton.addEventListener('click', function() {
    const url = urlInput.value.trim();
    if (url) {
      chrome.storage.sync.get(['blockedUrls'], function(result) {
        const blockedUrls = result.blockedUrls || [];
        if (!blockedUrls.some(item => item.url === url)) {
          blockedUrls.push({
            url: url,
            enabled: true  // 默认启用
          });
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
      // 清理无效的URL数据
      let blockedUrls = result.blockedUrls || [];
      
      // 过滤掉无效的URL项
      blockedUrls = blockedUrls.filter(item => 
        item && 
        typeof item === 'object' && 
        item.url && 
        typeof item.url === 'string'
      );

      // 保存清理后的数据
      chrome.storage.sync.set({ blockedUrls: blockedUrls }, () => {
        // 更新显示
        blockedList.innerHTML = '';
        
        blockedUrls.forEach(function(item) {
          const li = document.createElement('li');
          li.innerHTML = `
            <div class="url-item">
              <label class="switch">
                <input type="checkbox" class="toggle-url" data-url="${item.url}" 
                  ${item.enabled ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
              <span class="url-text">${item.url}</span>
              <button class="delete-btn" data-url="${item.url}">删除</button>
            </div>
          `;
          blockedList.appendChild(li);
        });

        // 添加开关事件监听
        document.querySelectorAll('.toggle-url').forEach(toggle => {
          toggle.addEventListener('change', function() {
            const urlToToggle = this.getAttribute('data-url');
            const isEnabled = this.checked;
            
            chrome.storage.sync.get(['blockedUrls'], function(result) {
              const updatedUrls = result.blockedUrls.map(item => {
                if (item.url === urlToToggle) {
                  return { ...item, enabled: isEnabled };
                }
                return item;
              });
              chrome.storage.sync.set({ blockedUrls: updatedUrls });
            });
          });
        });

        // 删除按钮事件
        document.querySelectorAll('.delete-btn').forEach(button => {
          button.addEventListener('click', function() {
            const urlToDelete = this.getAttribute('data-url');
            chrome.storage.sync.get(['blockedUrls'], function(result) {
              const newBlockedUrls = result.blockedUrls.filter(item => item.url !== urlToDelete);
              chrome.storage.sync.set({ blockedUrls: newBlockedUrls }, function() {
                loadBlockedUrls();
              });
            });
          });
        });
      });
    });
  }

  // 加载专注模式状态
  function loadFocusStatus() {
    chrome.runtime.sendMessage({ type: 'GET_FOCUS_STATUS' }, response => {
      if (response.focusMode.active) {
        const remainingTime = Math.max(0, Math.floor((response.focusMode.endTime - Date.now()) / 1000));
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        
        focusStatus.innerHTML = `
          <p>专注模式进行中</p>
          <div class="timer">${minutes}:${seconds.toString().padStart(2, '0')}</div>
          <p>请保持专注！</p>
        `;
        focusStatus.classList.add('active');
        startFocusBtn.disabled = true;
        
        if (remainingTime > 0) {
          setTimeout(loadFocusStatus, 1000);
        } else {
          focusStatus.classList.remove('active');
          startFocusBtn.disabled = false;
        }
      } else {
        focusStatus.classList.remove('active');
        startFocusBtn.disabled = false;
      }
    });
  }

  // 修改加载URL选择框的函数
  function loadUrlCheckboxes() {
    chrome.storage.sync.get(['blockedUrls'], function(result) {
      const blockedUrls = result.blockedUrls || [];
      urlCheckboxes.innerHTML = blockedUrls.map(item => `
        <label class="url-checkbox">
          <input type="checkbox" value="${item.url}">
          ${item.url}
        </label>
      `).join('');
    });
  }

  // 开始专注模式
  startFocusBtn.addEventListener('click', function() {
    const duration = parseInt(focusTimeInput.value);
    if (isNaN(duration) || duration <= 0 || duration > 180) {
      alert('请输入1-180分钟之间的时间');
      return;
    }

    const selectedUrls = Array.from(urlCheckboxes.querySelectorAll('input:checked'))
      .map(checkbox => checkbox.value);
    
    if (selectedUrls.length === 0) {
      alert('请至少选择一个要限制的网址');
      return;
    }

    chrome.runtime.sendMessage({
      type: 'START_FOCUS',
      duration: duration,
      urls: selectedUrls
    }, response => {
      if (response.success) {
        loadFocusStatus();
      }
    });
  });

  // 初始化
  loadBlockedUrls();
  loadUrlCheckboxes();
  loadFocusStatus();

  // 添加一个清理数据的函数
  function cleanStorage() {
    chrome.storage.sync.get(['blockedUrls'], function(result) {
      let blockedUrls = result.blockedUrls || [];
      blockedUrls = blockedUrls.filter(item => 
        item && 
        typeof item === 'object' && 
        item.url && 
        typeof item.url === 'string'
      );
      chrome.storage.sync.set({ blockedUrls: blockedUrls });
    });
  }

  // 在页面加载时执行清理
  cleanStorage();

  // 加载已保存的消息
  function loadBlockMessage() {
    chrome.storage.sync.get(['blockMessage'], function(result) {
      blockMessage.value = result.blockMessage || '这个网站已被限制访问。';
    });
  }

  // 保存自定义消息
  saveMessage.addEventListener('click', function() {
    const message = blockMessage.value.trim();
    chrome.storage.sync.set({ blockMessage: message }, function() {
      alert('保存成功！');
    });
  });

  // 在DOMContentLoaded事件处理函数中添加
const openStatsBtn = document.getElementById('openStats');
openStatsBtn.addEventListener('click', function() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('statistics.html')
  });
});

  // 在初始化部分添加
  loadBlockMessage();
}); 