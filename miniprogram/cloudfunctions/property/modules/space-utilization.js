// 车位利用率分析
module.exports = async (event, context, { db, _ }) => {
  const { token, parkingId, period = 'week' } = event;
  if (!parkingId) throw new Error('缺少 parkingId');

  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');
  if (!prop.data[0].managedLots.includes(parkingId)) {
    throw new Error('无权限');
  }

  const lot = await db.collection('parking_lots').doc(parkingId).get();
  const total = lot.data.totalSpaces || 0;

  const now = new Date();
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  const startTime = new Date(now.getTime() - days * 86400000);

  const reservations = await db.collection('reservations').where({
    parkingId,
    enterTime: _.gte(startTime)
  }).get();

  // 按小时段统计
  const hourly = {};
  for (let h = 0; h < 24; h++) hourly[h] = { count: 0, occupancy: 0 };

  reservations.data.forEach(r => {
    if (!r.enterTime) return;
    const h = new Date(r.enterTime).getHours();
    hourly[h].count++;
  });

  Object.keys(hourly).forEach(h => {
    hourly[h].occupancy = total > 0
      ? Math.min(100, Math.round((hourly[h].count / days / total) * 100 * 10) / 10)
      : 0;
  });

  return {
    period,
    parkingId,
    totalSpaces: total,
    sampleDays: days,
    hourlyDistribution: Object.keys(hourly).map(h => ({
      hour: Number(h),
      count: hourly[h].count,
      occupancy: hourly[h].occupancy
    })),
    peakHour: Object.entries(hourly).sort((a, b) => b[1].count - a[1].count)[0]?.[0] || 0
  };
};
