document.addEventListener('DOMContentLoaded', function() {
  const urlInput = document.getElementById('urlInput');
  const addButton = document.getElementById('addButton');
  const blockedList = document.getElementById('blockedList');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabs = document.querySelectorAll('.tab-content');
  const focusDaysInput = document.getElementById('focusDays');
  const focusHoursInput = document.getElementById('focusHours');
  const focusMinutesInput = document.getElementById('focusMinutes');
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
      chrome.storage.sync.get(['blockedUrls', 'focusMode'], function(result) {
        const blockedUrls = result.blockedUrls || [];
        const focusMode = result.focusMode || { active: false };
        
        if (!blockedUrls.some(item => item.url === url)) {
          blockedUrls.push({
            url: url,
            enabled: true
          });
          
          chrome.storage.sync.set({ blockedUrls: blockedUrls }, function() {
            loadBlockedUrls();
            loadUrlCheckboxes();
            urlInput.value = '';
            
            // 如果当前处于专注模式，将新添加的网址也加入到限制列表中
            if (focusMode.active) {
              chrome.runtime.sendMessage({
                type: 'ADD_FOCUS_URL',
                url: url
              });
            }
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
        let timeDisplay;

        if (remainingTime >= 24 * 60 * 60) {  // 大于24小时
          const days = Math.floor(remainingTime / (24 * 60 * 60));
          const hours = Math.floor((remainingTime % (24 * 60 * 60)) / 3600);
          const minutes = Math.floor((remainingTime % 3600) / 60);
          timeDisplay = `${days}天 ${hours}时 ${minutes}分`;
        } else if (remainingTime >= 3600) {  // 大于1小时
          const hours = Math.floor(remainingTime / 3600);
          const minutes = Math.floor((remainingTime % 3600) / 60);
          const seconds = remainingTime % 60;
          timeDisplay = `${hours}时 ${minutes}分 ${seconds.toString().padStart(2, '0')}秒`;
        } else {  // 小于1小时
          const minutes = Math.floor(remainingTime / 60);
          const seconds = remainingTime % 60;
          timeDisplay = `${minutes}分 ${seconds.toString().padStart(2, '0')}秒`;
        }
        
        focusStatus.innerHTML = `
          <p>专注模式进行中</p>
          <div class="timer">${timeDisplay}</div>
          <p>请保持专注！</p>
        `;
        focusStatus.classList.add('active');
        startFocusBtn.disabled = true;
        
        // 更新URL选择框状态
        loadUrlCheckboxes();
        
        if (remainingTime > 0) {
          setTimeout(loadFocusStatus, 1000);
        } else {
          focusStatus.classList.remove('active');
          startFocusBtn.disabled = false;
          // 专注模式结束时也更新URL选择框状态
          loadUrlCheckboxes();
        }
      } else {
        focusStatus.classList.remove('active');
        startFocusBtn.disabled = false;
        // 确保非专注模式时也更新URL选择框状态
        loadUrlCheckboxes();
      }
    });
  }

  // 修改加载URL选择框的函数
  function loadUrlCheckboxes() {
    chrome.storage.sync.get(['blockedUrls', 'focusMode'], function(result) {
      const blockedUrls = result.blockedUrls || [];
      const focusMode = result.focusMode || { active: false, urls: [] };
      
      urlCheckboxes.innerHTML = blockedUrls.map(item => {
        const isChecked = focusMode.active && focusMode.urls.includes(item.url);
        return `
          <label class="url-checkbox">
            <input type="checkbox" value="${item.url}" ${isChecked ? 'checked' : ''} 
              ${focusMode.active && isChecked ? 'disabled' : ''}>
            <span class="url-label ${isChecked ? 'active-url' : ''}">${item.url}</span>
          </label>
        `;
      }).join('');
    });
  }

  // 开始专注模式
  startFocusBtn.addEventListener('click', function() {
    const days = parseInt(focusDaysInput.value) || 0;
    const hours = parseInt(focusHoursInput.value) || 0;
    const minutes = parseInt(focusMinutesInput.value) || 0;
    
    // 计算总分钟数
    const totalMinutes = days * 24 * 60 + hours * 60 + minutes;
    
    if (totalMinutes <= 0) {
      alert('请至少设置1分钟的专注时间');
      return;
    }
    
    if (totalMinutes > 20160) { // 14天的分钟数
      alert('专注时间不能超过14天');
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
      duration: totalMinutes,
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

  // 字符计数功能
  const charCount = document.querySelector('.char-count');
  const MAX_CHARS = 200;

  function updateCharCount() {
    const count = blockMessage.value.length;
    charCount.textContent = `${count}/${MAX_CHARS}`;
    if (count > MAX_CHARS) {
      charCount.style.color = '#ff3b30';
    } else {
      charCount.style.color = '#666';
    }
  }

  blockMessage.addEventListener('input', updateCharCount);

  // 主题切换功能
  const themeOptions = document.querySelectorAll('input[name="theme"]');
  
  function setTheme(theme) {
    // 移除现有主题类
    document.body.classList.remove('theme-light', 'theme-dark');
    // 添加新主题类
    document.body.classList.add(`theme-${theme}`);
    // 保存主题设置
    chrome.storage.sync.set({ theme: theme }, () => {
      // 同步更新到所有打开的插件页面
      chrome.runtime.sendMessage({
        type: 'THEME_CHANGED',
        theme: theme
      });
    });
  }

  // 监听主题切换
  themeOptions.forEach(option => {
    option.addEventListener('change', (e) => {
      setTheme(e.target.value);
      // 添加切换动画
      document.body.style.transition = 'background-color 0.3s, color 0.3s';
      setTimeout(() => {
        document.body.style.transition = '';
      }, 300);
    });
  });

  // 加载保存的主题
  chrome.storage.sync.get(['theme'], function(result) {
    const savedTheme = result.theme || 'light';
    // 设置单选框状态
    const themeInput = document.querySelector(`input[name="theme"][value="${savedTheme}"]`);
    if (themeInput) {
      themeInput.checked = true;
    }
    // 应用主题
    setTheme(savedTheme);
  });

  // 保存设置时的动画效果
  saveMessage.addEventListener('click', function() {
    const message = blockMessage.value.trim();
    if (message.length > MAX_CHARS) {
      alert(`提示文字不能超过${MAX_CHARS}个字符`);
      return;
    }
    
    const originalText = this.innerHTML;
    this.innerHTML = '<span class="save-icon">✓</span><span>已保存</span>';
    this.style.background = '#34c759';
    
    chrome.storage.sync.set({ blockMessage: message }, () => {
      setTimeout(() => {
        this.innerHTML = originalText;
        this.style.background = '';
      }, 2000);
    });
  });

  // 初始化字符计数
  updateCharCount();
}); 