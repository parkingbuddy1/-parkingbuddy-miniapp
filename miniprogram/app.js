// 粤停汇 - 停车比价AI助手
// 粤停汇科技

App({
  onLaunch(options) {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      env: 'cloudbase-d2gwr44k8e3e86a0f',
      traceUser: true,
      timeout: 120000,
    });

    // 获取用户登录状态
    this.checkLoginStatus();

    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = systemInfo;
    this.globalData.statusBarHeight = systemInfo.statusBarHeight;
    this.globalData.navBarHeight = systemInfo.platform === 'ios' ? 44 : 48;
    this.globalData.screenWidth = systemInfo.screenWidth;
    this.globalData.screenHeight = systemInfo.screenHeight;

    // 临时调试：长按 logo 进入物业端（仅开发阶段使用）
    if (options && options.query && options.query.property === '1') {
      setTimeout(() => {
        wx.reLaunch({ url: '/pages-property/login/login' });
      }, 100);
    }
  },

  onShow(options) {
    // 小程序切到前台
    console.log('粤停汇 onShow', options.scene);
  },

  onHide() {
    // 小程序切到后台
  },

  // 检查登录状态
  async checkLoginStatus() {
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    if (token && userInfo) {
      this.globalData.isLogin = true;
      this.globalData.userInfo = userInfo;
      this.globalData.token = token;
    } else {
      this.globalData.isLogin = false;
    }
  },

  // 全局数据
  globalData: {
    isLogin: false,
    userInfo: null,
    token: null,
    // 物业端数据
    propertyToken: null,
    propertyInfo: null,
    systemInfo: null,
    statusBarHeight: 0,
    navBarHeight: 44,
    screenWidth: 375,
    screenHeight: 667,
    currentParking: null, // 首页传入的停车场数据
    // 环境配置
    env: 'dev', // dev | prod
  },
});
