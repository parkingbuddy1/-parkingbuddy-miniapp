// 滞留车辆列表
module.exports = async (event, context, { db, _ }) => {
  const { token, parkingId, status = 'retained', page = 1, pageSize = 20 } = event;
  if (!parkingId) throw new Error('缺少 parkingId');

  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');
  if (!prop.data[0].managedLots.includes(parkingId)) {
    throw new Error('无权限');
  }

  // 查询滞留或超时的预约
  const filter = { parkingId };
  if (status === 'all') {
    filter.status = _.in(['retained', 'overtime']);
  } else {
    filter.status = status;
  }

  const countRes = await db.collection('reservations').where(filter).count();
  const listRes = await db.collection('reservations')
    .where(filter)
    .orderBy('enterTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  // 关联车主信息
  const openids = [...new Set(listRes.data.map(r => r.openid))];
  let userMap = {};
  if (openids.length > 0) {
    const usersRes = await db.collection('users')
      .where({ openid: _.in(openids) })
      .field({ openid: true, nickName: true, phone: true, licensePlate: true })
      .get();
    userMap = Object.fromEntries(usersRes.data.map(u => [u.openid, u]));
  }

  const list = listRes.data.map(r => {
    const u = userMap[r.openid] || {};
    const overtimeHours = r.enterTime
      ? Math.floor((Date.now() - new Date(r.enterTime).getTime()) / 3600000)
      : 0;
    return {
      _id: r._id,
      licensePlate: r.licensePlate || u.licensePlate,
      carType: r.carType,
      userName: u.nickName || '匿名',
      userPhone: u.phone || '',
      enterTime: r.enterTime,
      validTo: r.validTo,
      overtimeHours,
      riskLevel: r.riskLevel,
      status: r.status,
      packageName: r.packageName
    };
  });

  return {
    total: countRes.total,
    list,
    page,
    pageSize
  };
};
