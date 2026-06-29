// 物业端首页 - 数据看板
const app = getApp();

Page({
  data: {
    statusBarHeight: 0,
    property: null,
    selectedLotIndex: 0,
    lots: [],           // 该物业管理的停车场
    dashboard: null,    // 当前看板数据
    loading: true,
    refreshing: false
  },

  onLoad() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight || 20 });
    this.loadProperty();
  },

  onShow() {
    if (this.data.lots.length > 0) {
      this.loadDashboard();
    }
  },

  onPullDownRefresh() {
    this.loadDashboard().then(() => wx.stopPullDownRefresh());
  },

  loadProperty() {
    const property = wx.getStorageSync('propertyInfo');
    if (!property) {
      wx.reLaunch({ url: '/pages-property/login/login' });
      return;
    }
    this.setData({ property });
    // 加载该物业管理的停车场列表
    this.loadLots();
  },

  async loadLots() {
    const property = this.data.property;
    if (!property.managedLots || property.managedLots.length === 0) {
      this.setData({ loading: false });
      return;
    }
    try {
      const db = wx.cloud.database();
      const res = await db.collection('parking_lots')
        .where({ _id: db.command.in(property.managedLots) })
        .get();
      this.setData({ lots: res.data, loading: false });
      if (res.data.length > 0) this.loadDashboard();
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  async loadDashboard() {
    if (this.data.lots.length === 0) return;
    const property = this.data.property;
    const lot = this.data.lots[this.data.selectedLotIndex];
    this.setData({ refreshing: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'property',
        data: {
          action: 'dashboard',
          token: property.token,
          parkingId: lot._id
        }
      });
      if (res.result.code === 0) {
        this.setData({ dashboard: res.result.data, refreshing: false });
      } else {
        this.setData({ refreshing: false });
        wx.showToast({ title: res.result.message, icon: 'none' });
      }
    } catch (e) {
      this.setData({ refreshing: false });
    }
  },

  selectLot(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ selectedLotIndex: index, dashboard: null });
    this.loadDashboard();
  },

  async toggleShared() {
    const d = this.data.dashboard;
    if (!d) return;
    const property = this.data.property;
    try {
      const res = await wx.cloud.callFunction({
        name: 'property',
        data: {
          action: 'sharedToggle',
          token: property.token,
          parkingId: d.parkingInfo._id,
          enabled: !d.sharedEnabled
        }
      });
      if (res.result.code === 0) {
        wx.showToast({ title: res.result.data.message, icon: 'success' });
        this.loadDashboard();
      }
    } catch (e) {}
  },

  goPage(e) {
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({ url });
  },

  logout() {
    wx.showModal({
      title: '确认退出', content: '确定要退出登录吗？',
      success: (r) => {
        if (r.confirm) {
          wx.removeStorageSync('propertyToken');
          wx.removeStorageSync('propertyInfo');
          app.globalData.propertyToken = null;
          app.globalData.propertyInfo = null;
          wx.reLaunch({ url: '/pages-property/login/login' });
        }
      }
    });
  }
});
