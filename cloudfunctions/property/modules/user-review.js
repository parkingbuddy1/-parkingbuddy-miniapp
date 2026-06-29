// 车主审核
module.exports = async (event, context, { db, _ }) => {
  const { token, openid, result, note } = event;
  if (!openid || !['verified', 'rejected'].includes(result)) {
    throw new Error('参数不完整');
  }

  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');

  const user = await db.collection('users').where({ openid }).get();
  if (user.data.length === 0) throw new Error('用户不存在');

  await db.collection('users').where({ openid }).update({
    data: {
      realNameStatus: result,
      realNameReviewBy: prop.data[0]._id,
      realNameReviewAt: db.serverDate(),
      realNameReviewNote: note || '',
      updatedAt: db.serverDate()
    }
  });

  // 审核通过时，确保有信用档案
  if (result === 'verified') {
    const exist = await db.collection('credit_archives').where({ openid }).get();
    if (exist.data.length === 0) {
      await db.collection('credit_archives').add({
        data: {
          openid,
          licensePlate: user.data[0].licensePlate || '',
          baseScore: 100,
          currentScore: 100,
          level: 'A',
          levelUpdatedAt: db.serverDate(),
          scoreFormula: { baseScore: 100, positiveSum: 0, negativeSum: 0, bonus: 0, penalty: 0 },
          positiveHistory: [], negativeHistory: [],
          blacklistStatus: 'none', whitelistStatus: 'none',
          recoveryRecords: [], ratingFactors: {},
          createdAt: db.serverDate(), updatedAt: db.serverDate()
        }
      });
    }
  }

  return { success: true, result };
};
