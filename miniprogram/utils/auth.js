// 云函数调用统一封装
// 自动处理鉴权、错误重试、异常兜底

const app = getApp();

/**
 * 调用云函数
 * @param {string} name - 云函数名称
 * @param {object} data - 请求参数
 * @returns {Promise}
 */
async function callFunction(name, data = {}) {
  try {
    const res = await wx.cloud.callFunction({
      name,
      data: {
        ...data,
        token: app.globalData.token || '',
      },
    });

    if (res.result && res.result.code === 0) {
      return res.result.data;
    }

    // 未登录处理
    if (res.result && res.result.code === 401) {
      await login();
      return callFunction(name, data);
    }

    throw {
      code: res.result ? res.result.code : -1,
      message: (res.result && res.result.message) || '请求失败',
    };
  } catch (err) {
    console.error(`云函数 [${name}] 调用失败:`, err);
    throw err;
  }
}

/**
 * 微信登录 + 云函数换 token
 */
async function login() {
  try {
    // 获取微信登录 code
    const { code } = await wx.login();

    // 调用云函数获取 token
    const res = await wx.cloud.callFunction({
      name: 'login',
      data: { code },
    });

    if (res.result && res.result.code === 0) {
      const { token, userInfo } = res.result.data;
      wx.setStorageSync('token', token);
      wx.setStorageSync('userInfo', userInfo);
      app.globalData.token = token;
      app.globalData.userInfo = userInfo;
      app.globalData.isLogin = true;
      return userInfo;
    }

    throw new Error('登录失败');
  } catch (err) {
    console.error('登录失败:', err);
    throw err;
  }
}

/**
 * 获取用户资料（含授权昵称头像）
 */
async function getUserProfile() {
  // 优先使用 wx.getUserProfile（需要用户弹窗授权）
  return new Promise((resolve, reject) => {
    wx.getUserProfile({
      desc: '用于同步您的微信头像和昵称',
      success: (res) => {
        const ui = res.userInfo;
        // 更新到云数据库
        callFunction('login', {
          action: 'updateProfile',
          userInfo: { nickName: ui.nickName, avatarUrl: ui.avatarUrl, gender: ui.gender || 0 },
        }).catch(() => {});
        // 同步到本地
        app.globalData.userInfo = { ...app.globalData.userInfo, nickName: ui.nickName, avatarUrl: ui.avatarUrl };
        wx.setStorageSync('userInfo', app.globalData.userInfo);
        resolve(ui);
      },
      fail: (err) => {
        // 降级为 getUserInfo
        wx.getUserInfo({
          success: (res) => {
            const ui = res.userInfo;
            callFunction('login', {
              action: 'updateProfile',
              userInfo: { nickName: ui.nickName, avatarUrl: ui.avatarUrl, gender: ui.gender || 0 },
            }).catch(() => {});
            app.globalData.userInfo = { ...app.globalData.userInfo, nickName: ui.nickName, avatarUrl: ui.avatarUrl };
            wx.setStorageSync('userInfo', app.globalData.userInfo);
            resolve(ui);
          },
          fail: reject
        });
      }
    });
  });
}

module.exports = {
  callFunction,
  login,
  getUserProfile,
};
