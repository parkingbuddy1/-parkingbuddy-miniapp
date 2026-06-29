// 云函数：站内消息通知
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, notificationId, ids } = event;

  switch (action) {
    // ====== 我的消息列表 ======
    case 'myList': {
      if (!openid) return { code: 401, message: '请先登录' };
      const result = await db.collection('notifications')
        .where({ openid })
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      return { code: 0, data: result.data };
    }

    // ====== 未读数量 ======
    case 'unreadCount': {
      if (!openid) return { code: 0, data: 0 };
      const result = await db.collection('notifications')
        .where({ openid, read: false })
        .count();
      return { code: 0, data: result.total };
    }

    // ====== 标记已读 ======
    case 'read': {
      if (!notificationId) return { code: -1 };
      await db.collection('notifications').doc(notificationId).update({
        data: { read: true },
      });
      return { code: 0, data: { success: true } };
    }

    // ====== 全部已读 ======
    case 'readAll': {
      if (!openid) return { code: 401 };
      await db.collection('notifications')
        .where({ openid, read: false })
        .update({ data: { read: true } });
      return { code: 0, data: { success: true } };
    }

    // ====== 删除单条 ======
    case 'delete': {
      if (!notificationId) return { code: -1 };
      await db.collection('notifications').doc(notificationId).remove();
      return { code: 0, data: { success: true } };
    }

    // ====== 批量删除 ======
    case 'batchDelete': {
      if (!ids || !ids.length) return { code: -1 };
      await db.collection('notifications')
        .where({ _id: _.in(ids) })
        .remove();
      return { code: 0, data: { success: true } };
    }

    default:
      return { code: -1, message: '未知操作' };
  }
};
