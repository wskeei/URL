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

  // 加载URL选择框
  function loadUrlCheckboxes() {
    chrome.storage.sync.get(['blockedUrls'], function(result) {
      const blockedUrls = result.blockedUrls || [];
      urlCheckboxes.innerHTML = blockedUrls.map(url => `
        <label class="url-checkbox">
          <input type="checkbox" value="${url}">
          ${url}
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
}); 