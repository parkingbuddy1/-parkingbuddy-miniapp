// 详情页 v5 - 适配月卡/次卡双数据源
const app = getApp();
const { getParkingDetail, toggleFavorite, getPins } = require('../../utils/request');
const { showToast } = require('../../utils/util');
const { login } = require('../../utils/auth');

Page({
  data: {
    parkingId: '', parking: {}, packages: [], recommendPackages: [],
    isFavorite: false, loading: true, cardType: 'monthly',
    statusBarHeight: app.globalData.statusBarHeight || 44,
    pinList: [],
    mapCenter: { lat: 22.5431, lng: 114.0579 },
    mapMarkers: [],
    selPkgIdx: 0,  // 当前选中的套餐索引
  },

  onLoad(options) {
    const type = options.type || 'monthly';
    this.setData({ parkingId: options.id, cardType: type });
    this.loadDetail(options.id);
    this.loadPinList();
  },

  async loadDetail(id) {
    try {
      // 优先使用首页传入的全局数据
      const cached = app.globalData.currentParking;
      if (cached && cached._id === id) {
        this.setData({
          parking: cached,
          packages: cached.packages || [],
          loading: false,
        });
        // 计算最低价（如果数据中没有的话）
        if (!cached.minPrice && cached.packages) {
          const prices = cached.packages.map(p => p.price || 0).filter(p => p > 0);
          if (prices.length) cached.minPrice = Math.min(...prices);
        }
        this.setupMap(cached);
        return;
      }
      // 回退：云函数查询
      const data = await getParkingDetail(id);
      if (!data) throw new Error('数据为空');
      const parking = data.parking || data || {};
      // 计算最低价（如果没有的话）
      if (!parking.minPrice && parking.packages) {
        const prices = (parking.packages || []).map(p => p.price || 0).filter(p => p > 0);
        if (prices.length) parking.minPrice = Math.min(...prices);
      }
      this.setData({
        parking,
        packages: data.packages || parking.packages || [],
        recommendPackages: data.recommendPackages || [],
        isFavorite: data.isFavorite || false,
        loading: false,
      });
      this.setupMap(parking);
    } catch (err) { showToast('加载失败'); this.setData({ loading: false }); }
  },

  // 设置地图中心和标记
  setupMap(parking) {
    // 获取坐标：兼容原始字段(latitude/longitude)和缩略字段(la/lo)
    const lat = parking.latitude || parking.la || 22.5431;
    const lng = parking.longitude || parking.lo || 114.0579;
    const name = parking.name || parking.na || '停车场';
    const address = parking.address || parking.ad || '';

    this.setData({
      mapCenter: { lat, lng },
      mapMarkers: [{
        id: 1,
        latitude: lat,
        longitude: lng,
        title: name,
        callout: { content: name, fontSize: 14, padding: 10, borderRadius: 8, display: 'BYCLICK', color: '#1A56DB', bgColor: '#FFFFFF' },
        anchor: { x: 0.5, y: 1 }
      }]
    });
  },

  async loadPinList() {
    try {
      const res = await getPins(this.data.parkingId);
      if (res && res.pins && res.pins.length > 0) {
        this.setData({ pinList: res.pins });
      } else {
        this.setData({ pinList: [] });
      }
    } catch (err) {
      console.log('加载拼团列表失败:', err);
      this.setData({ pinList: [] });
    }
  },

  onBack() { wx.navigateBack(); },

  // 点击地图标记或地图本身 → 直接打开微信地图
  onMapMarkerTap() {
    const p = this.data.parking;
    const lat = p.latitude || p.la || 22.5431;
    const lng = p.longitude || p.lo || 114.0579;
    wx.openLocation({
      latitude: lat, longitude: lng,
      name: p.name || '', address: p.address || '',
      scale: 16,
      fail: (err) => {
        wx.showModal({
          title: '地图打开失败',
          content: '该停车场暂无精确坐标，是否复制地址手动搜索？',
          confirmText: '复制地址',
          success: (r) => {
            if (r.confirm) wx.setClipboardData({ data: p.address || p.name });
          }
        });
      }
    });
  },

  // ActionSheet导航（高德/百度/车机/复制）
  onOpenLocation() {
    const p = this.data.parking;
    // 确保有有效坐标（优先使用真实坐标，兜底常见深圳坐标）
    const lat = p.latitude || p.lat || 22.5431;
    const lng = p.longitude || p.lng || 114.0579;
    const name = encodeURIComponent(p.name || '');
    const addr = encodeURIComponent(p.address || '');

    wx.showActionSheet({
      itemList: ['🗺️ 微信地图', '📍 高德地图', '🗺 百度地图', '📱 发送到车机', '📋 复制地址'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0: // 微信地图：使用内置 openLocation，自动适配系统地图
            wx.openLocation({
              latitude: lat, longitude: lng,
              name: p.name || '', address: p.address || '',
              scale: 16,
              fail: (err) => {
                // 坐标无效时给出提示
                wx.showModal({
                  title: '地图打开失败',
                  content: `该停车场暂无精确坐标，是否复制地址手动搜索？\n\n错误: ${err.errMsg}`,
                  confirmText: '复制地址',
                  success: (r) => {
                    if (r.confirm) wx.setClipboardData({ data: p.address || p.name });
                  }
                });
              }
            });
            break;
          case 1: // 高德地图 - 通过URL Scheme跳转
            wx.setClipboardData({
              data: `${p.name} ${p.address}`,
              success: () => {
                // 尝试打开高德地图App
                wx.navigateToMiniProgram({
                  appId: 'wx65cc950f42e8fff1', // 高德地图小程序AppId
                  path: `pages/routePlan/index?endPoint={"name":"${name}","longitude":${lng},"latitude":${lat}}`,
                  fail: () => {
                    // 小程序打不开时用H5兜底
                    wx.showModal({
                      title: '导航提示',
                      content: '地址已复制到剪贴板，请打开高德地图粘贴搜索',
                      confirmText: '知道了',
                      showCancel: false
                    });
                  }
                });
              }
            });
            break;
          case 2: // 百度地图 - 通过URL Scheme跳转
            wx.setClipboardData({
              data: `${p.name} ${p.address}`,
              success: () => {
                wx.navigateToMiniProgram({
                  appId: 'wx7643d5f831302ab0', // 百度地图小程序AppId
                  path: `pages/routeplan/routeplan?type=drive&target=${name}|latlng:${lat},${lng}`,
                  fail: () => {
                    wx.showModal({
                      title: '导航提示',
                      content: '地址已复制到剪贴板，请打开百度地图粘贴搜索',
                      confirmText: '知道了',
                      showCancel: false
                    });
                  }
                });
              }
            });
            break;
          case 3: // 发送到车机
            const carMsg = `【${p.name}】\n地址：${p.address || '请查看详情'}\n坐标：${lat},${lng}\n——来自粤停汇`;
            wx.setClipboardData({
              data: carMsg,
              success: () => {
                wx.showModal({
                  title: '📱 已复制地址信息',
                  content: '地址和坐标已复制，打开您车辆品牌App（如比亚迪海洋、蔚来、小鹏、理想、特斯拉），在导航中粘贴即可。',
                  confirmText: '知道了',
                  showCancel: false
                });
              }
            });
            break;
          case 4: // 复制地址
            wx.setClipboardData({
              data: `${p.name}\n${p.address || ''}`,
              success: () => showToast('地址已复制')
            });
            break;
        }
      },
    });
  },

  async onToggleFavorite() {
    try {
      await toggleFavorite(this.data.parkingId, !this.data.isFavorite);
      this.setData({ isFavorite: !this.data.isFavorite });
    } catch (err) { showToast('操作失败'); }
  },

  onSelectPackage(e) {
    this.setData({ selPkgIdx: e.detail.index });
  },
  onBuyPackage(e) {
    const a = getApp();
    if (!a.globalData.isLogin) {
      wx.showLoading({ title: '登录中...' });
      login().then(() => {
        wx.hideLoading();
        wx.navigateTo({ url: `/pages/order/order?parkingId=${this.data.parking._id}&packageId=${e.detail.id}&pkgIdx=${this.data.selPkgIdx}` });
      }).catch(() => {
        wx.hideLoading();
        wx.showModal({ title: '登录失败', content: '请前往"我的"页面手动登录', confirmText: '去登录',
          success: (r) => { if (r.confirm) wx.navigateTo({ url: '/pages/mine/mine' }); } });
      });
      return;
    }
    wx.navigateTo({ url: `/pages/order/order?parkingId=${this.data.parking._id}&packageId=${e.detail.id}&pkgIdx=${this.data.selPkgIdx}` });
  },

  onDirectBuy() {
    const pkgs = this.data.packages;
    if (pkgs.length === 0) { showToast('暂无可用套餐'); return; }
    const pkg = pkgs[this.data.selPkgIdx] || pkgs[0];
    this.onBuyPackage({ detail: { id: pkg._id } });
  },
  onGroupBuy3() {
    if (this.data.cardType === 'count') { showToast('次卡不支持拼单'); return; }
    const pkg = this.data.packages[this.data.selPkgIdx] || this.data.packages[0];
    wx.navigateTo({ url: `/pages/order/order?parkingId=${this.data.parking._id}&packageId=${pkg._id}&groupType=3&pkgIdx=${this.data.selPkgIdx}` });
  },
  onGroupBuy10() {
    if (this.data.cardType === 'count') { showToast('次卡不支持拼单'); return; }
    const pkg = this.data.packages[this.data.selPkgIdx] || this.data.packages[0];
    wx.navigateTo({ url: `/pages/order/order?parkingId=${this.data.parking._id}&packageId=${pkg._id}&groupType=10&pkgIdx=${this.data.selPkgIdx}` });
  },

  onJoinPin(e) {
    if (this.data.cardType === 'count') { showToast('次卡不支持拼单'); return; }
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({ url: `/pages/order/order?parkingId=${this.data.parking._id}&packageId=${item.id}&groupType=3` });
  },

  onTapShare() {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
  },
  onInviteFriend() {
    const p = this.data.parking;
    wx.showModal({
      title: '💌 邀请送好礼',
      content: `将「${p.name}」分享给好友\n双方各得30元代金券！\n\n点击右上角"…"发送给朋友`,
      showCancel: true,
      cancelText: '取消',
      confirmText: '去分享',
      success: (res) => {
        if (res.confirm) {
          wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] });
        }
      },
    });
  },
  onShareAppMessage() {
    const p = this.data.parking;
    return { title: `${p.name} | 粤停汇`, path: `/pages/detail/detail?id=${p._id}`, imageUrl: p.cover || '/images/logo-share.png' };
  },
});
