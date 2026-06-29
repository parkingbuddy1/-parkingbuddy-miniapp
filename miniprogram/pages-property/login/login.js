// 物业端登录页
const app = getApp();

Page({
  data: {
    mode: 'login', // login | register
    phone: '',
    password: '',
    confirmPassword: '',
    name: '',
    contactName: '',
    showPassword: false,
    loading: false,
    agreement: false
  },

  onLoad() {
    // 检查是否已登录
    const token = wx.getStorageSync('propertyToken');
    if (token) {
      wx.reLaunch({ url: '/pages-property/home/home' });
    }
  },

  switchMode() {
    this.setData({
      mode: this.data.mode === 'login' ? 'register' : 'login',
      password: '',
      confirmPassword: ''
    });
  },

  goDebug() {
    wx.navigateTo({ url: '/pages-property/debug/debug' });
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  onConfirmInput(e) {
    this.setData({ confirmPassword: e.detail.value });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onContactInput(e) {
    this.setData({ contactName: e.detail.value });
  },

  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  toggleAgreement() {
    this.setData({ agreement: !this.data.agreement });
  },

  validate() {
    const { phone, password, mode, confirmPassword, name, contactName, agreement } = this.data;
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确手机号', icon: 'none' });
      return false;
    }
    if (password.length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' });
      return false;
    }
    if (mode === 'register') {
      if (password !== confirmPassword) {
        wx.showToast({ title: '两次密码不一致', icon: 'none' });
        return false;
      }
      if (!name || !contactName) {
        wx.showToast({ title: '请填写完整', icon: 'none' });
        return false;
      }
    }
    if (!agreement) {
      wx.showToast({ title: '请先同意服务协议', icon: 'none' });
      return false;
    }
    return true;
  },

  async handleSubmit() {
    if (!this.validate()) return;
    this.setData({ loading: true });

    const { mode, phone, password, name, contactName } = this.data;
    const action = mode === 'login' ? 'propertyLogin' : 'propertyRegister';

    try {
      const res = await wx.cloud.callFunction({
        name: 'property',
        data: {
          action,
          phone, password,
          name, contactName
        }
      });

      if (res.result.code === 0) {
        if (mode === 'login') {
          wx.setStorageSync('propertyToken', res.result.data.token);
          wx.setStorageSync('propertyInfo', res.result.data.property);
          app.globalData.propertyToken = res.result.data.token;
          app.globalData.propertyInfo = res.result.data.property;
          wx.showToast({ title: '登录成功', icon: 'success' });
          setTimeout(() => {
            wx.reLaunch({ url: '/pages-property/home/home' });
          }, 1000);
        } else {
          wx.showModal({
            title: '注册成功',
            content: '请等待平台审核开通，预计 1-2 个工作日',
            showCancel: false,
            success: () => this.switchMode()
          });
        }
      } else {
        wx.showToast({ title: res.result.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
