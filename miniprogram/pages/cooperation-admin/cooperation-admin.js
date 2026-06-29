// 商务合作管理页（管理员）
const { callFunction } = require('../../utils/auth');

Page({
  data: {
    list: [],
    loading: true,
  },

  onShow() { this.loadList(); },

  async loadList() {
    this.setData({ loading: true });
    try {
      const data = await callFunction('cooperation', { action: 'list' });
      this.setData({ list: data || [] });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 标记已查看
  async onView(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await callFunction('cooperation', { action: 'view', submissionId: id });
      const newList = this.data.list.map(s =>
        s._id === id ? { ...s, viewed: true } : s
      );
      this.setData({ list: newList });
      wx.showToast({ title: '已查看，用户已收到通知', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});
