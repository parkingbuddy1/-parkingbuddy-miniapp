// 拉黑/解除黑名单
module.exports = async (event, context, { db, _ }) => {
  const { token, openid, op, duration, reason } = event;
  if (!openid || !['add', 'remove'].includes(op)) {
    throw new Error('参数不完整');
  }

  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');

  if (op === 'add') {
    const status = duration || 'month'; // month|3month|halfyear|permanent
    const validUntil = {
      month: 30, '3month': 90, halfyear: 180, permanent: 36500
    }[status] || 30;

    const expireAt = new Date(Date.now() + validUntil * 86400000);

    await db.collection('users').where({ openid }).update({
      data: {
        isBlacklist: true,
        blacklistStatus: status,
        blacklistReason: reason || '',
        blacklistBy: prop.data[0]._id,
        blacklistAt: db.serverDate(),
        blacklistExpireAt: expireAt,
        updatedAt: db.serverDate()
      }
    });

    // 同步到 credit_archives
    await db.collection('credit_archives').where({ openid }).update({
      data: {
        blacklistStatus: status,
        blacklistAddedAt: db.serverDate(),
        blacklistReason: reason || '',
        updatedAt: db.serverDate()
      }
    }).catch(() => {});

    return { success: true, status, expireAt };
  } else {
    await db.collection('users').where({ openid }).update({
      data: {
        isBlacklist: false,
        blacklistStatus: 'none',
        blacklistReason: '',
        updatedAt: db.serverDate()
      }
    });
    await db.collection('credit_archives').where({ openid }).update({
      data: { blacklistStatus: 'none', updatedAt: db.serverDate() }
    }).catch(() => {});
    return { success: true, status: 'none' };
  }
};
