// 收益统计
module.exports = async (event, context, { db, _ }) => {
  const { token, parkingId, period = 'month' } = event;
  if (!parkingId) throw new Error('缺少 parkingId');

  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');
  if (!prop.data[0].managedLots.includes(parkingId)) {
    throw new Error('无权限');
  }

  const now = new Date();
  let startTime;
  if (period === 'day') {
    startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'week') {
    startTime = new Date(now.getTime() - 7 * 86400000);
  } else {
    startTime = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const ordersRes = await db.collection('orders').where({
    parkingId,
    createTime: _.gte(startTime),
    status: _.in(['paid', 'done'])
  }).get();

  const orders = ordersRes.data;
  const stats = {
    totalRevenue: 0,
    tempIncome: 0,
    dayCardIncome: 0,
    visitorIncome: 0,
    overtimeIncome: 0,
    orderCount: orders.length,
    propertyShare: 0,
    platformShare: 0
  };

  // 取分成规则
  const shareRule = prop.data[0].profitShareRule || { base: 0.7, platform: 0.3 };

  orders.forEach(o => {
    const amount = o.finalPrice || o.totalPrice || 0;
    stats.totalRevenue += amount;
    // 简化分类（实际应该从订单关联 reservation 拿数据）
    if (o.packageType === 'temp' || o.packageName?.includes('小时')) {
      stats.tempIncome += amount;
    } else if (o.packageType === 'day_card' || o.packageName?.includes('月卡')) {
      stats.dayCardIncome += amount;
    } else if (o.packageType === 'visitor') {
      stats.visitorIncome += amount;
    }
    stats.propertyShare += Math.round(amount * shareRule.base);
    stats.platformShare += Math.round(amount * shareRule.platform);
  });

  // 查超时收入（从 reservations）
  const retentionsRes = await db.collection('reservations').where({
    parkingId,
    enterTime: _.gte(startTime),
    overtimeFee: _.gt(0)
  }).get();
  retentionsRes.data.forEach(r => {
    stats.overtimeIncome += r.overtimeFee || 0;
  });

  return {
    period,
    parkingId,
    stats,
    shareRule,
    generatedAt: db.serverDate()
  };
};
