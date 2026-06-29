// 车主列表（按状态/等级筛选）
module.exports = async (event, context, { db, _ }) => {
  const { token, filter = 'all', page = 1, pageSize = 20 } = event;

  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');

  const where = {};
  if (filter === 'pending') where.realNameStatus = 'pending';
  else if (filter === 'verified') where.realNameStatus = 'verified';
  else if (filter === 'rejected') where.realNameStatus = 'rejected';
  else if (filter === 'blacklist') where.isBlacklist = true;

  const countRes = await db.collection('users').where(where).count();
  const listRes = await db.collection('users')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .field({
      openid: true, nickName: true, avatarUrl: true, phone: true,
      licensePlate: true, realNameStatus: true, isBlacklist: true,
      createdAt: true
    })
    .get();

  // 查询每个车主的信用分
  const openids = listRes.data.map(u => u.openid);
  let creditMap = {};
  if (openids.length > 0) {
    const credits = await db.collection('credit_archives')
      .where({ openid: _.in(openids) })
      .field({ openid: true, currentScore: true, level: true })
      .get();
    creditMap = Object.fromEntries(credits.data.map(c => [c.openid, c]));
  }

  const list = listRes.data.map(u => ({
    ...u,
    phone: u.phone ? u.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '',
    creditScore: creditMap[u.openid] ? creditMap[u.openid].currentScore : null,
    creditLevel: creditMap[u.openid] ? creditMap[u.openid].level : null
  }));

  return { total: countRes.total, list, page, pageSize };
};
