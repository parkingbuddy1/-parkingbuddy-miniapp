// 物业端云函数 - 入口
// V1.0: 库存/定价/审核/黑名单/一键关闭/数据看板/结算
// 路径: cloudfunctions/property/index.js

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

module.exports = {
  // ============= 1. 库存与配置 =============
  configGet: require('./modules/config-get'),
  configUpdate: require('./modules/config-update'),
  availableSet: require('./modules/available-set'),
  sharedToggle: require('./modules/shared-toggle'),

  // ============= 2. 审核与黑白名单 =============
  userReview: require('./modules/user-review'),
  userBlacklist: require('./modules/user-blacklist'),
  userList: require('./modules/user-list'),

  // ============= 3. 滞留与违规 =============
  retainedList: require('./modules/retained-list'),
  retainedHandle: require('./modules/retained-handle'),
  violationReview: require('./modules/violation-review'),

  // ============= 4. 数据看板 =============
  dashboard: require('./modules/dashboard'),
  revenueStats: require('./modules/revenue-stats'),
  spaceUtilization: require('./modules/space-utilization'),

  // ============= 5. 结算 =============
  settlementList: require('./modules/settlement-list'),
  settlementConfirm: require('./modules/settlement-confirm'),

  // ============= 6. 物业账号 =============
  propertyLogin: require('./modules/property-login'),
  propertyRegister: require('./modules/property-register'),
  propertyInfo: require('./modules/property-info'),
};

// ============ 路由分发 ============
exports.main = async (event, context) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 公开接口（无需登录）
  const publicActions = ['propertyLogin', 'propertyRegister'];

  if (!publicActions.includes(action) && !openid) {
    return { code: 401, message: '未登录' };
  }

  const handler = module.exports[action];
  if (!handler || typeof handler !== 'function') {
    return { code: -1, message: `未知 action: ${action}` };
  }

  try {
    const data = await handler(event, context, { db, _, openid });
    return { code: 0, data };
  } catch (err) {
    console.error(`[property.${action}] 错误:`, err);
    return { code: -1, message: err.message || '服务异常' };
  }
};
