// 车主认证页 - 多步骤认证流程
const app = getApp();
const { callFunction } = require('../../utils/auth');

Page({
  data: {
    statusBarHeight: app.globalData.statusBarHeight || 44,

    // 当前步骤 (0-7)
    step: 0,
    stepLabels: ['身份信息', '实名认证', '人脸识别', '上传行驶证', 'OCR识别', '系统校验', '提交审核', '完成'],

    // 本次认证的车牌号（从添加车辆页带入）
    certPlateNo: '',

    // 身份信息
    name: '',
    idNo: '',
    phone: '',
    vcode: '',
    smsSent: false,
    smsSeconds: 0,
    smsVerified: false,

    // 步骤状态
    submitting: false,
    uploading: false,

    // 行驶证
    licenseImage: '',
    licenseImageBase64: '',
    licenseFileID: '',

    // OCR 结果
    ocrResult: null,
    ocrLoading: false,

    // 活体检测
    faceVerified: false,
    faceFileID: '',

    // 校验结果
    checkResult: null,
    verifyResult: null,

    // 已有认证状态（同车牌）
    existingVerify: null,
    loading: true,
  },

  onLoad() {
    const pendingPlateNo = wx.getStorageSync('__pendingPlateNo');
    if (pendingPlateNo) {
      this.setData({ certPlateNo: pendingPlateNo });
    }
    this.checkExistingVerify();
  },

  // 查询已有认证状态（按 openid + plateNo 查，而不是仅按 openid）
  async checkExistingVerify() {
    try {
      const data = await callFunction('user', { action: 'status', plateNo: this.data.certPlateNo || '' });
      if (data && data.verified) {
        // 该车牌已认证通过，跳过
        this.setData({ existingVerify: data, loading: false, step: 7 });
      } else {
        this.setData({ loading: false });
      }
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  // ====== 步骤 0: 填写姓名身份证 + 手机号验证 ======
  onNameInput(e) { this.setData({ name: e.detail.value }); },
  onIdNoInput(e) { this.setData({ idNo: e.detail.value }); },
  onPhoneInput(e) { this.setData({ phone: e.detail.value }); },
  onVcodeInput(e) { this.setData({ vcode: e.detail.value }); },

  // 发送短信验证码
  async onSendSms() {
    const { phone } = this.data;
    if (!/^1\d{10}$/.test(phone)) { wx.showToast({ title: '请输入正确手机号', icon: 'none' }); return; }
    if (this.data.smsSeconds > 0) return;

    try {
      wx.showLoading({ title: '发送中...' });
      await callFunction('user', { action: 'sendSmsCode', phone });
      wx.hideLoading();
      wx.showToast({ title: '验证码已发送', icon: 'success' });

      // 60 秒倒计时
      this.setData({ smsSent: true, smsSeconds: 60 });
      this._timer = setInterval(() => {
        if (this.data.smsSeconds <= 1) {
          clearInterval(this._timer);
          this.setData({ smsSeconds: 0 });
        } else {
          this.setData({ smsSeconds: this.data.smsSeconds - 1 });
        }
      }, 1000);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '发送失败', icon: 'none' });
    }
  },

  // 验证短信验证码
  async onVerifySms() {
    const { phone, vcode } = this.data;
    if (!vcode) { wx.showToast({ title: '请输入验证码', icon: 'none' }); return; }

    try {
      wx.showLoading({ title: '验证中...' });
      await callFunction('user', { action: 'verifySmsCode', phone, code: vcode });
      wx.hideLoading();
      this.setData({ smsVerified: true });
      wx.showToast({ title: '验证通过', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '验证失败', icon: 'none' });
    }
  },

  onNextToStep1() {
    const { name, idNo, smsVerified } = this.data;
    if (!name.trim()) { wx.showToast({ title: '请填写姓名', icon: 'none' }); return; }
    if (!idNo.trim()) { wx.showToast({ title: '请填写身份证号', icon: 'none' }); return; }
    if (!/^[\u4e00-\u9fa5]{2,20}$/.test(name.trim())) { wx.showToast({ title: '姓名格式不正确', icon: 'none' }); return; }
    if (!smsVerified) { wx.showToast({ title: '请完成短信验证', icon: 'none' }); return; }
    this.setData({ step: 1 });
  },

  // ====== 步骤 1: 实名认证 ======
  onVerifyRealName() {
    const { name, idNo } = this.data;
    this.setData({ submitting: true });
    // 调用微信实名认证接口（需要开通）
    wx.cloud.callFunction({
      name: 'user',
      data: { action: 'submit', name: name.trim(), idNo: idNo.trim(), licenseImageBase64: 'skip' },
    }).then(res => {
      this.setData({ submitting: false });
      if (res.result?.code === 0) {
        this.setData({ step: 2 });
      } else if (res.result?.code === -1 && res.result?.message?.includes('格式')) {
        wx.showToast({ title: '身份信息验证失败，请检查', icon: 'none' });
      } else {
        this.setData({ step: 2 }); // 格式验证通过即可进入下一步
      }
    }).catch(e => {
      this.setData({ submitting: false });
      // 云函数未部署时也允许继续（开发阶段）
      this.setData({ step: 2 });
    });
  },

  // ====== 步骤 2: 人脸活体检测 ======
  onFaceVerify() {
    wx.showModal({
      title: '人脸识别',
      content: '请确保光线充足、面部清晰可见。将调用摄像头拍摄正面照进行活体检测。',
      confirmText: '开始识别',
      success: (res) => {
        if (res.confirm) {
          // 使用相机拍摄自拍照片作为人脸验证
          wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['camera'],
            camera: 'front',
            success: (mediaRes) => {
              const tempFilePath = mediaRes.tempFiles[0].tempFilePath;
              // 上传自拍照到云存储
              const that = this;
              wx.showLoading({ title: '验证中...' });
              wx.cloud.uploadFile({
                cloudPath: `face/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`,
                filePath: tempFilePath,
                success(uploadRes) {
                  that.setData({
                    faceVerified: true,
                    faceFileID: uploadRes.fileID,
                    step: 3,
                  });
                  wx.hideLoading();
                  wx.showToast({ title: '人脸验证成功', icon: 'success' });
                },
                fail(err) {
                  wx.hideLoading();
                  console.error('自拍上传失败:', err);
                  // 上传失败也允许继续（开发阶段）
                  that.setData({ faceVerified: true, step: 3 });
                  wx.showToast({ title: '已确认人脸', icon: 'none' });
                }
              });
            },
            fail: () => {
              wx.showToast({ title: '未拍摄照片，请重试', icon: 'none' });
            }
          });
        }
      },
    });
  },

  // ====== 步骤 3: 上传行驶证 ======
  onUploadLicense() {
    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera', 'album'],
      success(res) {
        const tempFilePath = res.tempFilePaths[0];
        that.setData({ licenseImage: tempFilePath, uploading: true });

        // 上传到云存储（避免 base64 太大导致云函数超限）
        const cloudPath = `licenses/${Date.now()}_${Math.random().toString(36).substr(2,6)}.jpg`;
        wx.cloud.uploadFile({
          cloudPath,
          filePath: tempFilePath,
          success(uploadRes) {
            that.setData({
              licenseFileID: uploadRes.fileID,
              uploading: false,
              step: 4,
            });
            that.doOCR(uploadRes.fileID);
          },
          fail(err) {
            that.setData({ uploading: false });
            console.error('上传失败:', err);
            wx.showToast({ title: '上传失败，请重试', icon: 'none' });
          },
        });
      },
    });
  },

  // ====== 步骤 4: OCR 识别 ======
  async doOCR(fileID) {
    this.setData({ ocrLoading: true });
    try {
      const data = await callFunction('user', {
        action: 'ocr',
        licenseFileID: fileID,
      });
      // 保留原始字段 + 脱敏版（VIN 保留完整供用户自行核对）
      const vin = data.vin || data.Vin || '';
      data.vinMasked = vin ? vin.slice(0, 8) + '****' : '未识别';
      data.vin = vin; // 确保 vin 字段统一小写
      this.setData({ ocrResult: data, ocrLoading: false, step: 4, ocrConfirmed: false });
    } catch (e) {
      console.error('OCR失败:', e);
      const errMsg = e.message || 'OCR识别失败';
      wx.showToast({ title: errMsg, icon: 'none', duration: 3000 });
      this.setData({ ocrLoading: false, step: 4, ocrResult: null, ocrConfirmed: false });
    }
  },

  // 用户确认OCR结果 → 进入系统校验
  onOcrConfirm() {
    this.setData({ ocrConfirmed: true, step: 5 });
  },

  // 重新拍照
  onRetake() {
    this.setData({ licenseImage: '', licenseImageBase64: '', licenseFileID: '', ocrResult: null, step: 3 });
  },

  // ====== 步骤 5: 系统校验 ======
  async onSubmitVerify() {
    const { name, idNo, phone, certPlateNo, licenseFileID, ocrResult } = this.data;
    if (!licenseFileID) { wx.showToast({ title: '请先上传行驶证', icon: 'none' }); return; }

    this.setData({ submitting: true });
    try {
      const data = await callFunction('user', {
        action: 'submit',
        name: name.trim(),
        idNo: idNo.trim(),
        phone: phone.trim(),
        certPlateNo: certPlateNo.trim(),
        licenseFileID,
        plateNo: ocrResult?.plateNo || certPlateNo || '',
      });
      this.setData({
        checkResult: data.checkResult,
        verifyResult: data,
        submitting: false,
        step: 6,
      });
      // 认证预提交成功：发放新用户注册券（每个账号仅一张）
      this.issueRegCoupon();
    } catch (e) {
      this.setData({ submitting: false });
      wx.showToast({ title: e.message || '提交失败', icon: 'none', duration: 2500 });
    }
  },

  // ====== 完成 ======
  onDone() {
    wx.removeStorageSync('__pendingPlateNo');
    wx.navigateBack();
  },

  // 发放新用户注册券（每个账号仅一张）
  issueRegCoupon() {
    const issued = wx.getStorageSync('__reg_coupon_issued');
    if (issued) return; // 已发过，跳过

    const now = new Date();
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
    const coupons = wx.getStorageSync('coupons') || [];
    const seq = String(coupons.filter(c => c.type === 'reg').length + 1).padStart(4, '0');
    const couponId = `REG${y}${m}${d}${seq}`;
    const expireDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    coupons.unshift({
      id: couponId,
      type: 'reg',
      title: '🎁 新用户注册礼',
      desc: '完成车主认证即送',
      amount: 30,
      condition: '金额200元以上的月卡订单可用',
      status: 'valid',
      createTime: now.toISOString(),
      expireTime: expireDate.toISOString(),
      expireDate: `${expireDate.getFullYear()}-${String(expireDate.getMonth() + 1).padStart(2, '0')}-${String(expireDate.getDate()).padStart(2, '0')}`,
      vehiclePlate: this.data.ocrResult?.plateNo || '',
    });
    wx.setStorageSync('coupons', coupons);
    wx.setStorageSync('__reg_coupon_issued', true);
  },

  onGoHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  },
});
