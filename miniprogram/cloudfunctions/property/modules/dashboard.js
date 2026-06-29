// 物业端首页看板
module.exports = async (event, context, { db, _ }) => {
  const { token, parkingId } = event;
  if (!parkingId) throw new Error('缺少 parkingId');

  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');
  if (!prop.data[0].managedLots.includes(parkingId)) {
    throw new Error('无权限');
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // 并行查询
  const [
    lotRes,
    configRes,
    activeRes,        // 当前在场
    todayOrdersRes,   // 今日订单
    monthOrdersRes,   // 本月订单
    pendingReviewRes, // 待审核车主
    retainedRes       // 滞留车辆
  ] = await Promise.all([
    db.collection('parking_lots').doc(parkingId).get(),
    db.collection('parking_configs').doc(parkingId).get().catch(() => ({ data: null })),
    db.collection('reservations').where({
      parkingId, status: _.in(['active', 'overtime'])
    }).count(),
    db.collection('orders').where({
      parkingId,
      createTime: _.gte(todayStart),
      status: _.in(['paid', 'done'])
    }).count(),
    db.collection('orders').where({
      parkingId,
      createTime: _.gte(monthStart),
      status: _.in(['paid', 'done'])
    }).get(),
    db.collection('users').where({
      realNameStatus: 'pending'
    }).count(),
    db.collection('reservations').where({
      parkingId, status: 'retained'
    }).count()
  ]);

  // 本月营收
  let monthRevenue = 0;
  monthOrdersRes.data.forEach(o => {
    monthRevenue += o.finalPrice || o.totalPrice || 0;
  });

  // 车场总车位
  const totalSpaces = lotRes.data.totalSpaces || 0;
  const availableSpaces = (configRes.data && configRes.data.availableSpaces)
    ? Object.values(configRes.data.availableSpaces).reduce((a, b) => a + (b || 0), 0)
    : 0;
  const inUseSpaces = activeRes.total;
  const utilization = totalSpaces > 0
    ? Math.round((inUseSpaces / totalSpaces) * 100)
    : 0;

  return {
    parkingInfo: {
      _id: lotRes.data._id,
      name: lotRes.data.name,
      address: lotRes.data.address,
      totalSpaces
    },
    spaces: {
      total: totalSpaces,
      available: availableSpaces,
      inUse: inUseSpaces,
      utilization
    },
    sharedEnabled: configRes.data ? configRes.data.sharedEnabled : false,
    today: {
      orders: todayOrdersRes.total
    },
    month: {
      orders: monthOrdersRes.data.length,
      revenue: monthRevenue
    },
    pendingTasks: {
      userReview: pendingReviewRes.total,
      retainedVehicles: retainedRes.total
    },
    updatedAt: now
  };
};
