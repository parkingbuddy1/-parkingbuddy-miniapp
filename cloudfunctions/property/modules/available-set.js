// 设置可预约车位数
module.exports = async (event, context, { db, _ }) => {
  const { token, parkingId, availableSpaces } = event;
  if (!parkingId || !availableSpaces) throw new Error('参数不完整');

  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');
  if (!prop.data[0].managedLots.includes(parkingId)) {
    throw new Error('无权限');
  }

  // 同时更新 parking_lots（保持 availableSpaces 一致性）
  const totalAvailable = (availableSpaces.temp || 0)
    + (availableSpaces.dayCard || 0)
    + (availableSpaces.monthCard || 0)
    + (availableSpaces.visitor || 0);

  await db.collection('parking_lots').doc(parkingId).update({
    data: { availableSpaces: totalAvailable, updatedAt: db.serverDate() }
  });

  await db.collection('parking_configs').doc(parkingId).update({
    data: { availableSpaces, updatedAt: db.serverDate() }
  }).catch(async () => {
    await db.collection('parking_configs').doc(parkingId).set({
      data: { _id: parkingId, availableSpaces }
    });
  });

  return { success: true, totalAvailable };
};
