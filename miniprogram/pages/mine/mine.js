// 个人中心
const app = getApp();
const { login, getUserProfile, callFunction } = require('../../utils/auth');
const { getMyFavorites } = require('../../utils/request');

Page({
  data: {
    isLogin: false,
    userInfo: null,
    profileStatus: '待填写',
    verifyStatus: '未认证',
    isAdmin: false,
    stats: { orderCount: 0, couponCount: 0, favoriteCount: 0 },
  },

  onShow() {
    this.updateLoginState();
    this.loadStats();
    this.checkAdmin();
    this.checkVerifyStatus();
    const vehicles = wx.getStorageSync('vehicles') || [];
    this.setData({ profileStatus: vehicles.length > 0 ? `${vehicles.length}辆车` : '待填写' });
  },

  updateLoginState() {
    const { isLogin, userInfo } = app.globalData;
    this.setData({ isLogin, userInfo });
  },

  async checkVerifyStatus() {
    try {
      const data = await callFunction('user', { action: 'status' });
      if (data && data.verified) {
        this.setData({ verifyStatus: '已认证' });
      } else {
        this.setData({ verifyStatus: '未认证' });
      }
    } catch (e) {
      this.setData({ verifyStatus: '未认证' });
    }
  },

  // 刷新微信头像昵称
  async onRefreshProfile() {
    try {
      const userInfo = await getUserProfile();
      app.globalData.userInfo = { ...app.globalData.userInfo, ...userInfo };
      wx.setStorageSync('userInfo', app.globalData.userInfo);
      this.setData({ userInfo: app.globalData.userInfo });
      wx.showToast({ title: '已同步微信资料', icon: 'success' });
    } catch (e) {
      if (e.errMsg && e.errMsg.includes('cancel')) {
        // 用户取消授权，静默
      } else {
        // wx.getUserProfile 在新版本微信中可能被限制，尝试 getUserInfo
        wx.getUserInfo({
          success: (res) => {
            const ui = res.userInfo;
            app.globalData.userInfo = { ...app.globalData.userInfo, nickName: ui.nickName, avatarUrl: ui.avatarUrl };
            wx.setStorageSync('userInfo', app.globalData.userInfo);
            this.setData({ userInfo: app.globalData.userInfo });
            wx.showToast({ title: '已同步微信资料', icon: 'success' });
          },
          fail: () => wx.showToast({ title: '需在弹窗中授权', icon: 'none' })
        });
      }
    }
  },

  async loadStats() {
    try {
      const favorites = await getMyFavorites();
      this.setData({ 'stats.favoriteCount': favorites ? favorites.length : 0 });
    } catch (err) {}

    // 统计优惠券（本地 + 云函数）
    let count = 0;
    try {
      const localCoupons = wx.getStorageSync('coupons') || [];
      count += localCoupons.filter(c => c.status === 'valid').length;
    } catch (e) {}
    try {
      const { getMyCoupons } = require('../../utils/request');
      const cloudCoupons = await getMyCoupons('valid');
      count += (cloudCoupons || []).length;
    } catch (e) {}
    this.setData({ 'stats.couponCount': count });
  },

  // ====== 手机号一键登录（实名认证） ======
  async onGetPhoneNumber(e) {
    if (!e.detail.iv || !e.detail.encryptedData) {
      // 用户拒绝授权手机号
      wx.showToast({ title: '需要手机号才能使用', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '实名认证中...' });

      // 1. 先 wx.login 获取 code
      const { code } = await wx.login();

      // 2. 调用云函数完成手机号解密 + 登录
      const res = await wx.cloud.callFunction({
        name: 'login',
        data: {
          action: 'phoneLogin',
          code,
          iv: e.detail.iv,
          encryptedData: e.detail.encryptedData,
        },
      });

      wx.hideLoading();

      if (res.result && res.result.code === 0) {
        const { token, userInfo } = res.result.data;
        wx.setStorageSync('token', token);
        app.globalData.token = token;
        app.globalData.isLogin = true;
        app.globalData.userInfo = userInfo;
        this.setData({ isLogin: true, userInfo });
        wx.showToast({ title: '实名认证成功', icon: 'success' });
      } else {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('手机号登录失败:', err);
      wx.showToast({ title: '登录失败', icon: 'none' });
    }
  },

  onTapOrders() {
    wx.navigateTo({ url: '/pages/order-list/order-list' });
  },
  onTapCoupons() {
    wx.navigateTo({ url: '/pages/coupons/coupons' });
  },
  onTapFavorites() {
    wx.navigateTo({ url: '/pages/favorites/favorites' });
  },
  onTapReviews() {
    wx.showToast({ title: '评价功能开发中', icon: 'none' });
  },
  onTapVerify() {
    wx.navigateTo({ url: '/pages/verify/verify' });
  },
  async checkAdmin() {
    try {
      const { callFunction } = require('../../utils/auth');
      const data = await callFunction('user', { action: 'isAdmin' });
      this.setData({ isAdmin: !!(data && data.isAdmin) });
    } catch (e) {
      this.setData({ isAdmin: false });
    }
  },
  onTapAdmin() {
    wx.navigateTo({ url: '/pages/admin-review/admin-review' });
  },
  onTapFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },
  onTapFeedbackAdmin() {
    wx.navigateTo({ url: '/pages/feedback-admin/feedback-admin' });
  },
  onTapFeedbackArchive() {
    wx.navigateTo({ url: '/pages/feedback-archive/feedback-archive' });
  },
  onTapCooperationAdmin() {
    wx.navigateTo({ url: '/pages/cooperation-admin/cooperation-admin' });
  },
  onTapProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },
  onTapInvoice() {
    wx.showToast({ title: '发票功能开发中', icon: 'none' });
  },
  onTapAbout() {
    wx.showModal({
      title: '关于 粤停汇',
      content: '粤停汇科技出品\n专注停车月卡资源整合\n让停车更省心、更省钱',
      showCancel: false,
    });
  },
  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '退出后需重新登录',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          app.globalData.isLogin = false;
          app.globalData.userInfo = null;
          app.globalData.token = null;
          this.setData({ isLogin: false, userInfo: null });
        }
      },
    });
  },
});
