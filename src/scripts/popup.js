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
  const requestTempAccessBtn = document.getElementById('requestTempAccessBtn');

  // Modal elements
  const tempAccessModal = document.getElementById('tempAccessModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const tempAccessUrlSelect = document.getElementById('tempAccessUrlSelect');
  const challengeSection = document.getElementById('challengeSection');
  const modalChallengeString = document.getElementById('modalChallengeString');
  const modalChallengeInput = document.getElementById('modalChallengeInput');
  const modalSubmitChallenge = document.getElementById('modalSubmitChallenge');
  const modalStatusMessage = document.getElementById('modalStatusMessage');
  const tempAccessStatusContainer = document.getElementById('tempAccessStatusContainer');
  const tempAccessTimersList = document.getElementById('tempAccessTimersList');
  const durationSelection = document.getElementById('durationSelection');
  const durationOptions = document.querySelectorAll('input[name="tempAccessDuration"]');

  // Settings elements
  const disableCopyCheckbox = document.getElementById('disableCopyChallenge');
  const disableCopyLockInfo = document.getElementById('disableCopyLockInfo');
  const enableStrictModeCheckbox = document.getElementById('enableStrictMode');
  const strictModeLockInfo = document.getElementById('strictModeLockInfo');

  // Bilibili Whitelist elements
  const biliUidInput = document.getElementById('biliUidInput');
  const addBiliUidButton = document.getElementById('addBiliUidButton');
  const biliUidList = document.getElementById('biliUidList');

  let tempAccessTimerInterval = null; // To store the interval ID
  let currentSettings = {}; // To store loaded settings
  let selectedDuration = 20; // Default duration
  let selectedChallengeLength = 30; // Default length corresponding to 20 mins

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
      if (chrome.runtime.lastError) {
        console.error("Error getting focus status:", chrome.runtime.lastError);
        // Handle error appropriately, maybe show an error message in the popup
        return;
      }
      
      if (response && response.focusMode && response.focusMode.active) {
        // Focus mode IS active
        const remainingTime = Math.max(0, Math.floor((response.focusMode.endTime - Date.now()) / 1000));
        let timeDisplay;

        // Calculate time display
        if (remainingTime >= 24 * 60 * 60) {
          const days = Math.floor(remainingTime / (24 * 60 * 60));
          const hours = Math.floor((remainingTime % (24 * 60 * 60)) / 3600);
          const minutes = Math.floor((remainingTime % 3600) / 60);
          timeDisplay = `${days}天 ${hours}时 ${minutes}分`;
        } else if (remainingTime >= 3600) {
          const hours = Math.floor(remainingTime / 3600);
          const minutes = Math.floor((remainingTime % 3600) / 60);
          const seconds = remainingTime % 60;
          timeDisplay = `${hours}时 ${minutes}分 ${seconds.toString().padStart(2, '0')}秒`;
        } else {
          const minutes = Math.floor(remainingTime / 60);
          const seconds = remainingTime % 60;
          timeDisplay = `${minutes}分 ${seconds.toString().padStart(2, '0')}秒`;
        }

        // Update UI for active focus mode
        focusStatus.innerHTML = `
          <p>专注模式进行中</p>
          <div class="timer">${timeDisplay}</div>
          <p>请保持专注！</p>
        `;
        focusStatus.classList.add('active');
        startFocusBtn.disabled = true;
        requestTempAccessBtn.style.display = 'block'; // Show temp access btn

        loadUrlCheckboxes(); // Update checkboxes state

        // Check if timer should continue or if focus just ended
        if (remainingTime > 0) {
          setTimeout(loadFocusStatus, 1000); // Continue countdown
        } else {
          // Focus mode just ended, reload status to reflect this
          // Small delay to avoid potential race conditions with storage update
          setTimeout(loadFocusStatus, 100);
        }

      } else {
        // Focus mode is NOT active (or response was invalid)
        focusStatus.classList.remove('active');
        startFocusBtn.disabled = false;
        requestTempAccessBtn.style.display = 'none'; // Hide temp access btn
        loadUrlCheckboxes(); // Update checkboxes state
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

  // --- Temporary Access Timer Display ---

  function formatRemainingTime(seconds) {
    if (seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function updateTempAccessTimers() {
    chrome.runtime.sendMessage({ type: 'GET_TEMP_ACCESS_STATUS' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting temp access status:", chrome.runtime.lastError);
        tempAccessStatusContainer.style.display = 'none'; // Hide on error
        if (tempAccessTimerInterval) {
           clearTimeout(tempAccessTimerInterval); // Use clearTimeout
           tempAccessTimerInterval = null;
        }
        return;
      }

      if (response && response.temporaryAccess) {
        const grants = response.temporaryAccess;
        const now = Date.now();
        let activeGrantsExist = false;

        tempAccessTimersList.innerHTML = ''; // Clear previous list

        Object.entries(grants).forEach(([url, expiry]) => {
          const remainingSeconds = Math.floor((expiry - now) / 1000);
          if (remainingSeconds > 0) {
            activeGrantsExist = true;
            const li = document.createElement('li');
            li.innerHTML = `
              <span class="url-name" title="${url}">${url}</span>
              <span class="time-left">${formatRemainingTime(remainingSeconds)}</span>
            `;
            tempAccessTimersList.appendChild(li);
          }
        });

        if (activeGrantsExist) {
          tempAccessStatusContainer.style.display = 'block';
          // Clear previous timeout before setting a new one
          if (tempAccessTimerInterval) clearTimeout(tempAccessTimerInterval);
          tempAccessTimerInterval = setTimeout(updateTempAccessTimers, 1000); // Update every second
        } else {
          tempAccessStatusContainer.style.display = 'none';
          if (tempAccessTimerInterval) {
             clearTimeout(tempAccessTimerInterval);
             tempAccessTimerInterval = null;
          }
        }
      } else {
        // No grants or error in response
        tempAccessStatusContainer.style.display = 'none';
         if (tempAccessTimerInterval) {
             clearTimeout(tempAccessTimerInterval);
             tempAccessTimerInterval = null;
          }
      }
    });
  }

  // --- Settings Logic ---

  function formatLockTime(expiryTimestamp) {
    if (!expiryTimestamp || expiryTimestamp <= Date.now()) {
      return '';
    }
    const date = new Date(expiryTimestamp);
    // Use options for clarity, especially year/month/day
    const options = { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return `锁定至 ${date.toLocaleString('zh-CN', options)}`;
  }


  function loadSettings() {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS_STATUS' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.settings) {
        console.error("Error loading settings:", chrome.runtime.lastError || "No response");
        return;
      }
      currentSettings = response.settings;
      const now = Date.now();

      // Disable Copy Setting
      const disableCopyLocked = currentSettings.disableCopyLockExpiry && currentSettings.disableCopyLockExpiry > now;
      disableCopyCheckbox.checked = !!currentSettings.disableCopy;
      disableCopyCheckbox.disabled = disableCopyLocked;
      disableCopyLockInfo.textContent = disableCopyLocked ? formatLockTime(currentSettings.disableCopyLockExpiry) : '';
      applyCopyPrevention(); // Apply based on loaded setting

      // Strict Mode Setting
      const strictModeLocked = currentSettings.strictModeLockExpiry && currentSettings.strictModeLockExpiry > now;
      enableStrictModeCheckbox.checked = !!currentSettings.strictMode;
      enableStrictModeCheckbox.disabled = strictModeLocked;
      strictModeLockInfo.textContent = strictModeLocked ? formatLockTime(currentSettings.strictModeLockExpiry) : '';
    });
  }

  function handleSettingChange(checkbox, settingName, lockInfoElement) {
     const newValue = checkbox.checked;
     // Use the locally stored settings to check current lock status first
     const lockExpiry = currentSettings[`${settingName}LockExpiry`];
     const now = Date.now();

     if (lockExpiry && lockExpiry > now) {
       // Should be disabled, but double-check
       checkbox.checked = !newValue; // Revert UI
       alert(`此设置已锁定，将于 ${formatLockTime(lockExpiry)} 解锁。`);
       return;
     }

     // Confirm enabling (as it locks for 24h)
     if (newValue === true) {
        if (!confirm(`确定要启用此设置吗？启用后将锁定24小时无法关闭。`)) {
            checkbox.checked = false; // Revert UI
            return;
        }
     }

     // Disable checkbox immediately while saving
     checkbox.disabled = true;
     lockInfoElement.textContent = '正在保存...';

     chrome.runtime.sendMessage({ type: 'UPDATE_SETTING', settingName: settingName, value: newValue }, (response) => {
       if (chrome.runtime.lastError || !response || !response.success) {
         console.error("Error saving setting:", chrome.runtime.lastError || response?.error);
         alert('保存设置失败，请重试。');
         // Revert UI on failure and re-enable
         checkbox.checked = !newValue;
         checkbox.disabled = false;
         lockInfoElement.textContent = ''; // Clear saving message
         loadSettings(); // Reload settings to be sure
       } else {
         // Success, update local state and UI from response
         currentSettings = response.settings; // Update local cache
         const newLockExpiry = currentSettings[`${settingName}LockExpiry`];
         const isLocked = newLockExpiry && newLockExpiry > Date.now();

         checkbox.disabled = isLocked; // Set disabled state based on lock
         lockInfoElement.textContent = isLocked ? formatLockTime(newLockExpiry) : '';

         // Apply copy prevention immediately if changed
         if (settingName === 'disableCopy') {
            applyCopyPrevention();
         }
       }
     });
  }

  disableCopyCheckbox.addEventListener('change', () => {
      handleSettingChange(disableCopyCheckbox, 'disableCopy', disableCopyLockInfo);
  });

  enableStrictModeCheckbox.addEventListener('change', () => {
      handleSettingChange(enableStrictModeCheckbox, 'strictMode', strictModeLockInfo);
  });

  // Apply copy prevention to challenge input
  function applyCopyPrevention() {
      const inputField = modalChallengeInput; // Target the correct input
      if (currentSettings.disableCopy) {
          inputField.oncopy = (e) => { e.preventDefault(); return false; };
          inputField.oncut = (e) => { e.preventDefault(); return false; };
          inputField.onpaste = (e) => { e.preventDefault(); return false; };
          // Using CSS is generally preferred for visual indication if needed
          inputField.style.userSelect = 'none';
          inputField.style.webkitUserSelect = 'none'; /* Safari */
          inputField.style.msUserSelect = 'none'; /* IE 10+ */
          // Make it obvious copying is disabled
          inputField.title = '复制功能已禁用';
      } else {
          inputField.oncopy = null;
          inputField.oncut = null;
          inputField.onpaste = null;
          inputField.style.userSelect = 'auto';
          inputField.style.webkitUserSelect = 'auto';
          inputField.style.msUserSelect = 'auto';
          inputField.title = ''; // Clear tooltip
      }
  }

  // --- Bilibili Whitelist Logic ---

  const BILI_WHITELIST_KEY = 'biliUidWhitelist';

  function loadBiliUidWhitelist() {
    chrome.storage.sync.get([BILI_WHITELIST_KEY], function(result) {
      const whitelist = result[BILI_WHITELIST_KEY] || [];
      biliUidList.innerHTML = ''; // Clear current list

      whitelist.forEach(uid => {
        const li = document.createElement('li');
        li.innerHTML = `
          <div class="url-item">
            <span class="url-text">${uid}</span>
            <button class="delete-btn bili-delete-btn" data-uid="${uid}">删除</button>
          </div>
        `;
        biliUidList.appendChild(li);
      });

      // Add event listeners to new delete buttons
      document.querySelectorAll('.bili-delete-btn').forEach(button => {
        button.addEventListener('click', function() {
          const uidToDelete = this.getAttribute('data-uid');
          deleteBiliUid(uidToDelete);
        });
      });
    });
  }

  function addBiliUid() {
    const uid = biliUidInput.value.trim();
    // Basic validation: check if it's a non-empty string of digits
    if (uid && /^\d+$/.test(uid)) {
      chrome.storage.sync.get([BILI_WHITELIST_KEY], function(result) {
        const whitelist = result[BILI_WHITELIST_KEY] || [];
        if (!whitelist.includes(uid)) {
          whitelist.push(uid);
          chrome.storage.sync.set({ [BILI_WHITELIST_KEY]: whitelist }, function() {
            if (chrome.runtime.lastError) {
              console.error("Error saving Bili UID:", chrome.runtime.lastError);
              alert('添加UID失败，请重试。');
            } else {
              loadBiliUidWhitelist(); // Refresh the list
              biliUidInput.value = ''; // Clear input
            }
          });
        } else {
          alert('该UID已在白名单中。');
          biliUidInput.value = '';
        }
      });
    } else {
      alert('请输入有效的B站用户UID（纯数字）。');
    }
  }

  function deleteBiliUid(uidToDelete) {
    chrome.storage.sync.get([BILI_WHITELIST_KEY], function(result) {
      let whitelist = result[BILI_WHITELIST_KEY] || [];
      whitelist = whitelist.filter(uid => uid !== uidToDelete);
      chrome.storage.sync.set({ [BILI_WHITELIST_KEY]: whitelist }, function() {
        if (chrome.runtime.lastError) {
          console.error("Error deleting Bili UID:", chrome.runtime.lastError);
          alert('删除UID失败，请重试。');
        } else {
          loadBiliUidWhitelist(); // Refresh the list
        }
      });
    });
  }

  // Add event listener for the add button
  addBiliUidButton.addEventListener('click', addBiliUid);

  // --- End Bilibili Whitelist Logic ---


  // --- Initialization ---
  loadBlockedUrls();
  loadUrlCheckboxes();
  loadFocusStatus();
  updateTempAccessTimers(); // Initial call to load timers
  loadSettings(); // Load settings on popup open
  loadBiliUidWhitelist(); // Load Bili UIDs on popup open

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

  // --- Temporary Access Modal Logic ---

  // Open Modal
  requestTempAccessBtn.addEventListener('click', () => {
    // Reset modal state
    tempAccessUrlSelect.innerHTML = '<option value="">-- 请选择网址 --</option>';
    challengeSection.style.display = 'none';
    modalChallengeInput.value = '';
    modalStatusMessage.textContent = '';
    modalSubmitChallenge.disabled = true;
    durationSelection.style.display = 'none'; // Hide duration options initially

    // Fetch necessary data: focus URLs, temp access status, and current settings
    Promise.all([
      new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'GET_FOCUS_BLOCKED_URLS' }, response => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(response))),
      new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'GET_TEMP_ACCESS_STATUS' }, response => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(response))),
      new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'GET_SETTINGS_STATUS' }, response => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(response)))
    ]).then(([focusResponse, statusResponse, settingsResponse]) => {
      const focusUrls = (focusResponse && focusResponse.urls) ? focusResponse.urls : [];
      const activeGrants = (statusResponse && statusResponse.temporaryAccess) ? statusResponse.temporaryAccess : {};
      currentSettings = (settingsResponse && settingsResponse.settings) ? settingsResponse.settings : {}; // Update local settings cache
      const now = Date.now();

      // Filter out URLs that have active grants
      let availableUrls = focusUrls.filter(url => {
        const expiry = activeGrants[url];
        return !(expiry && expiry > now);
      });

      // If strict mode is on, further filter based on daily usage (requires another async call)
      if (currentSettings.strictMode && availableUrls.length > 0) {
         Promise.all(availableUrls.map(url =>
           new Promise((resolve) => chrome.runtime.sendMessage({ type: 'CHECK_DAILY_USAGE', url: url }, response => resolve({ url, usedToday: response?.usedToday })))
         )).then(usageResults => {
            availableUrls = usageResults.filter(result => !result.usedToday).map(result => result.url);
            populateModalAndShow(availableUrls);
         });
      } else {
         // Strict mode off or no URLs left after initial filter
         populateModalAndShow(availableUrls);
      }

    }).catch(error => {
       console.error("Error fetching initial modal data:", error);
       alert('无法加载临时访问数据，请稍后再试。');
    });
  });

  // Helper function to populate dropdown and show modal
  function populateModalAndShow(urls) {
      if (urls.length > 0) {
        urls.forEach(url => {
          const option = document.createElement('option');
          option.value = url;
          option.textContent = url;
          tempAccessUrlSelect.appendChild(option);
        });
        tempAccessModal.style.display = 'flex'; // Show modal
      } else {
        alert('当前没有可申请临时访问的受限网址（可能已用完今日次数或无受限网址）。');
      }
  }

  // Close Modal
  closeModalBtn.addEventListener('click', () => {
    tempAccessModal.style.display = 'none';
  });

  // Close modal if clicked outside content
  window.addEventListener('click', (event) => {
    if (event.target === tempAccessModal) {
      tempAccessModal.style.display = 'none';
    }
  });

  // Handle URL selection in modal
  tempAccessUrlSelect.addEventListener('change', () => {
    const selectedUrl = tempAccessUrlSelect.value;
    modalStatusMessage.textContent = ''; // Clear previous status
    modalChallengeInput.value = '';
    challengeSection.style.display = 'none'; // Hide challenge until duration is picked
    modalSubmitChallenge.disabled = true;

    if (!selectedUrl) {
      durationSelection.style.display = 'none'; // Hide duration options if no URL selected
      return;
    }

    // If strict mode is enabled, check daily usage *again* right before showing duration
    // (This is a safety check in case the status changed between opening modal and selecting URL)
    if (currentSettings.strictMode) {
        chrome.runtime.sendMessage({ type: 'CHECK_DAILY_USAGE', url: selectedUrl }, (response) => {
            if (response && response.usedToday) {
                alert(`严格模式：您今天已使用过 ${selectedUrl} 的临时访问权限。`);
                // Reset selection? Or just hide duration?
                tempAccessUrlSelect.value = ''; // Reset dropdown
                durationSelection.style.display = 'none';
            } else {
                // Usage OK, show duration options
                durationSelection.style.display = 'block';
                durationOptions.forEach(radio => radio.checked = false); // Reset radio buttons
            }
        });
    } else {
        // Strict mode not enabled, just show duration options
        durationSelection.style.display = 'block';
        durationOptions.forEach(radio => radio.checked = false); // Reset radio buttons
    }
  });

  // Handle Duration selection in modal
  durationOptions.forEach(radio => {
    radio.addEventListener('change', () => {
      const selectedUrl = tempAccessUrlSelect.value;
      if (!selectedUrl) return; // Should not happen if duration is visible

      selectedDuration = parseInt(radio.value);
      switch(selectedDuration) {
          case 5: selectedChallengeLength = 16; break;
          case 10: selectedChallengeLength = 24; break;
          case 20: selectedChallengeLength = 30; break;
          default: selectedChallengeLength = 30; // Default case
      }

      challengeSection.style.display = 'block';
      modalChallengeString.textContent = '请求挑战码...';
      modalChallengeInput.value = '';
      modalSubmitChallenge.disabled = true; // Disable submit until challenge arrives
      modalStatusMessage.textContent = ''; // Clear status

      // Request challenge for the selected URL and length
      chrome.runtime.sendMessage({
          type: 'GET_ACCESS_CHALLENGE',
          url: selectedUrl,
          length: selectedChallengeLength, // Send desired length
          duration: selectedDuration // Send corresponding duration
        }, (response) => {
        if (chrome.runtime.lastError || !response || !response.challenge) {
          modalChallengeString.textContent = '获取失败';
          modalStatusMessage.textContent = '无法获取挑战码，请重试。';
          modalStatusMessage.className = 'status-message error';
        } else {
          modalChallengeString.textContent = response.challenge;
          modalSubmitChallenge.disabled = false; // Enable submit button
        }
      });
    });
  });

  // Handle challenge submission in modal
  modalSubmitChallenge.addEventListener('click', () => {
    const selectedUrl = tempAccessUrlSelect.value;
    const enteredCode = modalChallengeInput.value.trim();

    if (!selectedUrl || !enteredCode) {
      modalStatusMessage.textContent = '请选择网址并输入挑战码。';
      modalStatusMessage.className = 'status-message error';
      return;
    }

    const selectedDurationRadio = document.querySelector('input[name="tempAccessDuration"]:checked');

    if (!selectedUrl || !enteredCode || !selectedDurationRadio) {
      modalStatusMessage.textContent = '请选择网址、时长并输入挑战码。';
      modalStatusMessage.className = 'status-message error';
      return;
    }

    // Duration is implicitly known by the background script based on what was stored with the challenge
    // No need to send duration again here, just URL and code.

    modalSubmitChallenge.disabled = true;
    modalStatusMessage.textContent = '正在验证...';
    modalStatusMessage.className = 'status-message';

    chrome.runtime.sendMessage({ type: 'VERIFY_ACCESS_CODE', code: enteredCode, url: selectedUrl }, (response) => {
      if (chrome.runtime.lastError || !response) {
         modalStatusMessage.textContent = '验证时出错，请重试。';
         modalStatusMessage.className = 'status-message error';
         modalSubmitChallenge.disabled = false;
      } else if (response.success) {
        // Use the actual granted duration from the response
        const grantedMinutes = response.grantedDuration || selectedDuration; // Fallback just in case
        modalStatusMessage.textContent = `验证成功！您现在可以访问该网站 ${grantedMinutes} 分钟。`;
        modalStatusMessage.className = 'status-message success';
        updateTempAccessTimers(); // Update timers immediately after granting access
        // Optionally close modal after a delay
        setTimeout(() => {
          tempAccessModal.style.display = 'none';
        }, 2500);
      } else {
        modalStatusMessage.textContent = '挑战码错误，请重试。';
        modalStatusMessage.className = 'status-message error';
        modalSubmitChallenge.disabled = false;
        modalChallengeInput.value = '';
        modalChallengeInput.focus();
      }
    });
  });

  // --- End Modal Logic ---


  // 初始化字符计数
  updateCharCount();
});
