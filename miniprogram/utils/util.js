// 通用工具函数

/**
 * 格式化价格（分转元，保留两位小数）
 */
function formatPrice(price) {
  if (typeof price !== 'number') return '0';
  return String(price);
}

/**
 * 格式化日期
 */
function formatDate(date, fmt = 'YYYY-MM-DD') {
  if (!date) return '';
  const d = new Date(date);
  const o = {
    'M+': d.getMonth() + 1,
    'D+': d.getDate(),
    'h+': d.getHours(),
    'm+': d.getMinutes(),
    's+': d.getSeconds(),
  };
  let result = fmt;
  if (/(Y+)/.test(result)) {
    result = result.replace(RegExp.$1, (d.getFullYear() + '').substr(4 - RegExp.$1.length));
  }
  for (let k in o) {
    if (new RegExp('(' + k + ')').test(result)) {
      result = result.replace(RegExp.$1, RegExp.$1.length === 1 ? o[k] : ('00' + o[k]).substr(('' + o[k]).length));
    }
  }
  return result;
}

/**
 * 防抖
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * 节流
 */
function throttle(fn, delay = 300) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= delay) {
      last = now;
      fn.apply(this, args);
    }
  };
}

/**
 * 显示 Toast
 */
function showToast(title, icon = 'none') {
  wx.showToast({ title, icon, duration: 2000 });
}

/**
 * 显示 Loading
 */
function showLoading(title = '加载中...') {
  wx.showLoading({ title, mask: true });
}

/**
 * 隐藏 Loading
 */
function hideLoading() {
  wx.hideLoading();
}

/**
 * 拨打电话
 */
function makePhoneCall(phone) {
  if (!phone) {
    showToast('暂无联系电话');
    return;
  }
  wx.makePhoneCall({ phoneNumber: phone });
}

/**
 * 打开地图导航
 */
function openLocation(latitude, longitude, name, address) {
  wx.openLocation({
    latitude,
    longitude,
    name,
    address,
    scale: 16,
  });
}

/**
 * 获取定位
 */
function getLocation() {
  return new Promise((resolve, reject) => {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => resolve(res),
      fail: (err) => {
        console.error('获取定位失败:', err);
        reject(err);
      },
    });
  });
}

/**
 * 深拷贝
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 生成唯一 ID
 */
function generateId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = {
  formatPrice,
  formatDate,
  debounce,
  throttle,
  showToast,
  showLoading,
  hideLoading,
  makePhoneCall,
  openLocation,
  getLocation,
  deepClone,
  generateId,
};
