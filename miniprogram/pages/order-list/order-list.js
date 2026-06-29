// 订单列表 v3 - 修复全选/删除
const { getOrderList } = require('../../utils/request');
const { formatDate, formatPrice, showToast } = require('../../utils/util');
const { callFunction } = require('../../utils/auth');

const STATUS_MAP = {
  pending: { text: '待支付', theme: 'warning' },
  paid: { text: '已支付', theme: 'primary' },
  done: { text: '已完成', theme: 'success' },
  cancelled: { text: '已取消', theme: 'default' },
};

Page({
  data: {
    activeTab: 'all',
    orders: [],
    editMode: false,
    selectedIds: [],
    allSelected: false,
  },

  onShow() {
    this.setData({ editMode: false, selectedIds: [], allSelected: false });
    this.loadOrders();
  },

  onTabChange(e) {
    this.setData({ activeTab: e.detail.value, editMode: false, selectedIds: [], allSelected: false });
    this.loadOrders();
  },

  async loadOrders() {
    wx.showLoading({ title: '加载中...' });
    const { activeTab } = this.data;
    const status = activeTab === 'all' ? '' : activeTab;
    try {
      const orders = await getOrderList(1, status);
      const formatted = (orders || []).map((order) => ({
        ...order,
        id: order._id, // 显式复制 _id 为 id，确保 data-id 可用
        statusText: STATUS_MAP[order.status]?.text || order.status,
        statusTheme: STATUS_MAP[order.status]?.theme || 'default',
        createTimeText: formatDate(order.createTime, 'YYYY-MM-DD hh:mm'),
        finalPrice: formatPrice(order.finalPrice || order.totalPrice),
      }));
      this.setData({ orders: formatted });
    } catch (err) {
      console.error('加载订单失败:', err);
    }
    wx.hideLoading();
  },

  onTapOrder(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;

    if (this.data.editMode) {
      this.toggleSelect(id);
      return;
    }
    wx.navigateTo({ url: `/pages/order/order?orderId=${id}` });
  },

  // ====== 编辑模式 ======

  onLongPressOrder(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.vibrateShort({ type: 'medium' });
    this.setData({ editMode: true, selectedIds: [id] });
    this.syncAllSelected();
  },

  toggleSelect(id) {
    if (!id) return;
    let selectedIds = [...this.data.selectedIds];
    const idx = selectedIds.indexOf(id);
    if (idx > -1) {
      selectedIds.splice(idx, 1);
    } else {
      selectedIds.push(id);
    }
    this.setData({ selectedIds });
    this.syncAllSelected();
  },

  // 全选 / 取消全选
  onSelectAll() {
    const isAllSelected = this.data.selectedIds.length === this.data.orders.length && this.data.orders.length > 0;
    if (isAllSelected) {
      this.setData({ selectedIds: [], allSelected: false });
    } else {
      const ids = this.data.orders.map(o => o.id || o._id).filter(Boolean);
      this.setData({ selectedIds: ids, allSelected: true });
    }
  },

  syncAllSelected() {
    const all = this.data.orders.length > 0 && this.data.selectedIds.length === this.data.orders.length;
    if (this.data.allSelected !== all) {
      this.setData({ allSelected: all });
    }
  },

  onExitEditMode() {
    this.setData({ editMode: false, selectedIds: [], allSelected: false });
  },

  // 批量删除
  onBatchDelete() {
    if (this.data.selectedIds.length === 0) {
      showToast('请选择要删除的订单');
      return;
    }
    wx.showModal({
      title: '确认删除',
      content: `确定删除选中的 ${this.data.selectedIds.length} 个订单吗？此操作不可恢复。`,
      confirmText: '删除',
      confirmColor: '#FF4444',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        let failCount = 0;
        for (const id of this.data.selectedIds) {
          try {
            await callFunction('order', { action: 'delete', orderId: id });
          } catch (e) {
            failCount++;
            console.error('删除订单失败:', id, e);
          }
        }
        wx.hideLoading();
        if (failCount === 0) {
          showToast(`已删除 ${this.data.selectedIds.length} 个订单`);
        } else {
          showToast(`删除完成，${failCount} 个失败`);
        }
        this.setData({ editMode: false, selectedIds: [], allSelected: false });
        this.loadOrders();
      },
    });
  },
});
