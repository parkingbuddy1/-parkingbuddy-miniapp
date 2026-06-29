const { searchParking } = require('../../utils/request');
const { debounce } = require('../../utils/util');

Page({
  data: {
    keyword: '',
    results: [],
    total: 0,
    loading: false,
    history: [],
  },

  onLoad() {
    const history = wx.getStorageSync('searchHistory') || [];
    this.setData({ history });
  },

  // 搜索（防抖）
  onSearchInput: debounce(function (e) {
    const keyword = e.detail.value || '';
    this.setData({ keyword });
    if (keyword.trim()) {
      this.doSearch(keyword);
    }
  }, 500),

  onSearch(e) {
    const keyword = (e.detail && e.detail.value) || this.data.keyword;
    if (!keyword.trim()) return;
    this.doSearch(keyword);
  },

  onClear() {
    this.setData({ keyword: '', results: [], total: 0 });
  },

  async doSearch(keyword) {
    this.setData({ loading: true });
    try {
      const data = await searchParking(keyword);
      this.setData({ results: (data && data.list) || [], total: (data && data.total) || 0, loading: false });
      this.saveHistory(keyword);
    } catch (err) {
      this.setData({ loading: false });
    }
  },

  saveHistory(keyword) {
    let history = wx.getStorageSync('searchHistory') || [];
    history = history.filter((h) => h !== keyword);
    history.unshift(keyword);
    if (history.length > 10) history = history.slice(0, 10);
    wx.setStorageSync('searchHistory', history);
    this.setData({ history });
  },

  onTapHistory(e) {
    const { keyword } = e.currentTarget.dataset;
    this.setData({ keyword });
    this.doSearch(keyword);
  },

  onClearHistory() {
    wx.removeStorageSync('searchHistory');
    this.setData({ history: [] });
  },

  onTapResult(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },
});
