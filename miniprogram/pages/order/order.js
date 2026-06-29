// 确认订单 v5 - 车辆选择 + 微信支付 + 加入购物车 + 优惠券三态
const { getParkingDetail, getMyCoupons, createOrder, toggleFavorite } = require('../../utils/request');
const { callFunction } = require('../../utils/auth');
const { showToast } = require('../../utils/util');

Page({
  data: {
    parkingId: '', packageId: '', pkgIdx: 0, groupType: '',
    parkingInfo: {}, selectedPackage: {},
    quantity: 1, availableCoupons: 0, selectedCoupon: null,
    totalPrice: '0', finalPrice: '0',
    groupPrice: 0, saveAmount: 0, startDate: '', minDate: '',
    currentOrderId: '',
    // 车辆相关
    vehicles: [],
    selectedVehicle: null,
    showVehiclePicker: false,
    // 优惠券三态
    couponUsable: 0, couponUnusable: 0,
    // 购物车状态
    addedToCart: false,
  },

  onLoad(options) {
    this.setData({
      parkingId: options.parkingId || '',
      packageId: options.packageId || '',
      pkgIdx: parseInt(options.pkgIdx) || 0,
      groupType: options.groupType || '',
    });

    // 日历最小日期（明天）
    const t = new Date(); t.setDate(t.getDate() + 1);
    const minDate = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    this.setData({ minDate });

    if (this.data.groupType) {
      this.setData({ startDate: minDate });
    }

    // 加载车辆列表（内部会判断是否需要引导添加）
    this.loadVehicles();
  },

  onShow() {
    // 从车辆管理页返回后刷新车辆
    this.loadVehicles();
  },

  // ========== 车辆管理 ==========

  loadVehicles() {
    const vehicles = wx.getStorageSync('vehicles') || [];
    let selectedVehicle = vehicles.find(v => v.isDefault) || vehicles[0] || null;

    // 如果没有车辆，引导添加
    if (!vehicles.length) {
      wx.showModal({
        title: '请先添加车辆',
        content: '下单前需要绑定您的车牌号',
        confirmText: '去添加',
        confirmColor: '#F97316',
        success: (r) => {
          if (r.confirm) wx.navigateTo({ url: '/pages/profile/profile' });
          else wx.navigateBack();
        },
      });
      return;
    }

    this.setData({ vehicles, selectedVehicle }, () => {
      // 车辆就绪后才加载订单数据
      if (this.data.parkingId) this.init();
    });
  },

  // 点击车辆选择器
  onPickVehicle() {
    if (this.data.vehicles.length <= 1) return;
    this.setData({ showVehiclePicker: true });
  },

  // 选择车辆
  onSelectVehicle(e) {
    const id = e.currentTarget.dataset.id;
    const vehicle = this.data.vehicles.find(v => v.id === id);
    if (vehicle) {
      this.setData({ selectedVehicle: vehicle, showVehiclePicker: false });
    }
  },

  // 关闭车辆选择器
  onCloseVehiclePicker() {
    this.setData({ showVehiclePicker: false });
  },

  // 跳转到添加车辆
  onAddNewVehicle() {
    this.setData({ showVehiclePicker: false });
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  // ========== 订单逻辑 ==========

  onDateChange(e) {
    this.setData({ startDate: e.detail.value });
  },

  async init() {
    if (!this.data.selectedVehicle) return;
    if (!this.data.parkingId) return;
    try {
      wx.showLoading({ title: '加载中...' });
      const data = await getParkingDetail(this.data.parkingId);
      wx.hideLoading();
      if (!data) throw new Error('数据为空');
      const pkgs = data.packages || [];
      let pkg = pkgs.find(p => p._id === this.data.packageId);
      if (!pkg) {
        // _id 匹配失败时用索引兜底
        pkg = pkgs[this.data.pkgIdx] || pkgs[0] || {};
        console.warn('order: _id未匹配, 用索引兜底 pkgIdx=' + this.data.pkgIdx + ' pkg=' + (pkg.name || '?') + ' price=' + (pkg.price || '?'));
      }
      let coupons = null, allCoupons = [];
      try {
        coupons = await getMyCoupons('valid');
        allCoupons = coupons || [];
      } catch(e) {}
      
      // 计算优惠券三态（可用/不可用/无）
      let usable = 0, unusable = 0;
      const unitPrice = parseFloat(pkg.price) || 0;
      const totalPrice = unitPrice * (parseInt(this.data.quantity) || 1);
      allCoupons.forEach(c => {
        const condition = c.condition || '';
        // 满减券：检查订单总额是否满足条件
        if (/满(\d+)/.test(condition)) {
          const threshold = parseInt(RegExp.$1);
          if (totalPrice >= threshold) usable++;
          else unusable++;
        } else {
          usable++;
        }
      });
      
      this.setData({
        parkingInfo: data.parking || {},
        selectedPackage: pkg,
        availableCoupons: coupons ? coupons.length : 0,
        couponUsable: usable,
        couponUnusable: unusable,
      });
      this.calc();
    } catch (err) {
      wx.hideLoading();
      showToast('加载失败');
    }
  },

  calc() {
    const { selectedPackage, quantity, selectedCoupon, groupType } = this.data;
    const unitPrice = parseFloat(selectedPackage.price) || 0;
    const totalPrice = unitPrice * (parseInt(quantity) || 1);

    let groupPrice = 0, saveAmount = 0;
    if (groupType === '3') {
      groupPrice = parseFloat(selectedPackage.groupPrice3) || Math.round(unitPrice * 0.88);
      saveAmount = unitPrice - groupPrice;
    } else if (groupType === '10') {
      groupPrice = parseFloat(selectedPackage.groupPrice10 || selectedPackage.groupPrice15) || Math.round(unitPrice * 0.78);
      saveAmount = unitPrice - groupPrice;
    }

    // 优惠券抵扣金额
    let discount = 0;
    if (selectedCoupon) {
      discount = parseFloat(selectedCoupon.amount || selectedCoupon.discount) || 0;
      const condition = selectedCoupon.condition || '';
      if (/200/.test(condition) && totalPrice < 200) {
        discount = 0;
      }
    }

    const finalPrice = groupType ? groupPrice * (parseInt(quantity) || 1) - discount : totalPrice - discount;

    this.setData({
      totalPrice, finalPrice: Math.max(0, finalPrice),
      groupPrice, saveAmount,
    });
  },

  decreaseQty() { if (this.data.quantity > 1) { this.setData({ quantity: this.data.quantity - 1 }); this.calc(); } },
  increaseQty() { this.setData({ quantity: this.data.quantity + 1 }); this.calc(); },

  onSelectCoupon() { wx.navigateTo({ url: '/pages/coupons/coupons?mode=select' }); },

  // 加入购物车（收藏）
  async onAddToCart() {
    if (this.data.addedToCart) {
      wx.showToast({ title: '已在收藏中', icon: 'none' });
      return;
    }
    try {
      await toggleFavorite(this.data.parkingId, true);
      this.setData({ addedToCart: true });
      wx.showToast({ title: '已加入收藏', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '加入失败', icon: 'none' });
    }
  },

  async onSubmitOrder() {
    if (!this.data.selectedVehicle) {
      showToast('请选择车辆');
      return;
    }
    if (!this.data.selectedPackage._id) { showToast('请选择套餐'); return; }
    try {
      wx.showLoading({ title: '创建订单...' });
      const result = await createOrder({
        parkingId: this.data.parkingId,
        packageId: this.data.selectedPackage._id,
        parkingName: (this.data.parkingInfo && this.data.parkingInfo.name) || (this.data.parkingInfo && this.data.parkingInfo.na) || '',
        packageName: this.data.selectedPackage.name || this.data.selectedPackage.n || '停车套餐',
        unitPrice: this.data.groupType ? this.data.groupPrice : (this.data.selectedPackage.price || this.data.selectedPackage.p || 0),
        packagePeriod: this.data.selectedPackage.period || this.data.selectedPackage.t || '',
        quantity: this.data.quantity,
        couponId: this.data.selectedCoupon ? this.data.selectedCoupon._id : '',
        groupType: this.data.groupType,
        startDate: this.data.startDate,
        plateNo: this.data.selectedVehicle.plateNo,
      });
      wx.hideLoading();

      if (!result.timeStamp) {
        wx.showToast({ title: '下单成功', icon: 'success' });
        setTimeout(() => wx.redirectTo({ url: '/pages/order-list/order-list' }), 1000);
        return;
      }

      const orderId = result.orderId;
      this.setData({ currentOrderId: orderId });

      const markPaid = async () => {
        try { await callFunction('order', { action: 'paid', orderId }); } catch(e){}
        wx.showToast({ title: '支付成功！', icon: 'success' });
        setTimeout(() => wx.redirectTo({ url: '/pages/order-list/order-list' }), 1200);
      };

      // 调起微信支付
      wx.requestPayment({
        timeStamp: result.timeStamp,
        nonceStr: result.nonceStr,
        package: result.package,
        signType: result.signType || 'MD5',
        paySign: result.paySign,
        success: () => { markPaid(); },
        fail: (err) => {
          if (err.errMsg.includes('cancel')) {
            showToast('已取消支付');
          } else {
            wx.showModal({
              title: '支付状态',
              content: '如果在真机上已扫码完成支付，请点"已完成"',
              confirmText: '已完成',
              cancelText: '未支付',
              success: (r) => {
                if (r.confirm) markPaid();
              },
            });
          }
        },
      });
    } catch (err) {
      wx.hideLoading();
      showToast(err.message || '下单失败');
    }
  },

  onShareAppMessage() {
    const p = this.data.parkingInfo;
    const gt = this.data.groupType === '3' ? '好友团' : '企业团';
    return {
      title: `快来拼团！${p.name} ${gt}仅需¥${this.data.groupPrice}/人`,
      path: `/pages/order/order?parkingId=${this.data.parkingId}&packageId=${this.data.selectedPackage._id}&groupType=${this.data.groupType}`,
      imageUrl: '/images/logo-share.png',
    };
  },
});
