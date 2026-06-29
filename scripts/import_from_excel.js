/**
 * Excel 数据导入脚本
 *
 * 用法：
 * 1. 将此脚本部署为云函数 "import"
 * 2. 在云开发控制台手动执行，或在微信开发者工具中调用
 *
 * 前置条件：
 * - 已上传 Excel 文件到云存储
 * - 安装依赖：npm install xlsx
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 从云存储下载 Excel 并导入数据库
 *
 * Excel 列映射（第一行为表头）：
 * A: 项目名称       -> name
 * B: 项目地址       -> address
 * C: 收费标准       -> feeStandard
 * D: 套餐名称       -> packageName
 * E: 套餐时限       -> period
 * F: 套餐原价       -> originalPrice (元)
 * G: 套餐现价       -> price (元)
 * H: 套餐推荐       -> recommended (是/否)
 * I: 项目图片URL    -> cover
 * J: 项目标签       -> tags (逗号分隔)
 * K: 经度           -> longitude
 * L: 纬度           -> latitude
 *
 * 数据规则：
 * - 同一项目名称 = 同一停车场
 * - 同一停车场最多 3 个套餐
 * - 一行一条记录，不合并单元格
 */
exports.main = async (event, context) => {
  const { fileID } = event; // 云存储文件 ID

  if (!fileID) {
    return { code: -1, message: '请提供 fileID 参数' };
  }

  try {
    // 下载文件
    const res = await cloud.downloadFile({ fileID });
    const XLSX = require('xlsx');

    // 解析 Excel
    const workbook = XLSX.read(res.fileContent, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) {
      return { code: -1, message: 'Excel 文件为空或格式错误' };
    }

    // 跳过表头，从第二行开始
    const dataRows = rows.slice(1);

    // 按项目名称分组
    const projectMap = {};
    const stats = { total: 0, projects: 0, errors: [] };

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const name = (row[0] || '').trim();
      if (!name) continue; // 跳过空行

      if (!projectMap[name]) {
        projectMap[name] = {
          name,
          address: (row[1] || '').trim(),
          feeStandard: (row[2] || '').trim(),
          cover: (row[8] || '').trim(),
          tags: (row[9] || '').split(',').map(t => t.trim()).filter(Boolean),
          longitude: parseFloat(row[10]) || 0,
          latitude: parseFloat(row[11]) || 0,
          packages: [],
        };
      }

      const pkg = {
        name: (row[3] || '').trim(),
        period: (row[4] || '').trim(),
        originalPrice: Math.round(parseFloat(row[5] || 0) * 100), // 元转分
        price: Math.round(parseFloat(row[6] || 0) * 100),
        recommended: (row[7] || '').trim() === '是',
      };

      // 同一项目最多 3 个套餐
      if (projectMap[name].packages.length < 3 && pkg.name) {
        projectMap[name].packages.push(pkg);
      } else if (pkg.name) {
        stats.errors.push(`第${i + 2}行: "${name}" 已有${projectMap[name].packages.length}个套餐，跳过`);
      }
    }

    // 写入数据库
    for (const [projectName, project] of Object.entries(projectMap)) {
      const packages = project.packages;
      const minPrice = packages.length > 0
        ? Math.min(...packages.map(p => p.price))
        : 0;
      const minOriginalPrice = packages.length > 0
        ? Math.min(...packages.map(p => p.originalPrice))
        : 0;
      const packageTags = [...new Set(packages.map(p => p.name))];

      // 检查是否已存在
      const existing = await db.collection('parking_lots')
        .where({ name: projectName })
        .count();

      if (existing.total > 0) {
        stats.errors.push(`"${projectName}" 已存在，跳过`);
        continue;
      }

      // 创建停车场
      const parkingData = {
        name: project.name,
        address: project.address,
        feeStandard: project.feeStandard,
        images: project.cover ? [project.cover] : [],
        tags: project.tags,
        longitude: project.longitude,
        latitude: project.latitude,
        minPrice,
        minOriginalPrice,
        packageCount: packages.length,
        packageTags,
        status: 'active',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      };

      const parkingResult = await db.collection('parking_lots').add({ data: parkingData });
      const parkingId = parkingResult._id;

      // 创建套餐
      for (let i = 0; i < packages.length; i++) {
        await db.collection('packages').add({
          data: {
            parkingId,
            ...packages[i],
            sort: i + 1,
            status: 'active',
            createdAt: db.serverDate(),
          },
        });
      }

      stats.projects++;
      stats.total += packages.length;
    }

    return {
      code: 0,
      data: {
        message: `导入完成：${stats.projects} 个项目，${stats.total} 个套餐`,
        stats,
      },
    };
  } catch (err) {
    console.error('导入失败:', err);
    return { code: -1, message: err.message || '导入失败' };
  }
};
