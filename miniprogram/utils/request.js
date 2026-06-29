// 数据请求层 - 封装所有云函数调用
// 每个函数对应一个业务 API

const { callFunction } = require('./auth');

// ====== 停车场相关 ======

/**
 * 获取停车场列表
 * @param {object} params - { keyword, district, lat, lng, page, pageSize }
 */
async function getParkingList(params = {}) {
  return callFunction('parking', {
    action: 'list',
    ...params,
  });
}

/**
 * 获取停车场详情（含套餐）
 * @param {string} id - 停车场 ID
 */
async function getParkingDetail(id) {
  return callFunction('parking', {
    action: 'detail',
    id,
  });
}

/**
 * 搜索停车场
 * @param {string} keyword - 搜索关键词
 */
async function searchParking(keyword) {
  return callFunction('parking', {
    action: 'search',
    keyword,
  });
}

/**
 * 获取推荐套餐组合（AI 推荐）
 * @param {object} params - { homeAddress, workAddress, carType }
 */
async function getRecommendPackages(params) {
  return callFunction('parking', {
    action: 'recommend',
    ...params,
  });
}

// ====== 订单相关 ======

/**
 * 创建订单
 * @param {object} orderData - { parkingId, packageId, quantity, couponId }
 */
async function createOrder(orderData) {
  return callFunction('order', {
    action: 'create',
    ...orderData,
  });
}

/**
 * 获取订单列表
 * @param {number} page - 页码
 * @param {string} status - 状态筛选
 */
async function getOrderList(page = 1, status = '') {
  return callFunction('order', {
    action: 'list',
    page,
    status,
  });
}

/**
 * 获取正在拼团列表
 * @param {string} parkingId - 停车场ID
 */
async function getPins(parkingId) {
  return callFunction('order', {
    action: 'pins',
    parkingId,
  });
}

/**
 * 获取订单详情
 * @param {string} orderId - 订单 ID
 */
async function getOrderDetail(orderId) {
  return callFunction('order', {
    action: 'detail',
    orderId,
  });
}

/**
 * 取消订单
 * @param {string} orderId - 订单 ID
 */
async function cancelOrder(orderId) {
  return callFunction('order', {
    action: 'cancel',
    orderId,
  });
}

// ====== 优惠券相关 ======

/**
 * 获取我的优惠券列表
 * @param {string} status - valid | used | expired
 */
async function getMyCoupons(status = 'valid') {
  return callFunction('coupon', {
    action: 'myList',
    status,
  });
}

/**
 * 领取优惠券
 * @param {string} couponId - 优惠券 ID
 */
async function claimCoupon(couponId) {
  return callFunction('coupon', {
    action: 'claim',
    couponId,
  });
}

/**
 * 获取分享优惠券（裂变）
 * @param {string} shareCode - 分享码
 */
async function getShareCoupon(shareCode) {
  return callFunction('coupon', {
    action: 'shareReceive',
    shareCode,
  });
}

// ====== 收藏相关 ======

/**
 * 收藏/取消收藏停车场
 * @param {string} parkingId - 停车场 ID
 * @param {boolean} isFavorite - 是否收藏
 */
async function toggleFavorite(parkingId, isFavorite) {
  return callFunction('parking', {
    action: isFavorite ? 'addFavorite' : 'removeFavorite',
    parkingId,
  });
}

/**
 * 获取我的收藏列表
 */
async function getMyFavorites() {
  return callFunction('parking', {
    action: 'favoriteList',
  });
}

/**
 * 获取筛选选项（区域、周期、类型、细分等）
 * @param {string} cardType - 'monthly' | 'count'
 */
async function getFilterOptions(cardType = 'monthly') {
  return callFunction('parking', {
    action: 'filterOptions',
    cardType,
  });
}

// ====== AI 智能问答相关 ======

/**
 * AI 对话
 * @param {string} question - 用户问题
 * @param {array} history - 对话历史 [{role:'user'|'assistant', content:''}]
 */
async function aiChat(question, history = []) {
  return callFunction('ai', {
    question,
    history,
  });
}

/**
 * AI 智能搜索：将自然语言转为搜索参数
 * @param {string} query - 用户自然语言查询
 * @returns {{ keyword, cardType, sortBy, district, priceMin, priceMax, explanation, source }}
 */
async function smartSearch(query, userCity) {
  return callFunction('ai', {
    action: 'smartSearch',
    query,
    userCity: userCity || '',
  });
}

/**
 * AI Agent 自主执行：完整的多步骤搜索流程
 */
async function agentSearch(query, userCity) {
  return callFunction('ai', {
    action: 'agent',
    query,
    userCity: userCity || '',
  });
}

module.exports = {
  getParkingList,
  getParkingDetail,
  searchParking,
  getRecommendPackages,
  getFilterOptions,
  createOrder,
  getOrderList,
  getOrderDetail,
  getPins,
  cancelOrder,
  getMyCoupons,
  claimCoupon,
  getShareCoupon,
  toggleFavorite,
  getMyFavorites,
  aiChat,
  smartSearch,
  agentSearch,
};
