// 用户反馈管理页
const { callFunction } = require('../../utils/auth');

Page({
  data: {
    list: [],
    showHoldDialog: false,
    holdReason: '',
    currentId: '',
  },

  onShow() { this.loadList(); },

  async loadList() {
    try {
      const data = await callFunction('feedback', { action: 'listNew' });
      this.setData({ list: data || [] });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async onAdopt(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await callFunction('feedback', { action: 'adopt', feedbackId: id });
      wx.showToast({ title: '已采纳，券已发放', icon: 'success' });
      this.loadList();
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  onHold(e) {
    this.setData({ showHoldDialog: true, currentId: e.currentTarget.dataset.id, holdReason: '' });
  },
  onHoldConfirm() {
    if (!this.data.holdReason.trim()) {
      wx.showToast({ title: '请输入暂存理由', icon: 'none' });
      return;
    }
    this.doHold();
  },
  onHoldCancel() { this.setData({ showHoldDialog: false }); },
  onHoldReasonInput(e) { this.setData({ holdReason: e.detail.value }); },

  async doHold() {
    try {
      await callFunction('feedback', {
        action: 'hold',
        feedbackId: this.data.currentId,
        reason: this.data.holdReason.trim(),
      });
      wx.showToast({ title: '已暂存', icon: 'success' });
      this.setData({ showHoldDialog: false });
      this.loadList();
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async onReject(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认废除',
      content: '确定要删除这条留言吗？此操作不可恢复。',
      confirmColor: '#EF4444',
      success: async (r) => {
        if (r.confirm) {
          try {
            await callFunction('feedback', { action: 'reject', feedbackId: id });
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadList();
          } catch (e) {
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      },
    });
  },
});
