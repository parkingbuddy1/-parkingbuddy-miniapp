// 云函数：登录认证 v2
// 支持微信普通登录 + 手机号实名登录
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const crypto = require('crypto');
const https = require('https');

const db = cloud.database();

// 用户ID自增计数器
const USER_ID_START = 10000;
async function generateUserId() {
  const counterRef = db.collection('counters').doc('user_id');
  try {
    const doc = await counterRef.get();
    if (!doc.data) {
      await db.collection('counters').add({
        data: { _id: 'user_id', seq: USER_ID_START },
      });
      return USER_ID_START;
    }
    const newSeq = (doc.data.seq || USER_ID_START) + 1;
    await counterRef.update({ data: { seq: newSeq } });
    return newSeq;
  } catch (e) {
    // 计数器文档不存在，创建并返回起始值
    await db.collection('counters').add({
      data: { _id: 'user_id', seq: USER_ID_START + 1 },
    });
    return USER_ID_START;
  }
}

// 微信小程序配置（需在云函数环境变量中配置 APP_SECRET）
const APPID = 'wxe973a4c0847e15dd';
// 从环境变量获取 AppSecret（部署时需在云函数配置中添加环境变量）
const APPSECRET = process.env.APP_SECRET || '';

function generateToken(openid) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${openid}_${timestamp}_${random}`;
}

// 调用微信 code2Session API
function code2Session(code) {
  return new Promise((resolve, reject) => {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${APPSECRET}&js_code=${code}&grant_type=authorization_code`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// 解密手机号（AES-128-CBC）
function decryptPhone(encryptedData, iv, sessionKey) {
  const sessionKeyBuf = Buffer.from(sessionKey, 'base64');
  const encryptedDataBuf = Buffer.from(encryptedData, 'base64');
  const ivBuf = Buffer.from(iv, 'base64');

  const decipher = crypto.createDecipheriv('aes-128-cbc', sessionKeyBuf, ivBuf);
  decipher.setAutoPadding(true);
  let decoded = decipher.update(encryptedDataBuf, 'binary', 'utf8');
  decoded += decipher.final('utf8');

  const result = JSON.parse(decoded);
  return result.purePhoneNumber || result.phoneNumber;
}

exports.main = async (event, context) => {
  const { action, code, token, userInfo, iv, encryptedData } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  switch (action) {

    // ====== 手机号实名登录 ======
    case 'phoneLogin': {
      if (!openid) return { code: -1, message: '获取 openid 失败' };
      if (!code || !iv || !encryptedData) return { code: -1, message: '参数不完整' };

      let phoneNumber = '';
      try {
        // 1. 获取 session_key
        const sessionResult = await code2Session(code);
        if (!sessionResult.session_key) {
          console.error('code2Session失败:', sessionResult);
          return { code: -1, message: '微信授权失败' };
        }

        // 2. 解密手机号
        phoneNumber = decryptPhone(encryptedData, iv, sessionResult.session_key);
      } catch (err) {
        console.error('手机号解密失败:', err);
        return { code: -1, message: '手机号解析失败' };
      }

      if (!phoneNumber) return { code: -1, message: '获取手机号失败' };

      // 3. 脱敏显示
      const maskedPhone = phoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');

      // 4. 查找或创建用户
      const userResult = await db.collection('users').where({ openid }).get();
      let user;
      if (userResult.data.length === 0) {
        const uid = await generateUserId();
        const newUser = {
          openid, phone: phoneNumber,
          userId: uid,
          nickName: '', avatarUrl: '',
          tags: [], homeAddress: '', workAddress: '',
          createdAt: db.serverDate(), updatedAt: db.serverDate(),
        };
        const createResult = await db.collection('users').add({ data: newUser });
        user = { ...newUser, _id: createResult._id };
      } else {
        user = userResult.data[0];
        // 更新手机号
        await db.collection('users').doc(user._id).update({
          data: { phone: phoneNumber, updatedAt: db.serverDate() },
        });
      }

      // 5. 生成 token
      const newToken = generateToken(openid);
      await db.collection('users').doc(user._id).update({
        data: { token: newToken, lastLoginAt: db.serverDate() },
      });

      return {
        code: 0,
        data: {
          token: newToken,
          userInfo: {
            _id: user._id,
            userId: user.userId || 0,
            nickName: user.nickName,
            avatarUrl: user.avatarUrl,
            phone: maskedPhone,
          },
        },
      };
    }

    // ====== 普通登录（无手机号） ======
    case 'simpleLogin':
    default: {
      if (!openid) return { code: -1, message: '获取 openid 失败' };

      const userResult = await db.collection('users').where({ openid }).get();
      let user;
      if (userResult.data.length === 0) {
        const uid = await generateUserId();
        const newUser = {
          openid,
          userId: uid,
          nickName: '', avatarUrl: '', phone: '',
          tags: [], homeAddress: '', workAddress: '',
          createdAt: db.serverDate(), updatedAt: db.serverDate(),
        };
        const createResult = await db.collection('users').add({ data: newUser });
        user = { ...newUser, _id: createResult._id };
      } else {
        user = userResult.data[0];
      }

      const newToken = generateToken(openid);
      await db.collection('users').doc(user._id).update({
        data: { token: newToken, lastLoginAt: db.serverDate() },
      });

      return {
        code: 0,
        data: {
          token: newToken,
          userInfo: {
            _id: user._id,
            userId: user.userId || 0,
            nickName: user.nickName,
            avatarUrl: user.avatarUrl,
            phone: user.phone ? user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '',
          },
        },
      };
    }

    case 'updateProfile': {
      if (!openid) return { code: -1, message: '未登录' };
      await db.collection('users').where({ openid }).update({
        data: {
          nickName: userInfo.nickName || '',
          avatarUrl: userInfo.avatarUrl || '',
          gender: userInfo.gender,
          updatedAt: db.serverDate(),
        },
      });
      return { code: 0, data: { success: true } };
    }
  }
};
