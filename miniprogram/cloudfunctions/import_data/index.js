// 云函数：数据导入
// 从云存储读取 JSONL 文件，批量写入数据库
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 每批插入数量
const BATCH_SIZE = 100;

exports.main = async (event, context) => {
  const { collection, fileID } = event;

  if (!collection || !fileID) {
    return { code: -1, message: '缺少参数: collection, fileID' };
  }

  if (!['parking_lots', 'packages'].includes(collection)) {
    return { code: -1, message: '无效集合名' };
  }

  try {
    // 1. 下载云存储文件
    console.log(`正在下载文件: ${fileID}`);
    const res = await cloud.downloadFile({ fileID });
    const text = res.fileContent.toString('utf-8');

    // 2. 解析 JSONL（每行一个 JSON 对象）
    const lines = text.trim().split('\n').filter(line => line.trim());
    const records = lines.map(line => JSON.parse(line));

    console.log(`共解析 ${records.length} 条记录`);

    // 3. 批量插入
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      // 逐个插入（云开发批量插入用 Promise.all）
      const promises = batch.map(record => {
        return db.collection(collection).add({ data: record })
          .then(() => { inserted++; return null; })
          .catch(err => {
            errors++;
            console.error(`插入失败: ${record._id || 'unknown'}`, err.message);
            return null;
          });
      });

      await Promise.all(promises);

      // 报告进度
      if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= records.length) {
        console.log(`进度: ${Math.min(i + BATCH_SIZE, records.length)}/${records.length}`);
      }
    }

    console.log(`导入完成: ${inserted} 条成功, ${errors} 条失败`);

    return {
      code: 0,
      data: {
        collection,
        total: records.length,
        inserted,
        errors,
      },
    };
  } catch (err) {
    console.error('导入失败:', err);
    return { code: -1, message: err.message || '导入失败' };
  }
};
