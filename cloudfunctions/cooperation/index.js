// 云函数：商务合作留言管理
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, submissionId, phone, wechat, content } = event;

  switch (action) {
    // ====== 用户提交留言 ======
    case 'submit': {
      if (!phone || !wechat || !content) return { code: -1, message: '请填写完整信息' };

      const addResult = await db.collection('cooperations').add({
        data: {
          openid,
          phone,
          wechat,
          content,
          viewed: false,
          createTime: new Date(),
        },
      });

      // 站内通知：提交确认
      await db.collection('notifications').add({
        data: {
          openid,
          type: 'system',
          title: '📋 合作留言已提交',
          content: '感谢您的推荐，我们会派专人尽快与您联系，请保持联系方式的畅通。',
          read: false,
          createdAt: new Date(),
          relatedId: addResult._id,
        },
      });

      return { code: 0, data: { success: true } };
    }

    // ====== 管理员：获取全部留言 ======
    case 'list': {
      const result = await db.collection('cooperations')
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();
      return { code: 0, data: result.data.map(s => ({
        _id: s._id,
        phone: s.phone,
        wechat: s.wechat,
        content: s.content,
        openid: s.openid,
        viewed: s.viewed || false,
        createTime: s.createTime
          ? new Date(s.createTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
          : '',
      })) };
    }

    // ====== 管理员：标记已查看 + 通知用户 ======
    case 'view': {
      if (!submissionId) return { code: -1 };
      const doc = await db.collection('cooperations').doc(submissionId).get();
      if (!doc.data) return { code: -1, message: '留言不存在' };

      await db.collection('cooperations').doc(submissionId).update({
        data: { viewed: true },
      });

      // 站内通知用户：留言已被查看
      if (doc.data.openid) {
        await db.collection('notifications').add({
          data: {
            openid: doc.data.openid,
            type: 'admin_reply',
            title: '👀 合作留言已查看',
            content: '您的留言已被查看，请保持联系方式的畅通，我们随时与您联系。',
            read: false,
            createdAt: new Date(),
            relatedId: submissionId,
          },
        });
      }

      return { code: 0, data: { success: true } };
    }

    default:
      return { code: -1, message: '未知操作' };
  }
};
