// 首页 v11 - WorkBuddy风格单页应用 + 多选筛选 + 区域筛选 + AI智能搜索
const app = getApp();
const { getParkingList, getFilterOptions, smartSearch, agentSearch } = require('../../utils/request');

// AI提示词数据
const AI_PROMPTS = {
  monthly: ['南山海岸城', '罗湖东门步行街', '福田皇庭广场', '龙华壹方城'],
  temp: ['科技园朗科大厦', '万象天地', '国贸大厦', '大中华广场'],
  charge: ['充电站', '小桔充电', '充电优惠', '新能源充电'],
};

// 活动Banner数据（仅保留注册送好礼，邀请送好礼移至详情页）
const BANNERS = [
  { type: 'register', title: '🎁 注册有礼', desc: '新用户填资料即送30元代金券，有效期一个月', action: 'goRegister' },
];

Page({
  data: {
    statusBarHeight: app.globalData.statusBarHeight || 44,
    isLogin: false, userAvatar: '',

    // 页面状态
    currentView: 'landing',
    showMenu: false,
    unreadCount: 0,

    // 定位
    locAvailable: false,
    locCity: '', locDistrict: '',
    isManualCity: false, locDisplay: '',

    // Banner
    banners: BANNERS,
    currentBanner: 0,

    // AI入口
    aiActive: '',
    aiPrompts: [],
    showAiPrompts: false,

    // 搜索
    searchValue: '',
    isRecording: false,

    // 停车列表
    cardType: 'monthly',
    selCity: '深圳', showCityDrop: false, showLandingCityDrop: false,
    selPeriods: [], selType: '', selSubs: [],
    selDistricts: [], selStreets: [],
    sortBy: 'distance', sortLabel: '位置最近',
    list: [], total: 0, loading: false, page: 1,
    scrollProgress: 0, scrollThumbHeight: 30, scrollToTop: -1,

    // 筛选面板
    showSortDrop: false,
    showFilterPanel: false,
    showDistrictPanel: false,
    filterStep: 0,

    // 筛选选项（云函数动态获取）
    filterOptions: { filterTree: {}, districts: [] },
    filterTree: {},
    filterTreeKeys: [],
    curTypes: [], curSubs: [], curSubLabel: '', curStreets: [],
    showFilterTags: [],

    // AI 搜索分析展示
    aiAnalysis: null,  // { query, steps: [{icon, text, status:'pending'|'running'|'done'|'error'}], result }
    aiNearbyLat: 0, aiNearbyLng: 0,  // AI附近搜索中心点
  },

  onLoad(options) {
    this.setData({
      isLogin: app.globalData.isLogin,
      userAvatar: (app.globalData.userInfo && app.globalData.userInfo.avatarUrl) || '',
    });
    this.getLocation();
    this.startBannerTimer();
    this.voiceInit();

    // 外部跳转参数：直接进入月卡页面
    if (options && options.view === 'parking') {
      this.onOpenParking();
    }
  },

  startBannerTimer() {
    this._bannerTimer = setInterval(() => {
      const next = (this.data.currentBanner + 1) % BANNERS.length;
      this.setData({ currentBanner: next });
    }, 4000);
  },

  onUnload() {
    if (this._bannerTimer) clearInterval(this._bannerTimer);
  },

  getLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (r) => {
        this.setData({ latitude: r.latitude, longitude: r.longitude, locAvailable: true });
        // 尝试逆地理编码获取城市名
        this.reverseGeo(r.latitude, r.longitude);
      },
      fail: () => this.setData({ latitude: 22.5431, longitude: 114.0579, locAvailable: false }),
    });
  },

  reverseGeo(lat, lng) {
    wx.cloud.callFunction({
      name: 'parking',
      data: { action: 'reverseGeo', latitude: lat, longitude: lng },
      success: (res) => {
        const d = res.result && res.result.data;
        if (d) {
          const city = d.city ? d.city.replace('市', '') : '';
          const matchedCity = ['深圳','广州','佛山','珠海'].includes(city) ? city : '深圳';
          this.setData({
            locCity: city,
            locDistrict: d.district || '',
            isManualCity: false,
            locDisplay: city + (d.district ? ' · ' + d.district : ''),
            selCity: matchedCity,
          });
        }
      },
      fail: () => { /* 静默失败 */ }
    });
  },

  // ====== Banner交互 ======
  onTapBanner() {
    const banner = BANNERS[this.data.currentBanner];
    if (banner.action === 'goRegister') {
      wx.navigateTo({ url: '/pages/profile/profile' });
    } else if (banner.action === 'goInvite') {
      this.setData({ currentView: 'parking' });
      this.onOpenParking();
    }
  },
  onBannerChange(e) {
    this.setData({ currentBanner: e.detail.current });
  },

  // ====== 主按钮 ======
  onOpenParking() {
    this.setData({ currentView: 'parking' });
    this.fetchFilterOptions();
    this.loadList();
  },
  onOpenCharge() {},
  onOpenMap() {
    wx.navigateTo({ url: '/pages/map/map' });
  },

  // ====== AI快捷入口 ======
  onAiTap(e) {
    const type = e.currentTarget.dataset.type;
    if (this.data.aiActive === type && this.data.showAiPrompts) {
      this.setData({ showAiPrompts: false, aiActive: '' });
      return;
    }
    this.setData({
      aiActive: type, showAiPrompts: true,
      aiPrompts: AI_PROMPTS[type] || [],
    });
  },
  onAiPromptTap(e) {
    const prompt = e.currentTarget.dataset.prompt;
    this.setData({ searchValue: prompt, showAiPrompts: false, aiActive: '' });
  },
  onAiClose() {
    this.setData({ showAiPrompts: false, aiActive: '' });
  },

  // ====== 搜索（支持自然语言AI智能搜索） ======
  onSearchInput(e) { this.setData({ searchValue: e.detail.value }); },
  onSearchClear() {
    this.setData({ searchValue: '', page: 1, list: [], total: 0, aiAnalysis: null, _aiOriginalList: null });
  },
  async onSearchConfirm() {
    const v = (this.data.searchValue || '').trim();
    if (!v) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' });
      return;
    }

    // 自然语言判断（不管是首页还是停车页都生效）
    const nlKeywords = ['帮我', '搜索', '找一下', '附近', '最近', '便宜', '划算', '推荐', '哪个', '哪里', '怎么', '预约', '多少钱', '周末', '今晚', '明晚', '明天'];
    const useSmartSearch = v.length > 10 || nlKeywords.some(k => v.includes(k));

    if (useSmartSearch) {
      // ====== AI智能搜索（首页和停车页都可用） ======
      const steps = [
        { icon: '🤖', label: 'AI分析意图', text: '正在理解您的需求...', status: 'running' },
      ];
      this.setData({
        aiAnalysis: { query: v, steps },
        currentView: 'parking',
        searchValue: v,
        page: 1,
        list: [],
        _aiOriginalList: null,
        selPeriods: [], selType: '', selSubs: [],
        selDistricts: [], selStreets: [],
        showFilterTags: [],
        sortBy: '', sortLabel: 'AI推荐',
      });

      try {
        const userCity = this.data.locCity || this.data.selCity || '深圳';
        const aiResult = await agentSearch(v, userCity);

        const resultData = aiResult.result ? aiResult.result : aiResult;
        if (resultData) {
          const r = resultData;
          const hasNearby = r.nearby && r.nearby.list && r.nearby.list.length > 0;
          const agentSteps = r.steps || [];

          if (hasNearby) {
            const nearbyList = r.nearby.list.map(item => {
              const pkgs = (item.pk || []).map(p => ({
                name: p.n, price: p.p, period: p.t,
                packageType: p.y || '', subType: p.s || '',
                limitType: p.l || '', timeRange: p.r || '',
                validDays: p.d || 0,
                groupPrice3: p.g3, groupPrice10: p.g10 || p.g15, perUsePrice: p.pu, originalPrice: p.op,
              }));
              let mp = item.mp || 0;
              if (!mp && pkgs.length) {
                const prices = pkgs.map(p => p.price || p.originalPrice || 0).filter(v => v > 0);
                mp = prices.length ? Math.min(...prices) : 0;
              }
              return {
                _id: item.id, name: item.na || '', address: item.ad || '',
                district: item.di || '', street: item.st || '',
                latitude: item.la || 0, longitude: item.lo || 0,
                minPrice: mp, cardType: item.ct || '', feeDesc: item.fd || '',
                _dist: item.dist || 0,
                distance: item.dist >= 1 ? item.dist.toFixed(1) + '千米' : item.dist >= 0.05 ? (item.dist * 1000).toFixed(0) + '米' : (item.dist * 1000).toFixed(0) + 'm',
                packages: pkgs, packageCount: item.pc || 0,
              };
            });

            this.setData({
              aiAnalysis: { query: v, steps: agentSteps, resolved: true, total: nearbyList.length },
              list: nearbyList, total: r.nearby.total, page: 1, noMore: true,
              cardType: (r.parsed?.cardType) || 'count',
              selDistricts: [], sortBy: '', sortLabel: 'AI推荐',
              aiNearbyLat: r.nearby.lat, aiNearbyLng: r.nearby.lng,
              currentView: 'parking', searchValue: v,
            });
            this._aiOriginalList = [...nearbyList];
            this.fetchFilterOptions();
            return;
          }

          const parsed = r.parsed || r;
          this.setData({ aiAnalysis: { query: v, steps: agentSteps, resolved: true, total: 0 } });
          if (parsed.keyword) { app.globalData.searchKeyword = parsed.keyword; }
          else { app.globalData.searchKeyword = v; }
          const updates = { currentView: 'parking', searchValue: v, page: 1, list: [] };
          if (parsed.cardType) updates.cardType = parsed.cardType;
          if (parsed.sortBy) { updates.sortBy = parsed.sortBy; updates.sortLabel = parsed.sortBy === 'distance' ? '位置最近' : '价格最低'; }
          if (parsed.district) updates.selDistricts = [parsed.district];
          this.setData(updates);
        } else {
          app.globalData.searchKeyword = v;
          steps[0].status = 'error';
          steps[0].text = 'AI未能理解，尝试关键词搜索';
          steps.push({ icon: '🔍', label: '关键词搜索', text: `搜索"${v}"`, status: 'done' });
          this.setData({ aiAnalysis: { query: v, steps, resolved: true, total: 0 }, currentView: 'parking', page: 1, list: [] });
        }
      } catch (e) {
        steps[0].status = 'error';
        steps[0].text = 'AI服务暂不可用，转为关键词搜索';
        steps.push({ icon: '🔍', label: '关键词搜索', text: `搜索"${v}"`, status: 'done' });
        this.setData({
          aiAnalysis: { query: v, steps, resolved: true, total: 0 },
          currentView: 'parking', searchValue: v, page: 1, list: [],
          _aiOriginalList: null, selPeriods: [], selType: '', selSubs: [],
          selDistricts: [], selStreets: [], showFilterTags: [],
          sortBy: '', sortLabel: 'AI推荐',
        });
        app.globalData.searchKeyword = v;
      }
    } else {
      app.globalData.searchKeyword = v;
      this.setData({ currentView: 'parking', page: 1, list: [] });
    }
    this.fetchFilterOptions();
    this.loadList();
  },

  // ====== 语音输入（微信同声传译插件） ======
  voiceInit() {
    try {
      const plugin = requirePlugin('WechatSI');
      this._voiceManager = plugin.getRecordRecognitionManager();
      this._voiceManager.onRecognize = (res) => {
        // 实时识别结果
        if (res && res.result) {
          this.setData({ searchValue: res.result });
        }
      };
      this._voiceManager.onStop = (res) => {
        // 识别完成
        this.setData({ isRecording: false });
        wx.hideToast();
        const text = (res && res.result) ? res.result : '';
        if (text) {
          this.setData({ searchValue: text });
          // 自动触发搜索
          setTimeout(() => {
            this.onSearchConfirm();
          }, 300);
        } else {
          wx.showToast({ title: '未识别到语音内容', icon: 'none' });
        }
      };
      this._voiceManager.onError = (res) => {
        this.setData({ isRecording: false });
        wx.hideToast();
        wx.showToast({ title: res.msg || '语音识别失败，请重试', icon: 'none' });
      };
      this._voiceReady = true;
    } catch (e) {
      // 插件不可用时降级
      this._voiceReady = false;
    }
  },
  onVoiceStart() {
    if (!this._voiceReady) {
      this.voiceInit();
      if (!this._voiceReady) {
        wx.showToast({ title: '语音功能初始化中，请稍后再试', icon: 'none' });
        return;
      }
    }
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ isRecording: true, searchValue: '' });
        this._voiceManager.start({ lang: 'zh_CN', duration: 15000 });
      },
      fail: () => {
        wx.showModal({
          title: '需要录音权限', content: '请在设置中开启',
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

  // ====== 侧边菜单 ======
  onToggleMenu() { this.setData({ showMenu: !this.data.showMenu }); if (!this.data.showMenu) return; this.fetchUnreadCount(); },
  onCloseMenu() { this.setData({ showMenu: false }); },
  async fetchUnreadCount() {
    try {
      const res = await wx.cloud.callFunction({ name: 'notification', data: { action: 'unreadCount' } });
      if (res.result && res.result.code === 0) {
        this.setData({ unreadCount: res.result.data || 0 });
      }
    } catch (e) { /* 忽略 */ }
  },
  onMenuItem(e) {
    const route = e.currentTarget.dataset.route;
    this.setData({ showMenu: false });
    if (route === 'parking') { this.onOpenParking(); return; }
    if (route === 'promo') { wx.showToast({ title: '优惠活动开发中', icon: 'none' }); return; }
    wx.navigateTo({ url: route });
  },

  // ====== 获取筛选选项（从云函数动态加载） ======
  async fetchFilterOptions() {
    try {
      const data = await getFilterOptions(this.data.cardType);
      if (data) {
        this.setData({ 
          filterOptions: data,
          filterTree: data.filterTree || {},
          filterTreeKeys: Object.keys(data.filterTree || {}).sort(),
        });
      }
    } catch (e) {
      // 静默失败，使用已有的默认值
    }
  },

  // ====== 停车列表 ======
  onBackLanding() {
    this.setData({ currentView: 'landing', list: [], aiAnalysis: null });
  },

  // AI分析框展开/收起
  onToggleAiAnalysis() {
    const a = this.data.aiAnalysis;
    if (!a) return;
    a._collapsed = !a._collapsed;
    this.setData({ aiAnalysis: a });
  },

  async loadList() {
    const isFirstPage = this.data.page === 1;
    this.setData({ loading: true, showSortDrop: false, showCityDrop: false });
    try {
      const params = { cardType: this.data.cardType, page: this.data.page, pageSize: 50 };
      if (this.data.selCity) params.city = this.data.selCity;
      if (this.data.selPeriods.length) params.period = this.data.selPeriods.join(',');
      if (this.data.selType) params.packageType = this.data.selType;
      if (this.data.selSubs.length) params.subType = this.data.selSubs.join(',');
      if (this.data.selDistricts.length) params.district = this.data.selDistricts.join(',');
      if (this.data.selStreets.length) params.street = this.data.selStreets.join(',');
      if (this.data.searchValue) params.keyword = this.data.searchValue;

      const result = await getParkingList(params);
      let items = result && result.list ? result.list : [];
      let total = result && result.total ? result.total : items.length;

      const newList = items.map(i => this.unpack(i));
      if (this.data.sortBy === 'distance') newList.sort((a,b)=>a._dist-b._dist);
      else if (this.data.sortBy === 'price') newList.sort((a,b)=>(a.minPrice||999999)-(b.minPrice||999999));

      // 首页替换，后续页追加
      const list = isFirstPage ? newList : [...this.data.list, ...newList];
      this.setData({ list, total, loading: false });
    } catch(e) { this.setData({ loading: false, list: [] }); }
  },

  // 滚动到底部加载更多
  onLoadMore() {
    if (this.data.loading) return;
    if (this.data.list.length >= this.data.total) return;
    this.setData({ page: this.data.page + 1 });
    this.loadList();
  },

  // 滚动进度条更新
  onScroll(e) {
    if (this._progressDrag) return; // 拖拽中不更新进度条
    const { scrollTop, scrollHeight } = e.detail;
    if (!scrollHeight || !this.data.total) return;

    const loadedRatio = Math.min(this.data.list.length / this.data.total, 1);
    const estTotalHeight = scrollHeight / loadedRatio;
    this._estTotalHeight = estTotalHeight;

    const progress = Math.min((scrollTop / estTotalHeight) * 100, 100);
    const viewRatio = Math.max((scrollHeight / estTotalHeight) * 100, 6);

    if (Math.abs(progress - this.data.scrollProgress) > 0.5 || Math.abs(viewRatio - this.data.scrollThumbHeight) > 0.5) {
      this.setData({ scrollProgress: Math.round(progress), scrollThumbHeight: Math.round(viewRatio) });
    }
  },

  // ====== 进度条拖拽 ======
  onProgressTouchStart(e) { this._progressDrag = true; },
  onProgressTouchMove(e) {
    const touch = e.touches[0];
    if (!touch || !this._estTotalHeight) return;
    // 创建查询获取进度条轨道位置
    const query = wx.createSelectorQuery().in(this);
    query.select('.sp-track').boundingClientRect();
    query.exec((res) => {
      if (!res[0]) return;
      const track = res[0];
      const ratio = Math.max(0, Math.min(1, (touch.clientY - track.top) / track.height));
      const targetScrollTop = ratio * this._estTotalHeight;
      const progress = ratio * 100;

      this.setData({
        scrollToTop: targetScrollTop,
        scrollProgress: Math.round(progress)
      });
    });
  },
  onProgressTouchEnd() {
    this._progressDrag = false;
    // 重置 scrollToTop 以允许后续自由滚动
    setTimeout(() => this.setData({ scrollToTop: -1 }), 100);
  },

  unpack(item) {
    const pkgs = (item.pk||[]).map(p=>({
      name:p.n, price:p.p, period:p.t, packageType:p.y, subType:p.s, limitType:p.l,
      timeRange:p.r, validDays:p.d, inOutCount:p.c,
      groupPrice3:p.g3, groupPrice10:p.g10 || p.g15, perUsePrice:p.pu, originalPrice:p.op
    }));
    const isCount = item.ct === 'count';
    const displayPrice = isCount && pkgs.length
      ? Math.round(Math.min(...pkgs.map(p => p.perUsePrice || 999999)) * 100) / 100
      : (item.mp || (pkgs.length ? Math.min(...pkgs.map(p => p.price || 999999)) : 0));
    let dist=Infinity,dt='未知';
    if(item.la&&item.lo&&this.data.latitude&&this.data.longitude){dist=this.calcDist(this.data.latitude,this.data.longitude,item.la,item.lo);dt=this.fmtDist(dist);}
    return{_id:item.id,name:item.na,address:item.ad,district:item.di,minPrice:displayPrice,cardType:item.ct,packageTags:item.pt||[],packages:pkgs,distance:dt,_dist:dist,latitude:item.la,longitude:item.lo,feeDesc:item.fd};
  },
  calcDist(l1,n1,l2,n2){const R=6371000,a=(l2-l1)*Math.PI/180,b=(n2-n1)*Math.PI/180;const c=Math.sin(a/2)**2+Math.cos(l1*Math.PI/180)*Math.cos(l2*Math.PI/180)*Math.sin(b/2)**2;return R*2*Math.atan2(Math.sqrt(c),Math.sqrt(1-c));},
  fmtDist(m){return m<1000?Math.round(m)+'m':(m/1000).toFixed(1)+'km';},

  onSwitchCard(e){
    const t=e.currentTarget.dataset.type;
    this.setData({cardType:t, page:1, list:[],
      selPeriods: t === 'count' ? ['次卡'] : [],
      selType:'', selSubs:[],
      selDistricts:[], selStreets:[],
      aiAnalysis: null,
    });
    this.fetchFilterOptions();
    this.loadList();
  },

  // ====== 智能筛选（排序） ======
  onToggleSortDrop(){this.setData({showSortDrop:!this.data.showSortDrop, showCityDrop:false});},
  onNearMe() {
    this.setData({ showCityDrop: false, showSortDrop: false });
    // 获取当前位置并按距离排序
    wx.getLocation({
      type: 'gcj02',
      success: (r) => {
        this.setData({
          latitude: r.latitude, longitude: r.longitude,
          sortBy: 'distance', sortLabel: '位置最近',
          page: 1, list: [], locAvailable: true,
          selCity: this.data.locCity || '深圳',
          isManualCity: false,
          locDisplay: this.data.locCity + (this.data.locDistrict ? ' · ' + this.data.locDistrict : ''),
        });
        this.loadList();
      },
      fail: () => {
        wx.showToast({ title: '无法获取位置，请授权定位权限', icon: 'none', duration: 2000 });
        this.setData({ sortBy: 'distance', sortLabel: '位置最近', page: 1, list: [] });
        this.loadList();
      },
    });
  },
  onSortDistance(){
    // AI搜索结果 → 客户端按距离重排，不清空
    const list = this.data.list;
    if (this.data.aiAnalysis && list.length > 0 && list[0]._dist !== undefined) {
      const sorted = [...list].sort((a, b) => (a._dist || 9999) - (b._dist || 9999));
      this.setData({ list: sorted, sortBy: 'distance', sortLabel: '位置最近' });
      return;
    }
    this.setData({ sortBy: 'distance', sortLabel: '位置最近', page: 1, list: [] });
    this.loadList();
  },
  onSortPrice(){
    const list = this.data.list;
    if (this.data.aiAnalysis && list.length > 0 && list[0]._dist !== undefined) {
      const sorted = [...list].sort((a, b) => (a.minPrice || 9999) - (b.minPrice || 9999));
      this.setData({ list: sorted, sortBy: 'price', sortLabel: '价格最低' });
      return;
    }
    this.setData({ sortBy: 'price', sortLabel: '价格最低', page: 1, list: [] });
    this.loadList();
  },

  // ====== 城市筛选 ======
  onToggleCity(){this.setData({showCityDrop:!this.data.showCityDrop, showSortDrop:false});},
  onPickCity(e){
    const city = e.currentTarget.dataset.city;
    const isManual = city !== this.data.locCity;
    this.setData({
      selCity: city, showCityDrop: false, page: 1, list: [],
      isManualCity: isManual,
      locDisplay: isManual ? city : (this.data.locCity + (this.data.locDistrict ? ' · ' + this.data.locDistrict : '')),
    });
    this.fetchFilterOptions();
    this.loadList();
  },

  // ====== Landing页城市选择 ======
  onPickMyLocation() {
    // 点击"我的位置"：重新GPS定位并回填城市+区
    wx.getLocation({
      type: 'gcj02',
      success: (r) => {
        this.setData({ latitude: r.latitude, longitude: r.longitude, locAvailable: true, showLandingCityDrop: false });
        wx.cloud.callFunction({
          name: 'parking',
          data: { action: 'reverseGeo', latitude: r.latitude, longitude: r.longitude },
          success: (res) => {
            const d = res.result && res.result.data;
            if (d) {
              const city = d.city ? d.city.replace('市', '') : '';
              const district = d.district || '';
              const matchedCity = ['深圳','广州','佛山','珠海'].includes(city) ? city : '深圳';
              this.setData({
                locCity: city,
                locDistrict: district,
                selCity: matchedCity,
                isManualCity: false,
                locDisplay: city + (district ? ' · ' + district : ''),
              });
            }
          },
        });
      },
      fail: () => {
        wx.showToast({ title: '请开启定位权限', icon: 'none' });
        this.setData({ showLandingCityDrop: false });
      },
    });
  },
  onToggleLandingCity() {
    this.setData({ showLandingCityDrop: !this.data.showLandingCityDrop });
  },
  onCloseLandingCity() {
    this.setData({ showLandingCityDrop: false });
  },
  onPickLandingCity(e) {
    const city = e.currentTarget.dataset.city;
    const isManual = city !== this.data.locCity;
    this.setData({
      selCity: city,
      isManualCity: isManual,
      locDisplay: isManual ? city : (this.data.locCity + (this.data.locDistrict ? ' · ' + this.data.locDistrict : '')),
      showLandingCityDrop: false,
    });
  },

  // ====== 三级条件筛选（周期L1 → 类型L2 → 细分L3） ======
  onOpenFilter(){
    const tree = this.data.filterOptions.filterTree || {};
    const isCount = this.data.cardType === 'count';
    
    // 次卡：L1固定为"次卡"，直接从L2开始
    // 月卡：从L1开始
    if (isCount) {
      this.setData({
        showFilterPanel: true, filterStep: 1,
        selPeriods: ['次卡'],
        selType: '', selSubs: [],
        showFilterTags: [],
        curTypes: Object.keys(tree['次卡'] || {}),
        curSubs: [], curSubLabel: '',
      });
    } else {
      this.setData({
        showFilterPanel: true, filterStep: 0,
        curTypes: [], curSubs: [], curSubLabel: '',
        showFilterTags: [],
      });
    }
  },
  onCloseFilter(){this.setData({showFilterPanel:false});},
  _noop(){},

  // L1: 选择周期（月卡/季卡/半年卡/年卡）多选
  onPickPeriod(e){
    const v = e.currentTarget.dataset.value;
    let arr = [...this.data.selPeriods];
    const idx = arr.indexOf(v);
    idx > -1 ? arr.splice(idx, 1) : arr.push(v);
    
    // 收集选中L1下所有L2选项
    const tree = this.data.filterOptions.filterTree || {};
    const typesSet = new Set();
    arr.forEach(p => {
      Object.keys(tree[p] || {}).forEach(t => typesSet.add(t));
    });
    
    // L1变化时，已选L2若不在新L2集合中则清空
    const newTypes = [...typesSet].sort();
    const selType = this.data.selType;
    const validType = selType && typesSet.has(selType) ? selType : '';
    
    this.setData({
      selPeriods: arr,
      filterStep: arr.length ? 1 : 0,
      selType: validType, selSubs: [],
      curTypes: newTypes,
      curSubs: [], curSubLabel: '',
    });
  },
  
  // L2: 选择类型（全部日间/全部夜间/全部全天）单选
  onPickType(e){
    const v = e.currentTarget.dataset.value;
    const current = this.data.selType;
    
    // 单选：同值取消，异值切换
    const newType = current === v ? '' : v;
    
    // 获取新选中L2下（在选中L1范围内）的L3选项
    const tree = this.data.filterOptions.filterTree || {};
    const periods = this.data.selPeriods;
    const subsSet = new Set();
    
    if (newType) {
      periods.forEach(p => {
        const pNode = tree[p] || {};
        (pNode[newType] || []).forEach(s => subsSet.add(s));
      });
    }
    
    this.setData({
      selType: newType,
      filterStep: newType ? 2 : 1,
      selSubs: [],
      curSubs: [...subsSet].sort(),
      curSubLabel: '',
    });
  },
  
  // L3: 选择细分
  onPickSub(e){
    const v = e.currentTarget.dataset.value;
    let arr = [...this.data.selSubs];
    const idx = arr.indexOf(v);
    idx > -1 ? arr.splice(idx, 1) : arr.push(v);
    this.setData({ selSubs: arr });
  },
  
  onConfirmFilter(){
    this.setData({ showFilterPanel: false });
    // 计算标签显示：只显示最细粒度
    this._updateFilterTags();
    
    if (this.data.aiAnalysis) {
      this.filterAiList();
      return;
    }
    this.setData({ page: 1, list: [] });
    this.loadList();
  },
  
  _updateFilterTags(){
    // 显示最细粒度选中项：L3有选→L3，否则L2有选→L2，否则L1
    const { selSubs, selType, selPeriods } = this.data;
    let tags = [];
    if (selSubs.length) {
      tags = [...selSubs];
    } else if (selType) {
      tags = [selType];
    } else {
      tags = [...selPeriods];
    }
    this.setData({ showFilterTags: tags });
  },

  _reapplyFilter(){
    if (this.data.aiAnalysis) {
      this.filterAiList();
    } else {
      this.setData({ page: 1, list: [] });
      this.loadList();
    }
  },

  onTagRemove(e){
    const v = e.currentTarget.dataset.value;
    const { selSubs, selType, selPeriods } = this.data;
    const tree = this.data.filterOptions.filterTree || {};

    // 1) 尝试从L3移除
    let arr = [...selSubs];
    let idx = arr.indexOf(v);
    if (idx > -1) {
      arr.splice(idx, 1);
      this.setData({ selSubs: arr });
      this._updateFilterTags();
      this._reapplyFilter();
      return;
    }
    // 2) 尝试从L2移除
    if (v === selType) {
      this.setData({ selType: '', selSubs: [], filterStep: 1, curSubs: [] });
      this._updateFilterTags();
      this._reapplyFilter();
      return;
    }
    // 3) 尝试从L1移除
    arr = [...selPeriods];
    idx = arr.indexOf(v);
    if (idx > -1) {
      arr.splice(idx, 1);
      // 重新计算L2选项
      const typesSet = new Set();
      arr.forEach(p => { Object.keys(tree[p]||{}).forEach(t => typesSet.add(t)); });
      const validType = selType && typesSet.has(selType) ? selType : '';
      this.setData({
        selPeriods: arr,
        filterStep: arr.length ? 1 : 0,
        selType: validType, selSubs: [],
        curTypes: [...typesSet].sort(),
        curSubs: [],
      });
      this._updateFilterTags();
      this._reapplyFilter();
    }
  },
  
  onResetFilter(){
    const isCount = this.data.cardType === 'count';
    this.setData({
      selPeriods: isCount ? ['次卡'] : [],
      selType: '', selSubs: [],
      filterStep: isCount ? 1 : 0,
      curSubs: [], curSubLabel: '', curTypes: [],
      showFilterTags: [],
    });
    if (this.data.aiAnalysis) {
      this.restoreAiList();
      return;
    }
    this.setData({ page: 1, list: [] });
    this.loadList();
  },

  // 标签栏"全部清除"：同时清除条件筛选 + 区域筛选
  onResetAll(){
    this.setData({ selDistricts: [], selStreets: [], curStreets: [] });
    this.onResetFilter();
  },

  // 对AI搜索结果做客户端周期/类型筛选
  filterAiList() {
    const { selPeriods, selType, selSubs } = this.data;
    const hasPeriod = selPeriods.length > 0;
    const hasType = !!selType;
    const hasSub = selSubs.length > 0;
    if (!hasPeriod && !hasType && !hasSub) return;

    let filtered = this._aiOriginalList || this.data.list;
    // 保存原始列表以便恢复
    if (!this._aiOriginalList) this._aiOriginalList = [...this.data.list];

    if (hasPeriod) {
      filtered = filtered.filter(item => {
        const pkgs = item.packages || [];
        return pkgs.some(p => selPeriods.some(sp => (p.period || '').includes(sp)));
      });
    }
    if (hasType) {
      filtered = filtered.filter(item => {
        const pkgs = item.packages || [];
        return pkgs.some(p => {
          const matchField = (p.packageType || p.type || p.period || '');
          return matchField.includes(selType);
        });
      });
    }
    if (hasSub) {
      filtered = filtered.filter(item => {
        const pkgs = item.packages || [];
        return pkgs.some(p => selSubs.some(ss => (p.subType || p.name || '').includes(ss)));
      });
    }

    this.setData({ list: filtered, total: filtered.length });
  },
  restoreAiList() {
    if (this._aiOriginalList) {
      this.setData({ list: [...this._aiOriginalList], total: this._aiOriginalList.length });
    }
  },

  // ====== 区域筛选（区 → 街道级联，支持多选） ======
  onOpenDistrict(){
    this.setData({ showDistrictPanel: true, curStreets: [] });
  },
  onCloseDistrict(){this.setData({showDistrictPanel:false});},
  onPickDistrict(e){
    const v = e.currentTarget.dataset.value;
    let arr = [...this.data.selDistricts];
    const idx = arr.indexOf(v);
    idx > -1 ? arr.splice(idx, 1) : arr.push(v);

    // 收集选中区的所有街道
    const streets = [];
    const opts = this.data.filterOptions || {};
    (opts.districts || []).forEach(d => {
      if (arr.includes(d.name) && d.streets) {
        d.streets.forEach(s => { if (!streets.includes(s)) streets.push(s); });
      }
    });

    this.setData({
      selDistricts: arr,
      curStreets: streets,
      selStreets: arr.length ? this.data.selStreets.filter(s => streets.includes(s)) : [],
    });
  },
  onPickStreet(e){
    const v = e.currentTarget.dataset.value;
    let arr = [...this.data.selStreets];
    const idx = arr.indexOf(v);
    idx > -1 ? arr.splice(idx, 1) : arr.push(v);
    this.setData({ selStreets: arr });
  },
  onConfirmDistrict(){
    this.setData({ showDistrictPanel: false, page: 1, list: [] });
    this.loadList();
  },
  onResetDistrict(){
    this.setData({ selDistricts: [], selStreets: [], curStreets: [], page: 1, list: [] });
    this.loadList();
  },

  // ====== 列表项点击 ======
  onTapItem(e){
    const id=e.currentTarget.dataset.id;
    const item=this.data.list.find(i=>i._id===id);
    if(item)app.globalData.currentParking=item;
    wx.navigateTo({url:`/pages/detail/detail?id=${id}&type=${this.data.cardType}`});
  },
  onShareAppMessage(){
    return{title:'粤停汇 - 停车比价AI助手',path:'/pages/index/index',imageUrl:'/images/logo-share.png'};
  },
});
