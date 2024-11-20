let currentView = 'week';
let chart = null;

// 格式化时间段
function formatTimeRange(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit'
  });
}

// 初始化图表
function initChart(data) {
  const ctx = document.getElementById('statsChart').getContext('2d');
  
  if (chart) {
    chart.destroy();
  }
  
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        label: '访问时长（分钟）',
        data: data.values,
        backgroundColor: 'rgba(0, 122, 255, 0.5)',
        borderColor: 'rgba(0, 122, 255, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

// 格式化时间
function formatDuration(minutes) {
  if (minutes < 1) {
    return '少于1分钟';
  }
  if (minutes < 60) {
    return `${Math.round(minutes)}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return `${hours}小时${remainingMinutes}分钟`;
}

// 更新今日统计
function updateTodayStats(stats) {
  const todayStats = document.getElementById('todayStats');
  const todayTotal = document.getElementById('todayTotal');
  const todayUrlList = document.getElementById('todayUrlList');
  const today = new Date().toISOString().split('T')[0];
  
  // 计算今日总时间
  let totalDuration = 0;
  const urlStats = {};
  
  Object.entries(stats).forEach(([url, visits]) => {
    const todayVisits = visits.filter(v => v.date === today);
    if (todayVisits.length > 0) {
      urlStats[url] = todayVisits.map(v => ({
        duration: v.duration,
        timestamp: v.timestamp
      }));
      totalDuration += todayVisits.reduce((sum, v) => sum + v.duration, 0);
    }
  });
  
  // 显示今日总时间
  todayTotal.textContent = `今日总计: ${formatDuration(totalDuration / 60)}`;
  
  // 显示每个网站的访问详情
  todayUrlList.innerHTML = '';
  Object.entries(urlStats)
    .sort(([, a], [, b]) => 
      b.reduce((sum, v) => sum + v.duration, 0) - 
      a.reduce((sum, v) => sum + v.duration, 0)
    )
    .forEach(([url, visits]) => {
      const totalUrlDuration = visits.reduce((sum, v) => sum + v.duration, 0);
      const div = document.createElement('div');
      div.className = 'url-item';
      
      // 创建访问时间段列表
      const timeBlocks = visits.map(v => 
        `<div class="time-block">${formatTimeRange(v.timestamp)} - ${formatDuration(v.duration / 60)}</div>`
      ).join('');
      
      div.innerHTML = `
        <div class="url">${url}
          <div class="time-blocks">${timeBlocks}</div>
        </div>
        <div class="time">${formatDuration(totalUrlDuration / 60)}</div>
      `;
      todayUrlList.appendChild(div);
    });
}

// 更新URL统计列表
function updateUrlStats(urlStats) {
  const container = document.getElementById('urlStatsList');
  container.innerHTML = '';
  
  Object.entries(urlStats)
    .sort(([, a], [, b]) => b - a)
    .forEach(([url, duration]) => {
      const div = document.createElement('div');
      div.className = 'url-item';
      div.innerHTML = `
        <span>${url}</span>
        <span>${formatDuration(duration)}</span>
      `;
      container.appendChild(div);
    });
}

// 加载统计数据
function loadStats(view) {
  chrome.storage.local.get(['visitStats'], function(result) {
    const stats = result.visitStats || {};
    const now = new Date();
    const data = {labels: [], values: []};
    const urlStats = {};
    
    // 显示/隐藏相关区域
    const todayStats = document.getElementById('todayStats');
    const chartContainer = document.querySelector('.chart-container');
    const urlStatsSection = document.querySelector('.url-stats');
    
    todayStats.style.display = view === 'today' ? 'block' : 'none';
    chartContainer.style.display = view === 'today' ? 'none' : 'block';
    urlStatsSection.style.display = view === 'today' ? 'none' : 'block';
    
    if (view === 'today') {
      updateTodayStats(stats);
      return;
    }
    
    switch(view) {
      case 'week':
        // 保持原有的周视图代码
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          data.labels.push(dateStr);
          
          let dailyTotal = 0;
          Object.entries(stats).forEach(([url, visits]) => {
            const dayVisits = visits.filter(v => v.date.startsWith(dateStr));
            const duration = dayVisits.reduce((sum, v) => sum + v.duration, 0);
            dailyTotal += duration;
            urlStats[url] = (urlStats[url] || 0) + duration;
          });
          
          data.values.push(dailyTotal / 60);
        }
        break;
        
      // 可以添加月视图和年视图的实现
    }
    
    initChart(data);
    updateUrlStats(urlStats);
  });
}

// 事件监听
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentView = this.dataset.view;
      loadStats(currentView);
    });
  });
  
  loadStats('week');
}); 