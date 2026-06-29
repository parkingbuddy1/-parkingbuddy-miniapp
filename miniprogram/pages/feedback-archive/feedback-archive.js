// 反馈保存箱
const { callFunction } = require('../../utils/auth');

Page({
  data: {
    activeTab: 'adopted',
    adopted: [],
    held: [],
  },

  onShow() { this.loadAll(); },

  async loadAll() {
    try {
      const [adopted, held] = await Promise.all([
        callFunction('feedback', { action: 'listArchived', status: 'adopted' }),
        callFunction('feedback', { action: 'listArchived', status: 'held' }),
      ]);
      this.setData({ adopted: adopted || [], held: held || [] });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onTabChange(e) { this.setData({ activeTab: e.detail.value }); },
});
