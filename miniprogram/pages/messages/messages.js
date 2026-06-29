// 站内消息页
const { callFunction } = require('../../utils/auth');

const TYPE_MAP = {
  coupon_received: { icon: '🎁', label: '优惠券' },
  admin_reply:    { icon: '💬', label: '回复' },
  system:         { icon: '📢', label: '系统' },
};

Page({
  data: {
    list: [],
    loading: true,
    hasUnread: false,
    editMode: false,     // 编辑模式
    selectedIds: [],     // 已选消息ID
  },

  onShow() { this.loadMessages(); },

  async onPullDownRefresh() {
    await this.loadMessages();
    wx.stopPullDownRefresh();
  },

  async loadMessages() {
    this.setData({ loading: true });
    try {
      const data = await callFunction('notification', { action: 'myList' });
      const mapped = (data || []).map(m => ({
        ...m,
        _icon: (TYPE_MAP[m.type] || {}).icon || '📌',
        _label: (TYPE_MAP[m.type] || {}).label || '通知',
        _time: fmtTime(m.createdAt),
      }));
      this.setData({
        list: mapped,
        hasUnread: mapped.some(m => !m.read),
      });
    } catch (e) {
      console.error('加载消息失败', e);
      this.setData({ list: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  // ====== 编辑模式 ======
  onToggleEdit() {
    if (this.data.editMode) {
      this.setData({ editMode: false, selectedIds: [] });
    } else {
      this.setData({ editMode: true, selectedIds: [] });
    }
  },

  onToggleSelect(e) {
    if (!this.data.editMode) return;
    const id = e.currentTarget.dataset.id;
    const list = this.data.list;
    let sel = [...this.data.selectedIds];
    const itemIdx = list.findIndex(m => m._id === id);
    const selIdx = sel.indexOf(id);
    if (selIdx > -1) {
      sel.splice(selIdx, 1);
      if (itemIdx > -1) list[itemIdx] = { ...list[itemIdx], _selected: false };
    } else {
      sel.push(id);
      if (itemIdx > -1) list[itemIdx] = { ...list[itemIdx], _selected: true };
    }
    this.setData({ selectedIds: sel, list });
  },

  // ====== 批量删除 ======
  async onBatchDelete() {
    const ids = this.data.selectedIds;
    if (ids.length === 0) {
      wx.showToast({ title: '请选择要删除的消息', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认删除',
      content: `确定删除 ${ids.length} 条消息吗？`,
      confirmColor: '#EF4444',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await callFunction('notification', { action: 'batchDelete', ids });
          const newList = this.data.list.filter(m => !ids.includes(m._id));
          this.setData({
            list: newList,
            editMode: false,
            selectedIds: [],
            hasUnread: newList.some(m => !m.read),
          });
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (e) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  // ====== 侧滑删除 ======
  async onSwipeDelete(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await callFunction('notification', { action: 'delete', notificationId: id });
      const newList = this.data.list.filter(m => m._id !== id);
      this.setData({ list: newList, hasUnread: newList.some(m => !m.read) });
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  async onTapMessage(e) {
    // 编辑模式下点击 = 勾选/取消
    if (this.data.editMode) {
      this.onToggleSelect(e);
      return;
    }

    const idx = e.currentTarget.dataset.index;
    const msg = this.data.list[idx];
    if (!msg) return;

    // 标记已读
    if (!msg.read) {
      try {
        await callFunction('notification', {
          action: 'read',
          notificationId: msg._id,
        });
        const newList = [...this.data.list];
        newList[idx] = { ...newList[idx], read: true };
        this.setData({ list: newList, hasUnread: newList.some(m => !m.read) });
      } catch (e) { /* 忽略 */ }
    }

    // 点击详情：优惠券 → 跳转优惠券页
    if (msg.type === 'coupon_received') {
      wx.navigateTo({ url: '/pages/coupons/coupons' });
      return;
    }
    // 其他类型展示弹窗
    wx.showModal({
      title: msg.title,
      content: msg.content,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#1A56DB',
    });
  },

  async onReadAll() {
    try {
      await callFunction('notification', { action: 'readAll' });
      const newList = this.data.list.map(m => ({ ...m, read: true }));
      this.setData({ list: newList, hasUnread: false });
      wx.showToast({ title: '已全部标为已读', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});

function fmtTime(t) {
  if (!t) return '';
  const d = new Date(t);
  const now = new Date();
  const diff = now - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hour = Math.floor(diff / 3600000);
  if (hour < 24) return `${hour}小时前`;
  const day = Math.floor(diff / 86400000);
  if (day < 7) return `${day}天前`;
  const M = d.getMonth() + 1;
  const D = d.getDate();
  return `${M}月${D}日`;
}
