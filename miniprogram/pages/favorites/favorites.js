const { getMyFavorites } = require('../../utils/request');

Page({
  data: { favorites: [], loading: true },

  onShow() {
    this.loadFavorites();
  },

  async loadFavorites() {
    this.setData({ loading: true });
    try {
      const data = await getMyFavorites();
      this.setData({ favorites: data || [], loading: false });
    } catch (err) {
      this.setData({ loading: false });
    }
  },

  onTapParking(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}` });
  },

  onGoHome() {
    wx.navigateBack();
  },
});
