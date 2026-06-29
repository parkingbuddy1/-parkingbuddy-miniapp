// 物业端调试页 - 一键诊断云函数问题
const app = getApp();

Page({
  data: {
    logs: [],
    cloudReady: false,
    cloudEnv: '',
    funcList: [],
    testResult: ''
  },

  onLoad() {
    this.checkCloud();
  },

  async checkCloud() {
    const logs = [];
    const addLog = (msg, type = 'info') => {
      logs.push({ msg, type, time: this.formatTime() });
      this.setData({ logs: [...logs] });
    };

    addLog('=== 开始诊断 ===', 'info');

    // 1. 检查 wx.cloud
    if (!wx.cloud) {
      addLog('❌ wx.cloud 不可用', 'error');
      return;
    }
    addLog('✓ wx.cloud 可用', 'success');

    // 2. 检查环境
    const env = 'cloudbase-d2gwr44k8e3e86a0f';
    addLog(`环境: ${env}`, 'info');

    // 3. 列出所有云函数
    try {
      const res = await wx.cloud.callFunction({
        name: 'login',
        data: { action: 'simpleLogin' }
      });
      addLog('✓ login 云函数可调用（车主端）', 'success');
      addLog('返回: ' + JSON.stringify(res.result).substring(0, 100), 'info');
    } catch (e) {
      addLog('❌ login 云函数调用失败: ' + e.message, 'error');
    }

    // 4. 测试 property 云函数
    try {
      addLog('尝试调用 property.propertyLogin...', 'info');
      const res = await wx.cloud.callFunction({
        name: 'property',
        data: {
          action: 'propertyLogin',
          phone: '13800138000',
          password: '123456'
        }
      });
      addLog('✓ property 云函数可调用', 'success');
      addLog('返回: ' + JSON.stringify(res.result).substring(0, 200), 'info');
    } catch (e) {
      addLog('❌ property 云函数调用失败', 'error');
      addLog('错误: ' + e.message, 'error');
      addLog('错误码: ' + e.errCode, 'error');
      addLog('完整: ' + JSON.stringify(e).substring(0, 300), 'error');
    }

    addLog('=== 诊断完成 ===', 'info');
  },

  formatTime() {
    const d = new Date();
    return `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
  },

  clearLogs() {
    this.setData({ logs: [] });
  },

  copyLogs() {
    const text = this.data.logs.map(l => `[${l.time}] ${l.msg}`).join('\n');
    wx.setClipboardData({ data: text });
    wx.showToast({ title: '已复制', icon: 'success' });
  }
});
