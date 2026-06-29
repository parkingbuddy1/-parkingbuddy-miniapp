// 物业账号登录
// 物业使用手机号+密码登录（区别于车主的微信登录）
const crypto = require('crypto');

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

module.exports = async (event, context, { db, _ }) => {
  const { phone, password } = event;

  if (!phone || !password) {
    throw new Error('手机号或密码不能为空');
  }

  // 查询物业账号
  const result = await db.collection('properties').where({
    contactPhone: phone,
    status: _.neq('terminated')
  }).get();

  if (result.data.length === 0) {
    throw new Error('账号不存在或已停用');
  }

  const property = result.data[0];

  // 校验密码（密码字段不存在时拒绝登录）
  if (!property.passwordHash) {
    throw new Error('账号未设置密码，请联系管理员');
  }
  if (property.passwordHash !== md5(password)) {
    throw new Error('密码错误');
  }

  // 生成 token
  const token = `prop_${property._id}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  // 更新 token 和最后登录时间
  await db.collection('properties').doc(property._id).update({
    data: {
      token,
      lastLoginAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  return {
    token,
    property: {
      _id: property._id,
      name: property.name,
      type: property.type,
      contactName: property.contactName,
      contactPhone: property.contactPhone,
      managedLots: property.managedLots || []
    }
  };
};
