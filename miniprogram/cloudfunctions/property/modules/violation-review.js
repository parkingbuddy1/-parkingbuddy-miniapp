// 违规申诉审核
module.exports = async (event, context, { db, _ }) => {
  const { token, reportId, decision, note } = event;
  if (!reportId || !['approved', 'rejected'].includes(decision)) {
    throw new Error('参数不完整');
  }

  const prop = await db.collection('properties').where({ token }).get();
  if (prop.data.length === 0) throw new Error('token 无效');

  const r = await db.collection('violation_reports').doc(reportId).get();
  if (!r.data) throw new Error('违规记录不存在');

  const update = {
    appealStatus: decision,
    appealResult: note || (decision === 'approved' ? '申诉通过，撤销扣分' : '申诉驳回'),
    appealHandledBy: prop.data[0]._id,
    appealHandledAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  if (decision === 'approved') {
    // 撤销扣分：恢复信用分
    const credit = await db.collection('credit_archives').where({ openid: r.data.openid }).get();
    if (credit.data.length > 0) {
      const newScore = (credit.data[0].currentScore || 0) + Math.abs(r.data.creditDelta || 0);
      await db.collection('credit_archives').doc(credit.data[0]._id).update({
        data: {
          currentScore: newScore,
          updatedAt: db.serverDate()
        }
      });
    }
    update.status = 'cancelled';
  }

  await db.collection('violation_reports').doc(reportId).update({ data: update });

  return { success: true, decision };
};
