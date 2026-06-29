// 停车分布地图
const { callFunction } = require('../../utils/auth');

Page({
  data: {
    latitude: 22.543,
    longitude: 114.058,
    scale: 11,
    markers: [],
    total: 0,
    showLegend: false,
    cardFilter: '', // '' | 'monthly' | 'count'
    loading: false,
  },

  onLoad() {
    this.loadMarkers();
  },

  onBack() {
    wx.navigateBack();
  },

  // 地图区域变化时重新加载
  onRegionChange(e) {
    if (e.type === 'end' && e.causedBy === 'drag') {
      // 防抖：拖拽结束后500ms加载
      clearTimeout(this._regionTimer);
      this._regionTimer = setTimeout(() => this.loadMarkers(e.detail), 500);
    }
  },

  /**
   * 从云函数加载当前视口内的标记
   */
  async loadMarkers(region) {
    const mapCtx = wx.createMapContext('parkingMap');
    if (!region) {
      // 首次加载用当前视口
      mapCtx.getRegion({
        success: (res) => this._fetchMarkers(res),
        fail: () => {
          // 兜底：深圳市区默认范围
          this._fetchMarkers({
            southwest: { latitude: 22.4, longitude: 113.7 },
            northeast: { latitude: 22.9, longitude: 114.7 },
          });
        },
      });
    } else {
      this._fetchMarkers(region);
    }
  },

  async _fetchMarkers(region) {
    const { southwest, northeast } = region;
    if (!southwest || !northeast) return;

    this.setData({ loading: true });

    try {
      const result = await callFunction('parking', {
        action: 'bounds',
        swLat: southwest.latitude,
        swLng: southwest.longitude,
        neLat: northeast.latitude,
        neLng: northeast.longitude,
        cardType: this.data.cardFilter || '',
      });

      if (result && result.list) {
        const markers = result.list.map(item => ({
          id: item.id,
          latitude: item.la,
          longitude: item.lo,
          width: 24,
          height: 24,
          iconPath: item.ct === 'count' ? '/images/marker-blue.png' : '/images/marker-orange.png',
          callout: {
            content: item.na,
            color: '#1A1A2E',
            fontSize: 13,
            borderRadius: 8,
            padding: 6,
            display: 'BYCLICK',
            textAlign: 'center',
          },
          // 自定义数据传递给点击事件
          name: item.na,
          address: item.ad,
          district: item.di,
          minPrice: item.mp,
          cardType: item.ct,
          packageCount: item.pc,
        }));

        this.setData({
          markers,
          total: result.total || markers.length,
          truncated: result.truncated || false,
        });
      }
    } catch (e) {
      console.error('加载地图标记失败:', e);
    }

    this.setData({ loading: false });
  },

  // 点击标记
  onMarkerTap(e) {
    const markerId = e.detail.markerId;
    const marker = this.data.markers.find(m => m.id === markerId);
    if (!marker) return;

    wx.showModal({
      title: marker.name,
      content: `${marker.address || ''}\n${marker.district || ''} · ${marker.cardType === 'count' ? '次卡' : '月卡'} · ${marker.packageCount}个套餐\n最低 ¥${marker.minPrice}/月`,
      confirmText: '查看详情',
      cancelText: '关闭',
      success: (r) => {
        if (r.confirm) {
          wx.navigateTo({ url: `/pages/detail/detail?id=${marker.id}` });
        }
      },
    });
  },

  // 筛选卡类型
  onFilterCard(e) {
    const type = e.currentTarget.dataset.type;
    const newFilter = this.data.cardFilter === type ? '' : type;
    this.setData({ cardFilter: newFilter, markers: [] }, () => {
      this.loadMarkers();
    });
  },

  // 图例开关
  onToggleLegend() {
    this.setData({ showLegend: !this.data.showLegend });
  },

  // 重置视图
  onResetView() {
    this.setData({ latitude: 22.543, longitude: 114.058, scale: 11, markers: [] }, () => {
      // 重设后需要重新获取region加载标记
      setTimeout(() => this.loadMarkers(), 300);
    });
  },
});
