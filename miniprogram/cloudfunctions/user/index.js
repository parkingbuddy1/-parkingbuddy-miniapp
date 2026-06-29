// 用户认证云函数 - 行驶证OCR识别 + 实名校验 + 审核管理
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ========== 腾讯云 OCR 配置 ==========
// 注意：需在腾讯云控制台开通行驶证识别服务
// SecretId/SecretKey 建议配置为云函数环境变量
const OCR_CONFIG = {
  secretId: process.env.TENCENT_SECRET_ID || '',
  secretKey: process.env.TENCENT_SECRET_KEY || '',
  endpoint: 'ocr.tencentcloudapi.com',
  region: 'ap-guangzhou',
};

// ========== 腾讯云短信配置 ==========
// 需在腾讯云控制台开通短信服务并创建签名和模板
const SMS_CONFIG = {
  secretId: process.env.TENCENT_SECRET_ID || '',
  secretKey: process.env.TENCENT_SECRET_KEY || '',
  appId: process.env.SMS_APP_ID || '',      // 短信应用ID
  signName: process.env.SMS_SIGN_NAME || '', // 短信签名
  templateId: process.env.SMS_TEMPLATE_ID || '', // 短信模板ID
};

// ========== 发送短信（腾讯云） ==========
async function sendSms(phone, code) {
  if (!SMS_CONFIG.appId || !SMS_CONFIG.signName || !SMS_CONFIG.templateId) {
    return false; // 未配置，走开发模式
  }
  try {
    const https = require('https');
    const crypto = require('crypto');
    const service = 'sms';
    const host = 'sms.tencentcloudapi.com';
    const version = '2021-01-11';
    const action = 'SendSms';
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

    const payload = JSON.stringify({
      PhoneNumberSet: ['+86' + phone],
      SmsSdkAppId: SMS_CONFIG.appId,
      SignName: SMS_CONFIG.signName,
      TemplateId: SMS_CONFIG.templateId,
      TemplateParamSet: [code],
    });

    // TC3 签名
    const signedHeaders = 'content-type;host';
    const canonicalHeaders = `content-type:application/json\nhost:${host}\n`;
    const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
    const algorithm = 'TC3-HMAC-SHA256';
    const credentialScope = `${date}/${service}/tc3_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

    const kDate = crypto.createHmac('sha256', `TC3${SMS_CONFIG.secretKey}`).update(date).digest();
    const kService = crypto.createHmac('sha256', kDate).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${SMS_CONFIG.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: host, method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'Host': host,
          'X-TC-Action': action, 'X-TC-Version': version,
          'X-TC-Timestamp': timestamp, 'Authorization': authorization,
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const json = JSON.parse(data);
          if (json.Response?.Error) {
            console.error('短信发送失败:', json.Response.Error);
            reject(new Error(json.Response.Error.Message));
          } else resolve();
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    return true;
  } catch (e) {
    console.error('短信发送异常:', e.message);
    return false;
  }
}

// ========== 身份证校验 ==========
function validateIdCard(idNo) {
  if (!/^\d{17}[\dXx]$/.test(idNo)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkCodes = '10X98765432';
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += parseInt(idNo[i]) * weights[i];
  return checkCodes[sum % 11] === idNo[17].toUpperCase();
}

// ========== 腾讯云行驶证OCR识别 ==========
// 返回格式: { success: true, data: {...} } 或 { success: false, message: '...' }
async function recognizeVehicleLicense(imageBase64) {
  const secretId = OCR_CONFIG.secretId;
  const secretKey = OCR_CONFIG.secretKey;

  console.log('OCR诊断: secretId长度=', secretId?.length || 0, 'secretKey长度=', secretKey?.length || 0);
  console.log('OCR诊断: ImageBase64长度=', imageBase64?.length || 0);

  if (!secretId || !secretKey) {
    console.log('OCR诊断: 未配置腾讯云密钥，返回模拟数据');
    return {
      success: true,
      data: {
        plateNo: '粤B' + Math.floor(Math.random() * 90000 + 10000),
        owner: '车主姓名',
        address: '广东省深圳市',
        vehicleType: '小型轿车',
        brandModel: '丰田卡罗拉',
        vin: 'LFMAP22C' + Math.random().toString(36).substr(2, 8).toUpperCase(),
        engineNo: Math.random().toString(36).substr(2, 8).toUpperCase() + 'E',
        registerDate: '2020-01-15',
        issueDate: '2020-01-15',
      },
    };
  }

  try {
    const https = require('https');
    const crypto = require('crypto');

    const service = 'ocr';
    const host = OCR_CONFIG.endpoint;
    const action = 'VehicleLicenseOCR';
    const version = '2018-11-19';
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10); // 保持 YYYY-MM-DD 格式

    const payload = JSON.stringify({ ImageBase64: imageBase64 });

    // TC3-HMAC-SHA256 签名
    const signedHeaders = 'content-type;host';
    const canonicalHeaders = `content-type:application/json\nhost:${host}\n`;
    const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
    const algorithm = 'TC3-HMAC-SHA256';
    const credentialScope = `${date}/${service}/tc3_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

    const kDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest();
    const kService = crypto.createHmac('sha256', kDate).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    console.log('OCR诊断: 开始调用腾讯云API, action=', action, 'region=', OCR_CONFIG.region);

    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: host,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': host,
          'X-TC-Action': action,
          'X-TC-Version': version,
          'X-TC-Timestamp': timestamp,
          'X-TC-Region': OCR_CONFIG.region,
          'Authorization': authorization,
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            console.log('OCR诊断: HTTP状态码=', res.statusCode);
            console.log('OCR诊断: 响应体前500字符=', data.slice(0, 500));

            // 检查 API 错误
            if (json.Response?.Error) {
              const errMsg = json.Response.Error.Message || '未知错误';
              const errCode = json.Response.Error.Code || 'Unknown';
              console.error('OCR API错误:', errCode, '-', errMsg);
              reject(new Error(`腾讯云OCR: [${errCode}] ${errMsg}`));
              return;
            }

            // 格式1：FrontInfo（新版API）
            if (json.Response?.FrontInfo) {
              const info = json.Response.FrontInfo;
              resolve({
                plateNo: info['号牌号码'] || info['PlateNo'] || '',
                owner: info['所有人'] || info['Owner'] || '',
                address: info['地址'] || info['Address'] || '',
                vehicleType: info['车辆类型'] || info['VehicleType'] || '',
                brandModel: info['品牌型号'] || info['Model'] || '',
                vin: info['车辆识别代号'] || info['Vin'] || '',
                engineNo: info['发动机号码'] || info['EngineNo'] || '',
                registerDate: info['注册日期'] || info['RegisterDate'] || '',
                issueDate: info['发证日期'] || info['IssueDate'] || '',
              });
              console.log('OCR诊断: 识别成功(FrontInfo格式), 号牌=', info['号牌号码'] || info['PlateNo'] || '无');
              return;
            }

            // 格式2：VehicleLicenseInfos 数组（旧版API）
            if (json.Response?.VehicleLicenseInfos) {
              console.log('OCR诊断: 识别成功(VehicleLicenseInfos格式), 条数=', json.Response.VehicleLicenseInfos.length);
              resolve(json.Response.VehicleLicenseInfos);
              return;
            }

            // 格式3：直接字段
            if (json.Response) {
              const r = json.Response;
              if (r.号码 || r.号牌号码) {
                console.log('OCR诊断: 识别成功(直接字段格式)');
                resolve({
                  plateNo: r.号牌号码 || r.号牌 || '',
                  owner: r.所有人 || r.车主 || '',
                });
                return;
              }
            }

            reject(new Error(`API返回未知格式/无识别结果: ${data.slice(0, 300)}`));
          } catch (e) { reject(e); }
        });
      });
      req.on('error', (e) => {
        console.error('OCR网络请求失败:', e.message);
        reject(new Error(`网络请求失败: ${e.message}`));
      });
      req.write(payload);
      req.end();
    });

    // 解析OCR结果
    let record = {};
    if (Array.isArray(result)) {
      result.forEach(item => {
        if (item.Name === '号牌号码') record.plateNo = item.Value;
        if (item.Name === '所有人') record.owner = item.Value;
        if (item.Name === '地址') record.address = item.Value;
        if (item.Name === '车辆类型') record.vehicleType = item.Value;
        if (item.Name === '品牌型号') record.brandModel = item.Value;
        if (item.Name === '车辆识别代号') record.vin = item.Value;
        if (item.Name === '发动机号码') record.engineNo = item.Value;
        if (item.Name === '注册日期') record.registerDate = item.Value;
        if (item.Name === '发证日期') record.issueDate = item.Value;
      });
    } else {
      record = result;
    }

    return { success: true, data: record };

  } catch (e) {
    console.error('OCR识别失败:', e.message, e.stack);
    return { success: false, message: e.message || '未知错误' };
  }
}

// ========== 主函数 ==========
exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action } = event;

  switch (action) {

    // ====== 发送短信验证码 ======
    case 'sendSmsCode': {
      if (!openid) return { code: 401, message: '请先登录' };
      const { phone } = event;
      if (!/^1\d{10}$/.test(phone)) return { code: -1, message: '手机号格式不正确' };

      // 检查 60 秒内是否已发送
      const recent = await db.collection('sms_codes')
        .where({ phone, createTime: db.command.gte(new Date(Date.now() - 60000)) })
        .count();
      if (recent.total > 0) return { code: -1, message: '请60秒后再试' };

      // 生成 4 位随机验证码
      const code = String(Math.floor(Math.random() * 9000) + 1000);

      // 尝试发送短信（需要配置腾讯云短信服务）
      const smsSent = await sendSms(phone, code);

      // 存入数据库，5分钟后自动清理
      await db.collection('sms_codes').add({
        data: {
          phone,
          code,
          openid,
          sent: smsSent,
          createTime: db.serverDate(),
        },
      });

      // 开发/未配置短信时，返回验证码方便调试
      if (!smsSent) {
        console.log(`[验证码] 手机 ${phone} 验证码: ${code}（短信未发送，请配置腾讯云短信）`);
        return { code: 0, data: { code, message: '验证码已生成（开发模式）' } };
      }

      return { code: 0, data: { message: '验证码已发送' } };
    }

    // ====== 验证短信验证码 ======
    case 'verifySmsCode': {
      if (!openid) return { code: 401, message: '请先登录' };
      const { phone, code } = event;
      if (!phone || !code) return { code: -1, message: '参数不完整' };

      // 查找最近 5 分钟内匹配的验证码
      const res = await db.collection('sms_codes')
        .where({
          phone,
          code,
          createTime: db.command.gte(new Date(Date.now() - 300000)),
        })
        .orderBy('createTime', 'desc')
        .limit(1)
        .get();

      if (res.data.length === 0) return { code: -1, message: '验证码错误或已过期' };

      return { code: 0, data: { message: '验证通过' } };
    }

    // ====== 提交认证申请 ======
    case 'submit': {
      if (!openid) return { code: 401, message: '请先登录' };

      const { name, idNo, licenseFileID, licenseImageBase64, plateNo, phone, certPlateNo } = event;
      if (!name || !idNo) return { code: -1, message: '请填写姓名和身份证号' };
      if (!licenseFileID && !licenseImageBase64 && !plateNo) return { code: -1, message: '请上传行驶证' };

      // 身份证校验
      if (!validateIdCard(idNo)) return { code: -1, message: '身份证号格式不正确' };

      // 获取 base64（优先用 fileID）
      let base64 = licenseImageBase64 || '';
      if (licenseFileID && !base64) {
        try {
          const downloadRes = await cloud.downloadFile({ fileID: licenseFileID });
          base64 = downloadRes.fileContent?.toString('base64') || '';
        } catch (e) { console.error('下载失败:', e.message); }
      }

      // OCR 识别行驶证
      let ocrData = null;
      let ocrError = '';
      if (base64) {
        const ocrResult = await recognizeVehicleLicense(base64);
        if (ocrResult.success) {
          ocrData = ocrResult.data;
        } else {
          ocrError = ocrResult.message;
          console.error('submit中OCR失败:', ocrError);
        }
      }

      // 系统校验
      let checkResult = {
        idCardValid: true,
        ocrSuccess: !!ocrData,
        nameMatch: false,
        plateMatches: false,
        message: '',
      };

      if (ocrData) {
        checkResult.nameMatch = ocrData.owner && (ocrData.owner.includes(name) || name.includes(ocrData.owner));
        checkResult.plateMatches = plateNo ? ocrData.plateNo === plateNo : true;
        checkResult.message = checkResult.nameMatch
          ? '系统校验通过'
          : '姓名与行驶证所有人不一致，将提交人工审核';
      } else {
        checkResult.message = ocrError ? `OCR识别失败: ${ocrError}，将提交人工审核` : 'OCR未配置或识别失败，将提交人工审核';
      }

      // 存入数据库
      const verifyData = {
        openid,
        name,
        phone: phone || '',
        idNo: idNo.slice(0, 4) + '**********' + idNo.slice(-2), // 脱敏
        plateNo: ocrData?.plateNo || plateNo || '',
        licenseFileID: licenseFileID || '',
        ocrData: ocrData || {},
        checkResult,
        status: checkResult.nameMatch ? 'pending_review' : 'pending_manual',
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
      };

      const res = await db.collection('verifications').add({ data: verifyData });

      return {
        code: 0,
        data: {
          verifyId: res._id,
          checkResult,
          status: verifyData.status,
          message: checkResult.nameMatch
            ? '系统校验通过，已提交人工审核，预计1个工作日内完成'
            : '信息已提交，人工审核通过后即可完成认证',
        },
      };
    }

    // ====== OCR 识别（单独调用） ======
    case 'ocr': {
      if (!openid) return { code: 401, message: '请先登录' };
      const { licenseFileID, licenseImageBase64 } = event;
      let base64 = licenseImageBase64 || '';

      // 优先用 fileID：从云存储下载 → 转 base64
      if (licenseFileID && !base64) {
        try {
          console.log('OCR诊断: 开始从云存储下载 fileID=', licenseFileID);
          const downloadRes = await cloud.downloadFile({ fileID: licenseFileID });
          const fileBuffer = downloadRes.fileContent;
          console.log('OCR诊断: 下载完成, 文件大小=', fileBuffer?.length || fileBuffer?.byteLength || '未知', '类型=', typeof fileBuffer);
          base64 = Buffer.isBuffer(fileBuffer) ? fileBuffer.toString('base64') : '';
          console.log('OCR诊断: base64转换完成, 长度=', base64.length);
        } catch (e) {
          console.error('下载文件失败:', e.message, e.stack);
          return { code: -1, message: '读取图片失败: ' + e.message };
        }
      }

      if (!base64) return { code: -1, message: '请上传行驶证图片' };

      const ocrResult = await recognizeVehicleLicense(base64);
      if (!ocrResult.success) {
        return { code: -1, message: 'OCR识别失败: ' + ocrResult.message };
      }

      return { code: 0, data: ocrResult.data };
    }

    // ====== 查询认证状态 ======
    case 'status': {
      if (!openid) return { code: 401, message: '请先登录' };
      const { plateNo } = event;

      // 按 openid + plateNo 查询（支持多车认证）
      let where = { openid };
      if (plateNo) where.plateNo = plateNo;

      const res = await db.collection('verifications')
        .where(where)
        .orderBy('createTime', 'desc')
        .limit(1)
        .get();

      if (res.data.length === 0) {
        return { code: 0, data: { verified: false, status: 'none' } };
      }

      const verify = res.data[0];
      return {
        code: 0,
        data: {
          verified: verify.status === 'verified',
          status: verify.status,
          plateNo: verify.plateNo,
          name: verify.name,
          phone: verify.phone || '',
          checkResult: verify.checkResult,
          // OCR 识别出的车辆信息（用于自动填充）
          brandModel: (verify.ocrData && verify.ocrData.brandModel) || '',
          vehicleType: (verify.ocrData && verify.ocrData.vehicleType) || '',
          ownerName: (verify.ocrData && verify.ocrData.owner) || '',
          address: (verify.ocrData && verify.ocrData.address) || '',
          engineNo: (verify.ocrData && verify.ocrData.engineNo) || '',
          registerDate: (verify.ocrData && verify.ocrData.registerDate) || '',
          message: getStatusMessage(verify.status),
        },
      };
    }

    // ====== 查询我认证过的所有车辆（多车支持） ======
    case 'listMyVehicles': {
      if (!openid) return { code: 401, message: '请先登录' };

      const res = await db.collection('verifications')
        .where({ openid, status: 'verified' })
        .orderBy('createTime', 'desc')
        .get();

      const vehicles = (res.data || []).map(v => ({
        plateNo: v.plateNo,
        name: v.name,
        brandModel: (v.ocrData && v.ocrData.brandModel) || '',
        vehicleType: (v.ocrData && v.ocrData.vehicleType) || '',
        ownerName: (v.ocrData && v.ocrData.owner) || '',
      }));

      return { code: 0, data: vehicles };
    }

    // ====== 人工审核（管理员后台调用） ======
    case 'review': {
      const { verifyId, approved, reviewer } = event;
      if (!verifyId) return { code: -1, message: '缺少认证ID' };

      await db.collection('verifications').doc(verifyId).update({
        data: {
          status: approved ? 'verified' : 'rejected',
          reviewer: reviewer || 'admin',
          reviewTime: db.serverDate(),
          updateTime: db.serverDate(),
        },
      });

      // 审核通过时更新用户表的认证状态
      if (approved) {
        const verify = await db.collection('verifications').doc(verifyId).get();
        if (verify.data) {
          await db.collection('users').where({ openid: verify.data.openid }).update({
            data: {
              verified: true,
              plateNo: verify.data.plateNo,
              verifyId,
            },
          });
        }
      }

      return { code: 0, data: { success: true } };
    }

    // ====== 管理员查询审核列表 ======
    case 'listVerifications': {
      if (!openid) return { code: 401, message: '请先登录' };

      // 权限校验
      const adminList = (process.env.ADMIN_OPENIDS || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!adminList.includes(openid)) {
        return { code: 403, message: '无权限' };
      }

      const { status } = event;
      let where = {};
      if (status === 'pending') {
        where.status = db.command.in(['pending_review', 'pending_manual']);
      } else if (status) {
        where.status = status;
      }

      const res = await db.collection('verifications')
        .where(Object.keys(where).length ? where : db.command.or([{ status: 'pending_review' }, { status: 'pending_manual' }]))
        .orderBy('createTime', 'desc')
        .limit(50)
        .get();

      return { code: 0, data: res.data || [] };
    }

    // ====== 管理员权限校验 ======
    case 'isAdmin': {
      if (!openid) return { code: 0, data: { isAdmin: false } };

      // 从环境变量读取管理员 openid 白名单（逗号分隔）
      const adminList = (process.env.ADMIN_OPENIDS || '').split(',').map(s => s.trim()).filter(Boolean);
      const isAdmin = adminList.includes(openid);

      return { code: 0, data: { isAdmin } };
    }

    default:
      return { code: -1, message: '未知操作' };
  }
};

function getStatusMessage(status) {
  const map = {
    none: '未认证',
    pending_review: '系统校验通过，等待人工审核',
    pending_manual: '已提交，等待人工复核',
    verified: '认证通过',
    rejected: '认证未通过，请重新提交',
  };
  return map[status] || '未知状态';
}
