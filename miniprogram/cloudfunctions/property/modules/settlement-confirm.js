// 确认结算账单
module.exports = async (event, context, { db, _ }) => {
  const { token, settlementId, action } = event;
  if (!settlementId || !['confirm', 'dispute'].includes(action)) {
    throw new Error('参数不完整');
  }

  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');

  const s = await db.collection('profit_settlements').doc(settlementId).get();
  if (!s.data) throw new Error('账单不存在');
  if (s.data.propertyId !== prop.data[0]._id) throw new Error('无权限');

  const update = action === 'confirm'
    ? { status: 'confirmed', confirmedBy: prop.data[0]._id, confirmedAt: db.serverDate() }
    : { status: 'disputed', disputedAt: db.serverDate() };

  await db.collection('profit_settlements').doc(settlementId).update({
    data: { ...update, updatedAt: db.serverDate() }
  });

  return { success: true, status: update.status };
};
