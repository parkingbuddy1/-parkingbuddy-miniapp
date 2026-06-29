// 项目推荐及合作页
const { callFunction } = require('../../utils/auth');

Page({
  data: {
    phone: '',
    wechat: '',
    content: '',
    submitting: false,
  },

  onPhoneInput(e) { this.setData({ phone: e.detail.value }); },
  onWechatInput(e) { this.setData({ wechat: e.detail.value }); },
  onContentInput(e) { this.setData({ content: e.detail.value }); },

  async onSubmit() {
    const { phone, wechat, content } = this.data;
    if (!phone.trim()) { wx.showToast({ title: '请输入手机号', icon: 'none' }); return; }
    if (!/^1\d{10}$/.test(phone.trim())) { wx.showToast({ title: '手机号格式不正确', icon: 'none' }); return; }
    if (!wechat.trim()) { wx.showToast({ title: '请输入微信号', icon: 'none' }); return; }
    if (!content.trim()) { wx.showToast({ title: '请输入留言内容', icon: 'none' }); return; }

    this.setData({ submitting: true });
    try {
      await callFunction('cooperation', {
        action: 'submit',
        phone: phone.trim(),
        wechat: wechat.trim(),
        content: content.trim(),
      });
      wx.showToast({ title: '提交成功', icon: 'success' });
      this.setData({ phone: '', wechat: '', content: '' });
    } catch (e) {
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
