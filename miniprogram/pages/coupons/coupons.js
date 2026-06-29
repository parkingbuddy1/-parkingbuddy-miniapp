// 优惠券页 v2
const app = getApp();
const { getMyCoupons, getShareCoupon } = require('../../utils/request');

Page({
  data: {
    activeTab: 'valid', coupons: [], mode: 'view',
    shareCount: 0, earnedCoupons: 0,
  },

  onLoad(options) {
    if (options.mode === 'select') this.setData({ mode: 'select' });
    // 检测是否是分享进来的
    if (options.shareCode) this.receiveShareCoupon(options.shareCode);
    this.loadCoupons();
  },

  onShow() { this.loadCoupons(); },

  onTabChange(e) {
    this.setData({ activeTab: e.detail.value });
    this.loadCoupons();
  },

  async loadCoupons() {
    try {
      // 先尝试云函数加载
      const coupons = await getMyCoupons(this.data.activeTab);
      // 同时合并本地存储的优惠券（来自车辆认证等）
      const localCoupons = wx.getStorageSync('coupons') || [];
      const allCoupons = [...(coupons || []), ...localCoupons];
      // 按状态过滤
      const filtered = allCoupons.filter(c => c.status === this.data.activeTab);
      this.setData({ coupons: filtered || [] });
      const earned = allCoupons.filter(c => c.fromShare || c.type === 'cert').length;
      this.setData({ earnedCoupons: earned });
    } catch (err) {
      // 云函数失败时仅加载本地
      const localCoupons = wx.getStorageSync('coupons') || [];
      const filtered = localCoupons.filter(c => c.status === this.data.activeTab);
      this.setData({ coupons: filtered });
    }
  },

  // 分享优惠券（瑞幸模式）
  onShareCoupon() {
    const openid = app.globalData.userInfo?.openid || wx.getStorageSync('openid') || 'share';
    const couponId = 'coupon_default';
    const shareCode = `${openid}_${couponId}`;
    wx.setStorageSync('shareCode', shareCode);

    wx.showModal({
      title: '分享给微信好友',
      content: '好友通过你的分享下单后，双方各得一张30元停车抵扣券',
      confirmText: '去分享',
      success: (res) => {
        if (res.confirm) {
          // 记录分享意愿
          this.setData({ shareCount: this.data.shareCount + 1 });
          wx.showToast({ title: '请点击右上角分享', icon: 'none', duration: 2000 });
        }
      },
    });
  },

  // 接收分享的优惠券
  async receiveShareCoupon(shareCode) {
    try {
      const result = await getShareCoupon(shareCode);
      if (result) {
        wx.showToast({ title: '恭喜获得30元优惠券！', icon: 'success' });
        this.loadCoupons();
      }
    } catch (err) {
      wx.showToast({ title: '优惠券已领取或已过期', icon: 'none' });
    }
  },

  onSelectCoupon(e) {
    const pages = getCurrentPages();
    const prev = pages[pages.length - 2];
    if (prev) {
      const id = e.detail.id;
      const coupon = this.data.coupons.find(c => c._id === id || c.id === id);
      if (coupon) {
        prev.setData({ selectedCoupon: coupon }, () => {
          prev.calc();
        });
      }
    }
    wx.navigateBack();
  },

  // 分享配置（自动生成分享码）
  onShareAppMessage() {
    const openid = app.globalData.userInfo?.openid || wx.getStorageSync('openid') || 'share';
    return {
      title: '送你30元停车券！快来粤停汇省钱停车',
      path: `/pages/coupons/coupons?shareCode=${openid}_coupon_default`,
      imageUrl: '/images/logo-share.png',
    };
  },
});
