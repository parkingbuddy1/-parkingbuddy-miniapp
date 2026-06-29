const { callFunction } = require('../../utils/auth');

Page({
  data: {
    list: [],
    loading: true,
    filter: 'all', // all / pending / verified / rejected
    expandedId: '',
  },

  onLoad() {
    this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const { filter } = this.data;
      const data = await callFunction('user', {
        action: 'listVerifications',
        status: filter === 'all' ? '' : filter,
      });
      this.setData({ list: data || [], loading: false });
      if (!data || data.length === 0) {
        wx.showToast({ title: '暂无审核记录', icon: 'none' });
      }
    } catch (e) {
      console.error('加载审核列表失败:', e);
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  onFilter(e) {
    const f = e.currentTarget.dataset.filter;
    this.setData({ filter: f }, () => this.loadList());
  },

  onToggle(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? '' : id });
  },

  async onApprove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认通过',
      content: '确定要通过该认证申请吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await callFunction('user', { action: 'review', verifyId: id, approved: true, reviewer: 'admin' });
          wx.showToast({ title: '已通过', icon: 'success' });
          this.loadList();
        } catch (err) {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },

  async onReject(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认驳回',
      content: '确定要驳回该认证申请吗？用户将收到驳回通知',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await callFunction('user', { action: 'review', verifyId: id, approved: false, reviewer: 'admin' });
          wx.showToast({ title: '已驳回', icon: 'none' });
          this.loadList();
        } catch (err) {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },

  goBack() {
    wx.navigateBack();
  },

  onPreviewImage(e) {
    const fileID = e.currentTarget.dataset.id;
    if (!fileID) return;
    wx.cloud.downloadFile({ fileID }).then(res => {
      wx.previewImage({ urls: [res.tempFilePath] });
    }).catch(() => {
      wx.showToast({ title: '图片加载失败', icon: 'none' });
    });
  },
});
