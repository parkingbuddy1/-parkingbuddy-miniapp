// 我的车辆 v5 - 完整认证流程 (7步)
const { showToast } = require('../../utils/util');

const PROVINCES = ['京','津','沪','渝','冀','豫','云','辽','黑','湘','皖','鲁','新','苏','浙','赣','鄂','桂','甘','晋','蒙','陕','吉','闽','贵','粤','川','青','藏','琼','宁'];

// A-Z 品牌索引
const BRAND_GROUPS = [
  { letter: 'A', brands: ['奥迪','阿尔法·罗密欧','阿斯顿·马丁','阿维塔','埃安'] },
  { letter: 'B', brands: ['宝马','奔驰','比亚迪','保时捷','本田','别克','标致','宾利','宝骏','北汽','宝沃'] },
  { letter: 'C', brands: ['长安','长城','传祺','创维'] },
  { letter: 'D', brands: ['大众','东风','道奇','DS','东风风行','东风风光','东风风神'] },
  { letter: 'F', brands: ['丰田','福特','法拉利','菲亚特','飞凡','方程豹'] },
  { letter: 'G', brands: ['广汽传祺','高合'] },
  { letter: 'H', brands: ['哈弗','红旗','昊铂','悍马','海马'] },
  { letter: 'J', brands: ['吉利','极氪','江淮','捷豹','吉普','捷途','捷尼赛思','极狐','极星','几何'] },
  { letter: 'K', brands: ['凯迪拉克','克莱斯勒','柯尼塞格'] },
  { letter: 'L', brands: ['路虎','雷克萨斯','林肯','兰博基尼','理想','零跑','领克','劳斯莱斯','路特斯','岚图'] },
  { letter: 'M', brands: ['马自达','名爵','玛莎拉蒂','迈凯伦','MINI','猛士'] },
  { letter: 'N', brands: ['日产','哪吒'] },
  { letter: 'O', brands: ['欧拉','欧宝'] },
  { letter: 'Q', brands: ['奇瑞','起亚','启源'] },
  { letter: 'R', brands: ['荣威'] },
  { letter: 'S', brands: ['三菱','斯巴鲁','斯柯达','特斯拉','双龙','深蓝','赛力斯','Smart'] },
  { letter: 'T', brands: ['腾势','坦克'] },
  { letter: 'W', brands: ['沃尔沃','五菱','魏牌','问界','威马'] },
  { letter: 'X', brands: ['现代','小鹏','雪佛兰','雪铁龙','小米汽车','星途','西雅特'] },
  { letter: 'Y', brands: ['英菲尼迪','仰望','云度'] },
  { letter: 'Z', brands: ['智己'] },
];

const COLORS = [
  { name: '黑色', value: '#1a1a1a' }, { name: '白色', value: '#f5f5f5' },
  { name: '银色', value: '#c0c0c0' }, { name: '灰色', value: '#808080' },
  { name: '红色', value: '#d32f2f' }, { name: '蓝色', value: '#1565c0' },
  { name: '棕色', value: '#795548' }, { name: '金色', value: '#ffc107' },
  { name: '绿色', value: '#2e7d32' }, { name: '黄色', value: '#f9a825' },
  { name: '橙色', value: '#e65100' }, { name: '紫色', value: '#6a1b9a' },
];

// 车牌字母/数字键盘布局
const PLATE_KEYS = [
  ['1','2','3','4','5','6','7','8','9','0'],
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M'],
];

Page({
  data: {
    vehicles: [],
    showModal: false, editingId: '',
    editForm: {
      province: '粤', plateLetter: '', plateNum: '',
      brandModel: '', color: '', colorName: '', vehicleType: '轿车', isDefault: false,
      customBrand: '', customColor: '',
    },
    // 选择器
    showProvincePicker: false, showBrandPicker: false,
    provinces: PROVINCES, brandGroups: BRAND_GROUPS, colorOptions: COLORS,
    showCustomBrand: false, showCustomColor: false,
    showAddress: true, currentAddrType: 'company',
    currentAddress: '', otherAddresses: [], savedAddresses: {},

    // ====== 认证流程 ======
    certPlateNo: '', certVehicleId: '',
    showPlateModal: false, plateStep: 0,
    showIdentityModal: false,  // 身份选择弹窗
    tempProvince: '粤', tempPlateChars: [], plateCharIndex: 0,
    PLATE_KEYS: PLATE_KEYS,
    showDisclaimer: false,
    showCertModal: false, showCertForm: false,
    // 认证表单
    certForm: { ownerName: '', idNumber: '', drivingLicenseUrl: '', vin: '', engineNo: '' },
    agreeTerms: false,
  },

  onLoad() { this.loadVehicles(); this.loadAddresses(); },
  onShow() { this.loadVehicles(); this.loadAddresses(); },

  // ========== 车辆 CRUD ==========
  async loadVehicles() {
    let vehicles = wx.getStorageSync('vehicles') || [];

    // 从认证系统同步所有已审核通过的车辆（支持多车）
    try {
      const { callFunction } = require('../../utils/auth');
      const data = await callFunction('user', { action: 'listMyVehicles' });
      if (data && Array.isArray(data)) {
        data.forEach(v => {
          const exists = vehicles.some(x => x.plateNo === v.plateNo);
          if (exists) {
            // 已有同车牌车辆，更新认证状态和OCR信息
            vehicles = vehicles.map(x => {
              if (x.plateNo === v.plateNo) {
                return {
                  ...x,
                  certified: true,
                  ownerName: v.ownerName || x.ownerName || '',
                  brandModel: v.brandModel || x.brandModel || '',
                  vehicleType: v.vehicleType || x.vehicleType || '',
                };
              }
              return x;
            });
          } else {
            // 新车辆：从认证数据自动创建
            vehicles.unshift({
              id: `v_verified_${v.plateNo.replace(/[^A-Z0-9]/g,'').slice(-6)}`,
              plateNo: v.plateNo,
              certified: true,
              ownerName: v.ownerName || '',
              brandModel: v.brandModel || '',
              vehicleType: v.vehicleType || '',
              isDefault: vehicles.length === 0,
            });
          }
        });
        wx.setStorageSync('vehicles', vehicles);
      }
    } catch (e) {
      // 静默失败，保留本地数据
    }

    this.setData({ vehicles });
  },
  saveVehicles(vehicles) {
    wx.setStorageSync('vehicles', vehicles);
    wx.setStorageSync('profileComplete', vehicles.length > 0);
    this.setData({ vehicles });
  },

  resetEditForm(vehicle) {
    let province = '粤', plateLetter = '', plateNum = '';
    if (vehicle && vehicle.plateNo) {
      const m = vehicle.plateNo.match(/^([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁])([A-Z])(.+)$/);
      if (m) { province = m[1]; plateLetter = m[2]; plateNum = m[3]; }
      else { plateNum = vehicle.plateNo; }
    }
    this.setData({
      showModal: true, editingId: vehicle ? vehicle.id : '',
      showCustomBrand: false, showCustomColor: false,
      editForm: {
        province: vehicle ? province : '粤', plateLetter: vehicle ? plateLetter : '', plateNum: vehicle ? plateNum : '',
        brandModel: vehicle ? (vehicle.brandModel || '') : '', color: vehicle ? (vehicle.color || '') : '',
        colorName: vehicle ? (vehicle.colorName || '') : '', vehicleType: vehicle ? (vehicle.vehicleType || '轿车') : '轿车',
        isDefault: vehicle ? !!vehicle.isDefault : false, customBrand: '', customColor: '',
      },
    });
  },

  onAddVehicle() {
    // 打开车牌输入弹窗
    this.setData({ showPlateModal: true, plateStep: 0, tempProvince: '粤', tempPlateChars: [], plateCharIndex: 0 });
  },
  onEditVehicle(e) {
    const v = this.data.vehicles.find(v => v.id === e.currentTarget.dataset.id);
    if (v) this.resetEditForm(v);
  },

  onFormInput(e) { this.setData({ [`editForm.${e.currentTarget.dataset.field}`]: e.detail.value }); },

  // ========== 车牌输入流程 ==========
  onSelectTempProvince(e) {
    this.setData({ tempProvince: e.currentTarget.dataset.province, plateStep: 1 });
    wx.showToast({ title: `已选择"${e.currentTarget.dataset.province}"`, icon: 'none', duration: 800 });
  },
  onPlateTap(e) {
    const char = e.currentTarget.dataset.char;
    if (char === 'DEL') {
      if (this.data.tempPlateChars.length > 0) {
        const arr = [...this.data.tempPlateChars]; arr.pop();
        this.setData({ tempPlateChars: arr });
      }
    } else {
      const arr = [...this.data.tempPlateChars];
      if (arr.length < 7) {
        // 第一格(位置0)仅允许字母
        if (arr.length === 0 && !/[A-Z]/.test(char)) {
          showToast('第二位请输入大写字母'); return;
        }
        arr.push(char);
        this.setData({ tempPlateChars: arr });
      }
    }
  },
  // 点击某个格子进入编辑模式（删除该位置及之后的字符）
  onPlateCellTap(e) {
    const idx = parseInt(e.currentTarget.dataset.idx);
    const arr = [...this.data.tempPlateChars];
    this.setData({ tempPlateChars: arr.slice(0, idx) });
    wx.vibrateShort({ type: 'light' });
  },
  onPlateConfirm() {
    const { tempProvince, tempPlateChars } = this.data;
    if (tempPlateChars.length < 6) { showToast('车牌号至少6位(字母+5位数字)'); return; }
    const plateNo = tempProvince + tempPlateChars.join('');
    this.setData({ showPlateModal: false, showIdentityModal: true, certPlateNo: plateNo });
  },
  onClosePlateModal() { this.setData({ showPlateModal: false }); },

  // ========== 身份选择弹窗（我是车主/我是使用者/取消） ==========
  onSelectOwner() {
    // 我是车主 → 跳转车主认证流程
    const plateNo = this.data.certPlateNo;
    this.setData({ showIdentityModal: false });

    // 保存车牌到临时变量，供认证页面使用
    wx.setStorageSync('__pendingPlateNo', plateNo);
    wx.navigateTo({ url: '/pages/verify/verify' });
  },
  onSelectUser() {
    // 我是使用者 → 添加车辆（未认证状态），不发券
    const plateNo = this.data.certPlateNo;
    const vehicles = [...this.data.vehicles];
    const existing = vehicles.find(v => v.plateNo === plateNo);

    if (existing) {
      wx.showToast({ title: '该车牌已添加', icon: 'none' });
      this.setData({ showIdentityModal: false });
      return;
    }

    const newVehicle = {
      id: `v${Date.now()}`,
      plateNo,
      brandModel: '', color: '', colorName: '', vehicleType: '轿车',
      isDefault: vehicles.length === 0,
      certified: false, certStatus: 'uncertified', // 使用者身份
      ownerName: '', idNumber: '', drivingLicenseUrl: '', vin: '', engineNo: '',
    };
    vehicles.push(newVehicle);
    if (newVehicle.isDefault) vehicles.forEach(v => { if (v.id !== newVehicle.id) v.isDefault = false; });
    this.saveVehicles(vehicles);
    this.setData({ showIdentityModal: false });
    showToast('车辆已添加（未认证）');
  },
  onCancelIdentity() {
    this.setData({ showIdentityModal: false, certPlateNo: '' });
  },
  onCloseIdentityModal() {
    this.setData({ showIdentityModal: false });
  },

  // ========== 免责声明（保留但废弃，改用身份选择） ==========
  onAcceptDisclaimer() {
    const plateNo = this.data.certPlateNo;
    // 检查数据库/存储中是否已有此车牌
    const vehicles = [...this.data.vehicles];
    const existing = vehicles.find(v => v.plateNo === plateNo);
    
    if (existing) {
      if (existing.certified) {
        wx.showToast({ title: '该车辆已认证', icon: 'success' });
      } else {
        this.setData({ showDisclaimer: false, certVehicleId: existing.id });
        wx.showToast({ title: '车辆已存在，请完成认证', icon: 'none' });
      }
      return;
    }

    // 新增车辆（未认证状态）
    const newVehicle = {
      id: `v${Date.now()}`,
      plateNo,
      brandModel: '', color: '', colorName: '', vehicleType: '轿车',
      isDefault: vehicles.length === 0,
      certified: false, certStatus: 'pending',
      ownerName: '', idNumber: '', drivingLicenseUrl: '', vin: '', engineNo: '',
    };
    vehicles.push(newVehicle);
    if (newVehicle.isDefault) vehicles.forEach(v => { if (v.id !== newVehicle.id) v.isDefault = false; });
    this.saveVehicles(vehicles);
    this.setData({ showDisclaimer: false, certVehicleId: newVehicle.id });
    showToast('车辆已添加，请认证');
  },
  onCloseDisclaimer() { this.setData({ showDisclaimer: false, certPlateNo: '' }); },

  // ========== 认证入口 ==========
  onStartCert(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) { showToast('车辆ID获取失败'); return; }
    const v = this.data.vehicles.find(v => v.id === id);
    if (!v) { showToast('车辆未找到'); return; }
    if (v.certified) { wx.showToast({ title: '该车辆已认证', icon: 'success' }); return; }
    // 跳转到车主认证流程
    wx.navigateTo({ url: '/pages/verify/verify' });
  },
  onCloseCertModal() { this.setData({ showCertModal: false }); },

  onToggleAgree() { this.setData({ agreeTerms: !this.data.agreeTerms }); },

  onGoCert() {
    if (!this.data.agreeTerms) { showToast('请先阅读并同意服务协议和隐私协议'); return; }
    this.setData({ showCertModal: false, showCertForm: true });
  },
  onCloseCertForm() { this.setData({ showCertForm: false }); },

  // ========== 认证表单 ==========
  onCertFormInput(e) { this.setData({ [`certForm.${e.currentTarget.dataset.field}`]: e.detail.value }); },

  onTakeDrivingLicense() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['camera'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath;
        this.setData({ 'certForm.drivingLicenseUrl': tempPath });
        // 模拟 OCR 识别（实际需对接云函数）
        wx.showLoading({ title: '识别中...' });
        setTimeout(() => {
          // 模拟识别结果
          this.setData({
            'certForm.vin': 'LSVAU2YN5N2******',
            'certForm.engineNo': 'EA211******',
          });
          wx.hideLoading();
          showToast('行驶证识别成功');
        }, 1500);
      },
      fail: () => { showToast('拍摄取消'); }
    });
  },

  onSubmitCert() {
    const form = this.data.certForm;
    if (!form.ownerName.trim()) { showToast('请输入姓名'); return; }
    if (!form.idNumber.trim()) { showToast('请输入身份证号'); return; }
    if (form.idNumber.trim().length !== 18) { showToast('身份证号应为18位'); return; }
    if (!form.drivingLicenseUrl) { showToast('请上传行驶证'); return; }

    // 提交认证 → 待审核状态
    let vehicles = [...this.data.vehicles];
    const idx = vehicles.findIndex(v => v.id === this.data.certVehicleId);
    if (idx > -1) {
      vehicles[idx] = {
        ...vehicles[idx],
        certStatus: 'reviewing',  // 待审核
        ownerName: form.ownerName, idNumber: form.idNumber,
        drivingLicenseUrl: form.drivingLicenseUrl, vin: form.vin, engineNo: form.engineNo,
      };
      this.saveVehicles(vehicles);
    }

    this.setData({ showCertForm: false, showCertModal: false });
    wx.showModal({
      title: '认证已提交',
      content: '车辆认证信息已提交审核，我们将在1-3个工作日内完成审核。\n\n审核通过后系统将自动发放一张30元优惠券到您的账户。',
      showCancel: false,
      confirmText: '我知道了',
      success: () => {
        // 模拟审核通过后自动发券
        this.simulateCertReview(this.data.certVehicleId);
      }
    });
  },

  // 模拟认证审核（实际应通过云函数后台处理）
  simulateCertReview(vehicleId) {
    // 模拟1秒后审核通过
    setTimeout(() => {
      let vehicles = [...this.data.vehicles];
      const idx = vehicles.findIndex(v => v.id === vehicleId);
      if (idx > -1) {
        vehicles[idx] = { ...vehicles[idx], certified: true, certStatus: 'certified' };
        this.saveVehicles(vehicles);
        this.issueCertCoupon(vehicles[idx]);
      }
    }, 1500);
  },

  // 发放认证优惠券
  issueCertCoupon(vehicle) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth()+1).padStart(2,'0');
    const d = String(now.getDate()).padStart(2,'0');
    // 生成当日序号（模拟：取当天已有券数+1）
    const existingCoupons = wx.getStorageSync('coupons') || [];
    const todayCoupons = existingCoupons.filter(c => c.id.startsWith(`${y}${m}${d}`));
    const seq = String(todayCoupons.length + 1).padStart(4, '0');
    const couponId = `${y}${m}${d}${seq}`;
    
    const expireDate = new Date(now.getTime() + 30*24*60*60*1000);
    const coupon = {
      id: couponId,
      type: 'cert',
      title: '车辆认证奖励',
      desc: '恭喜完成车辆认证',
      amount: 30,
      status: 'valid',
      createTime: now.toISOString(),
      expireTime: expireDate.toISOString(),
      expireDate: `${expireDate.getFullYear()}-${String(expireDate.getMonth()+1).padStart(2,'0')}-${String(expireDate.getDate()).padStart(2,'0')}`,
      vehiclePlate: vehicle.plateNo,
    };
    existingCoupons.unshift(coupon);
    wx.setStorageSync('coupons', existingCoupons);
    
    wx.showModal({
      title: '🎉 认证通过！',
      content: `车辆 ${vehicle.plateNo} 认证已通过！\n\n系统已自动发放一张30元优惠券到您的账户。\n券号：${couponId}\n有效期：30天`,
      showCancel: false,
      confirmText: '查看优惠券',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/coupons/coupons' });
        }
      }
    });
  },

  // 省简称（旧编辑弹窗用）
  onPickProvince() { this.setData({ showProvincePicker: true }); },
  onCloseProvincePicker() { this.setData({ showProvincePicker: false }); },
  onSelectProvince(e) {
    this.setData({ 'editForm.province': e.currentTarget.dataset.province, showProvincePicker: false });
  },

  // ========== 品牌 / 颜色 / 类型（保持原有）==========
  onPickBrand() { this.setData({ showBrandPicker: true }); },
  onCloseBrandPicker() { this.setData({ showBrandPicker: false, showCustomBrand: false }); },
  onSelectBrand(e) {
    const brand = e.currentTarget.dataset.brand;
    if (brand === '__other__') { this.setData({ showCustomBrand: true, 'editForm.brandModel': '' }); }
    else { this.setData({ 'editForm.brandModel': brand, showBrandPicker: false, showCustomBrand: false }); }
  },
  onCustomBrandInput(e) { this.setData({ 'editForm.customBrand': e.detail.value }); },
  onConfirmCustomBrand() {
    const val = (this.data.editForm.customBrand || '').trim();
    if (val) this.setData({ 'editForm.brandModel': val, showBrandPicker: false, showCustomBrand: false });
  },
  onBrandLetterTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.createSelectorQuery().select(`#brand-${id}`).boundingClientRect().exec((res) => {
      if (res[0]) wx.pageScrollTo({ scrollTop: res[0].top, duration: 200 });
    });
  },
  onPickColor(e) {
    const c = e.currentTarget.dataset.color;
    if (c === '__other__') { this.setData({ showCustomColor: true, 'editForm.color': '', 'editForm.colorName': '' }); }
    else { this.setData({ 'editForm.color': c, 'editForm.colorName': e.currentTarget.dataset.name, showCustomColor: false }); }
  },
  onCustomColorInput(e) { this.setData({ 'editForm.customColor': e.detail.value }); },
  onConfirmCustomColor() {
    const val = (this.data.editForm.customColor || '').trim();
    if (val) this.setData({ 'editForm.color': '#666666', 'editForm.colorName': val, showCustomColor: false });
  },
  onSelectType(e) { this.setData({ 'editForm.vehicleType': e.currentTarget.dataset.type }); },
  onSwitchDefault(e) { this.setData({ 'editForm.isDefault': e.detail.value }); },

  onSaveVehicle() {
    const form = this.data.editForm;
    const plateLetter = (form.plateLetter || '').toUpperCase();
    const plateNum = (form.plateNum || '').toUpperCase().replace(/\s/g, '');
    const plateNo = form.province + plateLetter + plateNum;
    if (!plateLetter || !plateNum) { showToast('请填写完整的车牌号'); return; }
    if (plateNum.length < 4) { showToast('车牌号格式不正确'); return; }
    let vehicles = [...this.data.vehicles];
    const { editingId } = this.data;
    // 如果正在编辑认证车辆，保留认证状态
    const existing = editingId ? this.data.vehicles.find(v => v.id === editingId) : null;
    const isCertified = existing ? !!existing.certified : false;

    const vehicleData = {
      plateNo, brandModel: form.brandModel, color: form.color,
      colorName: form.colorName, vehicleType: form.vehicleType, isDefault: form.isDefault,
      certified: isCertified, certStatus: isCertified ? 'verified' : 'pending',
      ownerName: existing ? (existing.ownerName || '') : '',
      idNumber: '', drivingLicenseUrl: '', vin: '', engineNo: '',
    };
    if (editingId) {
      const idx = vehicles.findIndex(v => v.id === editingId);
      if (idx === -1) return;
      vehicles[idx] = { ...vehicles[idx], ...vehicleData };
    } else {
      if (vehicles.some(v => v.plateNo === plateNo)) { showToast('该车牌已添加'); return; }
      if (vehicles.length === 0) vehicleData.isDefault = true;
      vehicles.push({ id: `v${Date.now()}`, ...vehicleData });
    }
    if (vehicleData.isDefault) vehicles.forEach(v => { if (v.id !== (editingId || vehicles[vehicles.length-1].id)) v.isDefault = false; });
    if (!vehicles.some(v => v.isDefault) && vehicles.length > 0) vehicles[0].isDefault = true;
    this.saveVehicles(vehicles);
    this.setData({ showModal: false, editingId: '' });
    showToast(editingId ? '车辆已更新' : '车辆已添加');
  },

  onDeleteVehicle(e) {
    const id = e.currentTarget.dataset.id;
    const vehicle = this.data.vehicles.find(v => v.id === id);
    if (!vehicle) return;
    wx.showModal({
      title: '确认删除', content: `确定删除车辆 ${vehicle.plateNo} 吗？`, confirmColor: '#F97316',
      success: (res) => {
        if (!res.confirm) return;
        let vehicles = this.data.vehicles.filter(v => v.id !== id);
        if (vehicle.isDefault && vehicles.length > 0) vehicles[0].isDefault = true;
        this.saveVehicles(vehicles); showToast('已删除');
      },
    });
  },
  onSetDefault(e) {
    let vehicles = this.data.vehicles.map(v => ({ ...v, isDefault: v.id === e.currentTarget.dataset.id }));
    this.saveVehicles(vehicles); showToast('已设为默认车辆');
  },
  onCloseModal() { this.setData({ showModal: false, editingId: '' }); },

  // ========== 地址（保持原有）==========
  loadAddresses() {
    const saved = wx.getStorageSync('addressInfo') || {};
    const otherAddresses = (saved.otherAddresses || []).map((v, i) => ({ id: `oa${i}`, value: v }));
    this.setData({ savedAddresses: saved, currentAddress: saved.company || '', otherAddresses });
  },
  onToggleAddress() { this.setData({ showAddress: !this.data.showAddress }); },
  onSwitchAddrType(e) {
    const t = e.currentTarget.dataset.type;
    const s = this.data.savedAddresses;
    this.setData({ currentAddrType: t, currentAddress: t==='company'?(s.company||''):t==='home'?(s.home||''):'' });
  },
  onCurrentAddrInput(e) { this.setData({ currentAddress: e.detail.value }); },
  onAddOtherAddr() {
    const arr = [...this.data.otherAddresses]; arr.push({ id: `oa${Date.now()}`, value: '' });
    this.setData({ otherAddresses: arr });
  },
  onOtherAddrInput(e) {
    const arr = [...this.data.otherAddresses];
    const idx = arr.findIndex(a => a.id === e.currentTarget.dataset.id);
    if (idx > -1) { arr[idx].value = e.detail.value; this.setData({ otherAddresses: arr }); }
  },
  onDeleteOtherAddr(e) {
    this.setData({ otherAddresses: this.data.otherAddresses.filter(a => a.id !== e.currentTarget.dataset.id) });
  },
  onSaveAddress() {
    const { currentAddrType, currentAddress, otherAddresses } = this.data;
    const saved = this.data.savedAddresses || {};
    if (currentAddrType === 'company') saved.company = currentAddress;
    else if (currentAddrType === 'home') saved.home = currentAddress;
    saved.otherAddresses = (currentAddrType === 'other')
      ? [currentAddress, ...otherAddresses.map(a => a.value)].filter(v => v.trim())
      : otherAddresses.map(a => a.value).filter(v => v.trim());
    wx.setStorageSync('addressInfo', saved);
    this.setData({ savedAddresses: saved });
    showToast('地址已保存');
  },
});
