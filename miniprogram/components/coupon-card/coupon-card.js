// 优惠券卡片组件
Component({
  properties: {
    coupon: { type: Object, value: {} },
    mode: { type: String, value: 'view' },
  },
  methods: {
    onTap() {
      const { coupon, mode } = this.data;
      if (mode === 'select' && coupon.status !== 'expired') {
        this.triggerEvent('select', { id: coupon._id || coupon.id });
        return;
      }
      // view 模式下点击 → 跳转月卡页面
      if (mode === 'view' && coupon.status === 'valid') {
        wx.reLaunch({ url: '/pages/index/index?view=parking' });
      }
    },
  },
});
