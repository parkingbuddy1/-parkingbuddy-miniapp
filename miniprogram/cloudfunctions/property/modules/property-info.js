// 获取当前物业信息（通过 token）
module.exports = async (event, context, { db, _ }) => {
  const { token } = event;
  if (!token) throw new Error('未提供 token');

  const result = await db.collection('properties').where({ token }).get();
  if (result.data.length === 0) {
    throw new Error('token 无效');
  }

  const p = result.data[0];
  return {
    _id: p._id,
    name: p.name,
    type: p.type,
    contactName: p.contactName,
    contactPhone: p.contactPhone,
    address: p.address,
    managedLots: p.managedLots || [],
    profitShareRule: p.profitShareRule,
    status: p.status,
    contractStart: p.contractStart,
    contractEnd: p.contractEnd
  };
};
