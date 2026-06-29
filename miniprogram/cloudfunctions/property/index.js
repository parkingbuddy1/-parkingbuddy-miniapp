// 物业端云函数 - 最小化测试版
// 用于先验证云函数能否被调用，再逐步恢复功能

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const crypto = require('crypto');
function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

exports.main = async (event, context) => {
  const { action, phone, password, name, contactName } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  console.log(`[property] action=${action}, openid=${openid}`);

  try {
    switch (action) {
      case 'propertyLogin': {
        if (!phone || !password) {
          return { code: -1, message: '手机号或密码不能为空' };
        }

        const result = await db.collection('properties').where({
          contactPhone: phone,
          status: _.neq('terminated')
        }).get();

        console.log(`[property] 查询到 ${result.data.length} 条记录`);

        if (result.data.length === 0) {
          return { code: -1, message: '账号不存在' };
        }

        const property = result.data[0];

        if (!property.passwordHash) {
          return { code: -1, message: '账号未设置密码' };
        }

        if (property.passwordHash !== md5(password)) {
          return { code: -1, message: '密码错误' };
        }

        const token = `prop_${property._id}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

        await db.collection('properties').doc(property._id).update({
          data: { token, lastLoginAt: db.serverDate(), updatedAt: db.serverDate() }
        });

        return {
          code: 0,
          data: {
            token,
            property: {
              _id: property._id,
              name: property.name,
              type: property.type,
              contactName: property.contactName,
              contactPhone: property.contactPhone,
              managedLots: property.managedLots || []
            }
          }
        };
      }

      case 'ping': {
        return { code: 0, data: { pong: true, time: Date.now() } };
      }

      default:
        return { code: -1, message: `未知 action: ${action}` };
    }
  } catch (err) {
    console.error(`[property.${action}] 错误:`, err);
    return { code: -1, message: err.message || '服务异常' };
  }
};
