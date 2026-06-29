// AI 智能问答页面
const { aiChat } = require('../../utils/request');
const app = getApp();

Page({
  data: {
    messages: [],       // 对话消息列表
    inputValue: '',     // 输入框内容
    isThinking: false,  // AI 思考中
    scrollToView: '',   // 滚动锚点
    isRecording: false, // 语音录制中
    showWelcome: true,  // 欢迎页
    statusBarHeight: app.globalData.statusBarHeight || 44,
  },

  onLoad() {
    this.initVoice();
    this.setData({
      messages: [{
        role: 'assistant',
        content: '你好！我是粤停汇AI助手 🅿️\n\n我可以帮你：\n🔍 查找最便宜的停车场\n📍 按区域推荐停车方案\n💰 对比月卡/次卡价格\n⚡ 查找充电站停车优惠\n\n直接告诉我你的需求吧！',
        time: Date.now()
      }]
    });
  },

  onShow() {
    // 每次进入聚焦输入框
    setTimeout(() => this.scrollToBottom(), 300);
  },

  // ====== 发送文字消息 ======
  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  async onSend() {
    const text = (this.data.inputValue || '').trim();
    if (!text || this.data.isThinking) return;

    // 添加用户消息
    const userMsg = { role: 'user', content: text, time: Date.now() };
    const messages = [...this.data.messages, userMsg];
    this.setData({
      messages,
      inputValue: '',
      showWelcome: false,
      isThinking: true,
    });
    this.scrollToBottom();

    try {
      // 构建对话历史
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await aiChat(text, history);
      const reply = res.result?.reply || '抱歉，我现在有点忙，请稍后再试。';

      this.setData({
        messages: [...this.data.messages, {
          role: 'assistant',
          content: reply,
          time: Date.now(),
          source: res.result?.source || 'local'
        }],
        isThinking: false,
      });
    } catch (err) {
      this.setData({
        messages: [...this.data.messages, {
          role: 'assistant',
          content: '网络连接失败，请检查网络后重试 📡',
          time: Date.now(),
          source: 'error'
        }],
        isThinking: false,
      });
    }
    this.scrollToBottom();
  },

  // ====== 快捷提问 ======
  onQuickAsk(e) {
    const q = e.currentTarget.dataset.q;
    this.setData({ inputValue: q }, () => this.onSend());
  },

  // ====== 语音输入（微信同声传译插件） ======
  initVoice() {
    try {
      const plugin = requirePlugin('WechatSI');
      this._voiceManager = plugin.getRecordRecognitionManager();
      this._voiceManager.onRecognize = (res) => {
        if (res && res.result) {
          this.setData({ inputValue: res.result });
        }
      };
      this._voiceManager.onStop = (res) => {
        this.setData({ isRecording: false });
        wx.hideToast();
        const text = (res && res.result) ? res.result : '';
        if (text) {
          this.setData({ inputValue: text });
          setTimeout(() => this.onSend(), 400);
        } else {
          wx.showToast({ title: '未识别到内容', icon: 'none' });
        }
      };
      this._voiceManager.onError = (res) => {
        this.setData({ isRecording: false });
        wx.hideToast();
        wx.showToast({ title: res.msg || '语音识别失败', icon: 'none' });
      };
      this._voiceReady = true;
    } catch (e) {
      this._voiceReady = false;
    }
  },

  onVoiceStart() {
    if (!this._voiceReady) {
      this.initVoice();
      if (!this._voiceReady) {
        wx.showToast({ title: '语音功能初始化中', icon: 'none' });
        return;
      }
    }
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ isRecording: true, inputValue: '' });
        wx.showToast({ title: '正在聆听...', icon: 'none', duration: 15000 });
        this._voiceManager.start({ lang: 'zh_CN', duration: 15000 });
      },
      fail: () => {
        wx.showModal({
          title: '需要录音权限', content: '语音提问需要麦克风权限',
          confirmText: '去设置',
          success: (r) => { if (r.confirm) wx.openSetting(); }
        });
      }
    });
  },

  onVoiceEnd() {
    if (!this._voiceReady || !this.data.isRecording) return;
    this.setData({ isRecording: false });
    wx.hideToast();
    try { this._voiceManager.stop(); } catch (e) {}
  },

  // ====== 工具方法 ======
  scrollToBottom() {
    if (this.data.messages.length > 0) {
      const last = this.data.messages[this.data.messages.length - 1];
      this.setData({ scrollToView: `msg-${last.time}` });
    }
  },

  onBack() {
    wx.navigateBack();
  },
});
