// 云函数：订单管理 + 微信支付
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 微信支付配置
const WXPAY = {
  appid: 'wxe973a4c0847e15dd',
  mch_id: '1746424209',
  key: '19830813520ayqC19810925520ayqWAa',
  notify_url: 'https://your-domain.com/pay/notify', // TODO: 替换为真实回调地址
};

// 生成随机字符串
function nonceStr(len = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let str = '';
  for (let i = 0; i < len; i++) str += chars[Math.floor(Math.random() * chars.length)];
  return str;
}

// 生成微信支付签名
function sign(params, key) {
  let str = Object.keys(params)
    .filter(k => params[k] !== '' && params[k] !== undefined && k !== 'sign')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  str += `&key=${key}`;
  return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

// 发送 XML 请求
function requestXml(url, xml) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(xml);
    req.end();
  });
}

// 解析 XML
function parseXml(xml) {
  const result = {};
  const matchAll = xml.matchAll(/<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>/g);
  for (const m of matchAll) result[m[1]] = m[2];
  return result;
}

// 构建 XML 请求体
function buildXml(params) {
  let xml = '<xml>';
  for (const [k, v] of Object.entries(params)) {
    xml += `<${k}><![CDATA[${v}]]></${k}>`;
  }
  xml += '</xml>';
  return xml;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const clientIp = wxContext.CLIENTIP || '127.0.0.1';
  const { action, parkingId, packageId, quantity, couponId, groupType, orderId, page, status,
    // 客户端传��的停车场/套餐信息（避免数据库查询失败）
    parkingName, packageName, unitPrice, packagePeriod,
  } = event;

  switch (action) {
    // ====== 创建订单 + 统一下单 ======
    case 'create': {
      if (!openid) return { code: 401, message: '请先登录' };
      if (!parkingId || !packageId) return { code: -1, message: '参数不完整' };

      // 拼团价格（前端已计算好团购价，云函数不再重复打折）
      const pkgName = packageName || '停车套餐';
      const parkName = parkingName || '停车场';
      const qty = quantity || 1;
      const actualUnitPrice = unitPrice || 0;
      const totalPrice = actualUnitPrice * qty;

      let discountAmount = 0;
      if (couponId) {
        const ucResult = await db.collection('user_coupons').doc(couponId).get();
        if (ucResult.data && ucResult.data.status === 'valid') {
          const coupon = await db.collection('coupons').doc(ucResult.data.couponId).get();
          if (coupon.data) discountAmount = coupon.data.discount || 0;
          await db.collection('user_coupons').doc(couponId).update({ data: { status: 'used', usedAt: db.serverDate() } });
        }
      }

      const finalPrice = Math.max(1, totalPrice - discountAmount);

      // 创建订单
      const orderNo = `YT${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const orderData = {
        openid, orderNo, parkingId, parkingName: parkName,
        packageId, packageName: pkgName,
        quantity: qty, unitPrice: actualUnitPrice, totalPrice, discountAmount, finalPrice,
        couponId: couponId || '', groupType: groupType || '',
        status: 'pending', createTime: db.serverDate(), updateTime: db.serverDate(),
      };

      const orderResult = await db.collection('orders').add({ data: orderData });

      // ====== 微信统一下单 ======
      const totalFee = finalPrice * 100; // 元 → 分
      const ip = '127.0.0.1'; // 云函数出口 IP

      const orderParams = {
        appid: WXPAY.appid,
        mch_id: WXPAY.mch_id,
        nonce_str: nonceStr(),
        body: `粤停汇 - ${pkgName}`,
        out_trade_no: orderNo,
        total_fee: totalFee,
        spbill_create_ip: clientIp,
        notify_url: WXPAY.notify_url,
        trade_type: 'JSAPI',
        openid: openid,
      };
      orderParams.sign = sign(orderParams, WXPAY.key);

      const xmlBody = buildXml(orderParams);
      const payResponse = await requestXml('https://api.mch.weixin.qq.com/pay/unifiedorder', xmlBody);
      const payResult = parseXml(payResponse);

      if (payResult.return_code !== 'SUCCESS') {
        return { code: -1, message: payResult.return_msg || '下单失败' };
      }
      if (payResult.result_code !== 'SUCCESS') {
        return { code: -1, message: payResult.err_code_des || '下单失败' };
      }

      // 更新订单 prepay_id
      await db.collection('orders').doc(orderResult._id).update({
        data: { prepayId: payResult.prepay_id, updateTime: db.serverDate() },
      });

      // ====== 二次签名（小程序调起支付用） ======
      const timeStamp = String(Math.floor(Date.now() / 1000));
      const nonce = nonceStr();
      const pkg = `prepay_id=${payResult.prepay_id}`;

      const paySignParams = {
        appId: WXPAY.appid,
        timeStamp,
        nonceStr: nonce,
        package: pkg,
        signType: 'MD5',
      };
      const paySign = sign(paySignParams, WXPAY.key);

      return {
        code: 0,
        data: {
          orderId: orderResult._id,
          orderNo,
          timeStamp,
          nonceStr: nonce,
          package: pkg,
          signType: 'MD5',
          paySign,
          finalPrice,
        },
      };
    }

    // ====== 支付回调 ======
    case 'notify': {
      // 云函数接收回调需要 HTTP 触发，此处通过 context 获取
      // 实际部署时需配置 HTTP 触发器
      return { code: 0, message: 'ok' };
    }

    // ====== 查询订单 ======
    case 'list': {
      if (!openid) return { code: 401, message: '请先登录' };
      let q = { openid };
      if (status) q.status = status;
      const result = await db.collection('orders').where(q).orderBy('createTime', 'desc').skip(((page || 1) - 1) * 20).limit(20).get();
      return { code: 0, data: result.data };
    }

    case 'detail': {
      if (!openid) return { code: 401, message: '请先登录' };
      const order = await db.collection('orders').doc(orderId).get();
      return order.data ? { code: 0, data: order.data } : { code: -1, message: '订单不存在' };
    }

    case 'paid': {
      if (!openid) return { code: 401, message: '请先登录' };
      await db.collection('orders').doc(orderId).update({
        data: { status: 'paid', updateTime: db.serverDate() },
      });
      return { code: 0, data: { success: true } };
    }

    case 'cancel': {
      if (!openid) return { code: 401, message: '请先登录' };
      const order = await db.collection('orders').doc(orderId).get();
      if (!order.data || order.data.status !== 'pending') return { code: -1, message: '只能取消待支付订单' };
      await db.collection('orders').doc(orderId).update({ data: { status: 'cancelled', updateTime: db.serverDate() } });
      return { code: 0, data: { success: true } };
    }

    case 'delete': {
      if (!openid) return { code: 401, message: '请先登录' };
      if (!orderId) return { code: -1, message: '缺少订单ID' };
      const order = await db.collection('orders').doc(orderId).get();
      if (!order.data) return { code: -1, message: '订单不存在' };
      await db.collection('orders').doc(orderId).remove();
      return { code: 0, data: { success: true } };
    }

    // ====== 查询正在拼团列表 ======
    case 'pins': {
      // 查询指定停车场的拼团订单（好友团 groupType=3，状态 pending/paid）
      if (!parkingId) return { code: -1, message: '缺少停车场ID' };
      const res = await db.collection('orders')
        .where({
          parkingId,
          groupType: '3',
          status: db.command.in(['pending', 'paid']),
        })
        .orderBy('createTime', 'desc')
        .limit(20)
        .get();
      const orders = res.data || [];

      // 按 packageId 分组统计
      const pinMap = {};
      orders.forEach(o => {
        const key = o.packageId;
        if (!pinMap[key]) {
          pinMap[key] = {
            packageId: key,
            packageName: o.packageName || key,
            need: 3,
            members: [],
            startDate: o.startDate || '',
          };
        }
        pinMap[key].members.push({
          openid: o.openid,
          nick: (o.userName || o.openid || '').slice(0, 8),
          plate: o.plateNo || '',
        });
        // 取最早的开始日期
        if (o.startDate && (!pinMap[key].startDate || o.startDate < pinMap[key].startDate)) {
          pinMap[key].startDate = o.startDate;
        }
      });

      const pins = Object.values(pinMap).map(pin => ({
        id: pin.packageId,
        packageName: pin.packageName,
        need: pin.need,
        joined: pin.members.length,
        remain: Math.max(0, pin.need - pin.members.length),
        startDate: pin.startDate,
        avatars: pin.members.slice(0, 3).map((m, i) => ({
          nick: m.nick,
          plate: m.plate,
          color: ['#FF6B35', '#FFD700', '#00D68F', '#6495ED', '#FF69B4'][i % 5],
        })),
      }));

      return { code: 0, data: { pins } };
    }

    default:
      return { code: -1, message: '未知操作' };
  }
};
