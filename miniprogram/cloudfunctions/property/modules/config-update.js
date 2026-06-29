// 更新车场配置
module.exports = async (event, context, { db, _ }) => {
  const { token, parkingId, updateFields } = event;
  if (!parkingId || !updateFields) throw new Error('参数不完整');

  // 验证物业权限
  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');
  if (!prop.data[0].managedLots.includes(parkingId)) {
    throw new Error('无权限修改该车场');
  }

  // 允许更新的字段白名单
  const allowedFields = [
    'sharedEnabled', 'sharedTimeRanges', 'availableSpaces',
    'creditThreshold', 'packagePricing', 'vehicleTypeFilter',
    'retainedPolicy', 'passengerCheckMode', 'aiDevices'
  ];

  const safeUpdate = {};
  allowedFields.forEach(f => {
    if (updateFields[f] !== undefined) safeUpdate[f] = updateFields[f];
  });
  safeUpdate.updatedBy = prop.data[0]._id;
  safeUpdate.updatedAt = db.serverDate();

  // upsert
  try {
    await db.collection('parking_configs').doc(parkingId).update({ data: safeUpdate });
  } catch (e) {
    // 文档不存在，创建
    await db.collection('parking_configs').doc(parkingId).set({
      data: { _id: parkingId, propertyId: prop.data[0]._id, ...safeUpdate }
    });
  }

  return { success: true, updated: Object.keys(safeUpdate) };
};
