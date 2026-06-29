// 一键开关共享停车（PPT 核心功能）
module.exports = async (event, context, { db, _ }) => {
  const { token, parkingId, enabled, reason } = event;
  if (parkingId === undefined || enabled === undefined) throw new Error('参数不完整');

  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');
  if (!prop.data[0].managedLots.includes(parkingId)) {
    throw new Error('无权限');
  }

  // 关闭时记录原因和时间
  const update = {
    sharedEnabled: enabled,
    updatedAt: db.serverDate()
  };
  if (!enabled) {
    update.sharedDisabledAt = db.serverDate();
    update.sharedDisabledReason = reason || '物业手动关闭';
    update.sharedDisabledBy = prop.data[0]._id;
  } else {
    update.sharedDisabledAt = null;
    update.sharedDisabledReason = null;
  }

  // upsert
  try {
    await db.collection('parking_configs').doc(parkingId).update({ data: update });
  } catch (e) {
    await db.collection('parking_configs').doc(parkingId).set({
      data: { _id: parkingId, ...update, propertyId: prop.data[0]._id }
    });
  }

  return {
    success: true,
    sharedEnabled: enabled,
    message: enabled ? '已开启共享' : '已关闭共享'
  };
};
