// 处置滞留车辆
module.exports = async (event, context, { db, _ }) => {
  const { token, reservationId, action, note } = event;
  if (!reservationId || !action) throw new Error('参数不完整');

  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');

  const res = await db.collection('reservations').doc(reservationId).get();
  if (!res.data) throw new Error('预约记录不存在');
  if (!prop.data[0].managedLots.includes(res.data.parkingId)) {
    throw new Error('无权限');
  }

  const actions = {
    phone: { action: '电话提醒', newStatus: 'overtime' },
    sms: { action: '短信提醒', newStatus: 'overtime' },
    onsite: { action: '现场处理', newStatus: 'overtime' },
    tow: { action: '报警拖车', newStatus: 'retained' }
  };

  const op = actions[action];
  if (!op) throw new Error('非法 action');

  // 记录处置历史
  const handleLog = res.data.handleLog || [];
  handleLog.push({
    action: op.action,
    note: note || '',
    operator: prop.data[0]._id,
    operatorName: prop.data[0].contactName,
    time: db.serverDate()
  });

  await db.collection('reservations').doc(reservationId).update({
    data: {
      handleLog,
      status: op.newStatus,
      updatedAt: db.serverDate()
    }
  });

  return { success: true, action: op.action, newStatus: op.newStatus };
};
