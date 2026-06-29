// 留言建议有奖
const app = getApp();
const { callFunction } = require('../../utils/auth');

Page({
  data: {
    phone: '',
    content: '',
    submitting: false,
    submitted: false,
  },

  onLoad() {
    // 自动填充用户手机号
    if (app.globalData.userInfo && app.globalData.userInfo.phone) {
      this.setData({ phone: app.globalData.userInfo.phone.replace(/\*+/g, '') });
    }
  },

  onPhoneInput(e) { this.setData({ phone: e.detail.value }); },
  onContentInput(e) { this.setData({ content: e.detail.value }); },

  async onSubmit() {
    const { phone, content } = this.data;
    if (!phone || !/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请输入正确手机号', icon: 'none' });
      return;
    }
    if (!content.trim()) {
      wx.showToast({ title: '请输入留言内容', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      await callFunction('feedback', {
        action: 'submit',
        phone: phone,
        content: content.trim(),
      });
      this.setData({ submitted: true, submitting: false });
    } catch (e) {
      this.setData({ submitting: false });
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    }
  },
});
