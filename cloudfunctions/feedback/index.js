// 云函数：用户反馈管理
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, feedbackId, phone, content, status, reason } = event;

  switch (action) {
    // ====== 用户提交反馈 ======
    case 'submit': {
      if (!phone || !content) return { code: -1, message: '参数不全' };
      await db.collection('feedbacks').add({
        data: {
          openid,
          phone,
          content,
          status: 'new',  // new | adopted | held | rejected
          reason: '',
          createTime: new Date(),
        },
      });

      // 站内通知：提交确认
      await db.collection('notifications').add({
        data: {
          openid,
          type: 'system',
          title: '📬 留言提交成功',
          content: '您的留言建议已提交，我们会在24小时内认真阅读并回复。被采纳的建议将获得30元奖励金券！',
          read: false,
          createdAt: new Date(),
        },
      });

      return { code: 0, data: { success: true } };
    }

    // ====== 管理员：获取待处理 ======
    case 'listNew': {
      const result = await db.collection('feedbacks')
        .where({ status: 'new' })
        .orderBy('createTime', 'desc')
        .get();
      return { code: 0, data: result.data.map(f => ({
        _id: f._id,
        phone: f.phone,
        content: f.content,
        createTime: f.createTime ? new Date(f.createTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '',
      })) };
    }

    // ====== 管理员：获取存档 ======
    case 'listArchived': {
      const result = await db.collection('feedbacks')
        .where({ status: status || 'adopted' })
        .orderBy('createTime', 'desc')
        .get();
      return { code: 0, data: result.data.map(f => ({
        _id: f._id,
        phone: f.phone,
        content: f.content,
        status: f.status,
        reason: f.reason || '',
        createTime: f.createTime ? new Date(f.createTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '',
      })) };
    }

    // ====== 管理员：采纳 → 发放金券 ======
    case 'adopt': {
      if (!feedbackId) return { code: -1 };
      const fb = await db.collection('feedbacks').doc(feedbackId).get();
      if (!fb.data) return { code: -1, message: '反馈不存在' };

      const userOpenid = fb.data.openid;

      // 向用户发放30元无门槛月卡券（金底蓝字）
      const addResult = await db.collection('coupons').add({
        data: {
          name: '采纳奖励30元代金券',
          description: '不限日期30元无门槛月卡专用',
          discount: 30,
          type: 'reward',
          style: 'gold',  // 金底蓝字
          status: 'valid',
          condition: '无门槛',
          createdAt: new Date(),
          expireDate: null,  // 不限日期
        },
      });

      // 同时在 user_coupons 写入领券记录，用户才能在"我的优惠券"中看到
      await db.collection('user_coupons').add({
        data: {
          openid: userOpenid,
          couponId: addResult._id,
          status: 'valid',
          expireDate: null,  // 不限日期
          createdAt: db.serverDate(),
        },
      });

      // 更新反馈状态
      await db.collection('feedbacks').doc(feedbackId).update({
        data: { status: 'adopted' },
      });

      // 站内通知：优惠券到账
      await db.collection('notifications').add({
        data: {
          openid: userOpenid,
          type: 'coupon_received',
          title: '🎁 优惠券已到账',
          content: '感谢您的留言建议！一张30元无门槛月卡代金券已发放到您的账户，不限日期使用。',
          read: false,
          createdAt: new Date(),
          relatedId: feedbackId,
        },
      });

      return { code: 0, data: { success: true } };
    }

    // ====== 管理员：暂存 ======
    case 'hold': {
      if (!feedbackId || !reason) return { code: -1 };
      const fb = await db.collection('feedbacks').doc(feedbackId).get();
      if (!fb.data) return { code: -1, message: '反馈不存在' };

      await db.collection('feedbacks').doc(feedbackId).update({
        data: { status: 'held', reason },
      });

      // 站内通知：管理员回复
      await db.collection('notifications').add({
        data: {
          openid: fb.data.openid,
          type: 'admin_reply',
          title: '💬 留言已收到回复',
          content: reason,
          read: false,
          createdAt: new Date(),
          relatedId: feedbackId,
        },
      });

      return { code: 0, data: { success: true } };
    }

    // ====== 管理员：废除 ======
    case 'reject': {
      if (!feedbackId) return { code: -1 };
      const fb = await db.collection('feedbacks').doc(feedbackId).get();

      if (fb.data && fb.data.openid) {
        // 站内通知：反馈未通过
        await db.collection('notifications').add({
          data: {
            openid: fb.data.openid,
            type: 'admin_reply',
            title: '📝 留言处理结果',
            content: '很抱歉，您的留言建议暂未通过审核。感谢您的参与，欢迎继续提出宝贵意见。',
            read: false,
            createdAt: new Date(),
            relatedId: feedbackId,
          },
        });
      }

      await db.collection('feedbacks').doc(feedbackId).remove();
      return { code: 0, data: { success: true } };
    }

    default:
      return { code: -1, message: '未知操作' };
  }
};
