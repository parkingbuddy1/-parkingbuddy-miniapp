// 云函数：优惠券管理
// 领券、查询、分享裂变
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, couponId, shareCode } = event;

  switch (action) {
    // ====== 我的优惠券列表 ======
    case 'myList': {
      if (!openid) return { code: 401, message: '请先登录' };

      const { status = 'valid' } = event;

      const userCouponsResult = await db
        .collection('user_coupons')
        .where({ openid, status })
        .orderBy('createdAt', 'desc')
        .get();

      // 关联原始优惠券信息
      const couponIds = userCouponsResult.data.map((uc) => uc.couponId);
      if (couponIds.length === 0) return { code: 0, data: [] };

      const couponsResult = await db
        .collection('coupons')
        .where({ _id: _.in(couponIds) })
        .get();

      const couponMap = {};
      couponsResult.data.forEach((c) => {
        couponMap[c._id] = c;
      });

      const list = userCouponsResult.data
        .map((uc) => {
          const coupon = couponMap[uc.couponId];
          if (!coupon) return null;
          return {
            _id: uc._id,
            couponId: uc.couponId,
            name: coupon.name,
            description: coupon.description,
            discount: coupon.discount,
            condition: coupon.condition,
            expireDate: uc.expireDate,
            status: uc.status,
          };
        })
        .filter(Boolean);

      return { code: 0, data: list };
    }

    // ====== 领取优惠券 ======
    case 'claim': {
      if (!openid) return { code: 401, message: '请先登录' };

      // 查询优惠券
      const couponResult = await db.collection('coupons').doc(couponId).get();
      const coupon = couponResult.data;
      if (!coupon) return { code: -1, message: '优惠券不存在' };

      // 检查是否已领取
      const existResult = await db
        .collection('user_coupons')
        .where({ openid, couponId, status: 'valid' })
        .count();

      if (existResult.total > 0) {
        return { code: -1, message: '已领取过该优惠券' };
      }

      // 计算过期时间
      const expireDate = new Date();
      expireDate.setDate(expireDate.getDate() + (coupon.validDays || 30));

      await db.collection('user_coupons').add({
        data: {
          openid,
          couponId,
          status: 'valid',
          expireDate: expireDate.toISOString().split('T')[0],
          createdAt: db.serverDate(),
        },
      });

      return { code: 0, data: { success: true } };
    }

    // ====== 裂变：分享领取 ======
    case 'shareReceive': {
      if (!openid) return { code: 401, message: '请先登录' };
      if (!shareCode) return { code: -1, message: '分享码无效' };

      // 解析分享码：shareCode = sharerOpenid_couponId
      const parts = shareCode.split('_');
      if (parts.length !== 2) return { code: -1, message: '分享码无效' };

      const [sharerOpenid, shareCouponId] = parts;

      // 给领取者发券
      await db.collection('user_coupons').add({
        data: {
          openid,
          couponId: shareCouponId,
          status: 'valid',
          fromShare: true,
          sharerOpenid,
          expireDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
          createdAt: db.serverDate(),
        },
      });

      // 给分享者发券
      await db.collection('user_coupons').add({
        data: {
          openid: sharerOpenid,
          couponId: shareCouponId,
          status: 'valid',
          fromShare: true,
          receiverOpenid: openid,
          expireDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
          createdAt: db.serverDate(),
        },
      });

      return { code: 0, data: { success: true, message: '你和朋友各获得一张优惠券！' } };
    }

    default:
      return { code: -1, message: '未知操作' };
  }
};
