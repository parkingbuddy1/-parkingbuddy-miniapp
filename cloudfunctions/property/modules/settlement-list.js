// 分润账单列表
module.exports = async (event, context, { db, _ }) => {
  const { token, page = 1, pageSize = 12 } = event;

  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');
  const propertyId = prop.data[0]._id;

  const countRes = await db.collection('profit_settlements')
    .where({ propertyId }).count();
  const listRes = await db.collection('profit_settlements')
    .where({ propertyId })
    .orderBy('cycle', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  return {
    total: countRes.total,
    list: listRes.data,
    page,
    pageSize
  };
};
