// 获取车场配置
module.exports = async (event, context, { db, _ }) => {
  const { token, parkingId } = event;
  if (!parkingId) throw new Error('缺少 parkingId');

  // 验证物业权限
  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');
  if (!prop.data[0].managedLots.includes(parkingId)) {
    throw new Error('无权限访问该车场');
  }

  const result = await db.collection('parking_configs').doc(parkingId).get();
  if (!result.data) {
    // 配置不存在，返回默认配置
    return {
      _id: parkingId,
      sharedEnabled: false,
      sharedTimeRanges: [],
      availableSpaces: { temp: 0, dayCard: 0, monthCard: 0, visitor: 0 },
      creditThreshold: { default: 70, high: 90, normal: 70 },
      packagePricing: {
        tempPackages: [
          { duration: 2, price: 1000 },
          { duration: 3, price: 1200 },
          { duration: 4, price: 1500 },
          { duration: 6, price: 1800 },
          { duration: 8, price: 2000 }
        ],
        dayCardMonthly: 30000,
        overtimeRules: {
          temp: { insideHours: 300, outsideHours: 500 },
          monthCard: 300,
          visitor: 0
        }
      },
      vehicleTypeFilter: { allowNewEnergy: true, allowFuel: true, allowLargeVehicle: false },
      retainedPolicy: { warnTimes: [], towEnabled: true },
      passengerCheckMode: 'guard',
      isDefault: true
    };
  }
  return result.data;
};
