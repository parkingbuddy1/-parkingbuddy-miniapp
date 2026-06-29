// 物业账号注册（需要平台审核才能登录）
const crypto = require('crypto');

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

module.exports = async (event, context, { db, _ }) => {
  const { name, type, contactName, contactPhone, password, address } = event;

  if (!name || !contactName || !contactPhone || !password) {
    throw new Error('必填项不完整');
  }
  if (!/^1[3-9]\d{9}$/.test(contactPhone)) {
    throw new Error('手机号格式错误');
  }
  if (password.length < 6) {
    throw new Error('密码至少 6 位');
  }

  // 检查手机号是否已注册
  const exist = await db.collection('properties').where({ contactPhone }).get();
  if (exist.data.length > 0) {
    throw new Error('该手机号已注册');
  }

  // 创建物业账号（默认 paused 状态，需平台审核激活）
  const result = await db.collection('properties').add({
    data: {
      name,
      type: type || 'property',
      contactName,
      contactPhone,
      passwordHash: md5(password),
      address: address || '',
      managedLots: [],
      profitShareRule: {
        base: 0.7,
        platform: 0.3,
        overtimeRatio: 0.5
      },
      status: 'paused', // 等待审核
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  });

  return {
    propertyId: result._id,
    status: 'paused',
    message: '注册成功，请联系平台审核开通'
  };
};
