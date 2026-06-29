// 云函数：停车场管理 v2 - 支持月卡/次卡双数据源 + 多级筛选
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 本地JSON数据（月卡 + 次卡）
const monthlyData = require('./parking_lots_monthly.json');
const countData = require('./parking_lots_count.json');

// 腾讯地图 API Key（微信地图底层供应商）
const TENCENT_MAP_KEY = 'BXSBZ-EH6CZ-HQTXZ-ZCWMW-3SYN3-SFBTV';

// ========== 构建三级筛选树: period → packageType → [subTypes] ==========
function buildFilterTree(sourceData) {
  // 结果结构: { 月卡: { 全部日间: ['工作日间','日间','日间+周末全天'], ... }, ... }
  const tree = {};
  
  sourceData.forEach(item => {
    item.packages.forEach(pkg => {
      const period = pkg.period || '';
      const pkgType = pkg.packageType || '';
      const subType = pkg.subType || '';
      if (!period || !pkgType) return;
      
      if (!tree[period]) tree[period] = {};
      if (!tree[period][pkgType]) tree[period][pkgType] = [];
      if (!tree[period][pkgType].includes(subType)) {
        tree[period][pkgType].push(subType);
      }
    });
  });
  
  // 排序
  Object.keys(tree).forEach(period => {
    Object.keys(tree[period]).forEach(pkgType => {
      tree[period][pkgType].sort();
    });
  });
  
  return tree;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const {
    action,
    id,
    keyword,
    // ====== 新筛选参数 ======
    cardType,       // 'monthly' | 'count'
    city,           // 城市筛选：深圳/广州/佛山/珠海
    period,         // 月卡/季卡/年卡/半年卡
    packageType,    // 全天/日间/夜间
    subType,        // 细分类型
    limitType,      // 仅周末/仅工作日/不限 (次卡用)
    district,       // 区
    street,         // 街道
    page = 1,
    pageSize = 100,
    parkingId,
  } = event;

  switch (action) {
    // ====== 获取停车场列表（支持多级筛选 + 精简返回） ======
    case 'list': {
      const sourceData = cardType === 'count' ? countData : monthlyData;
      let items = JSON.parse(JSON.stringify(sourceData));

      // ====== 筛选（支持逗号分隔多值） ======
      if (city) {
        const cityName = city.replace('市', '');
        items = items.filter(i => (i.city||'').replace('市','') === cityName);
      }
      if (period) {
        const vals = period.split(',').filter(Boolean);
        if (vals.length) items = items.filter(i => i.packages.some(p => vals.includes(p.period)));
      }
      if (packageType) {
        const vals = packageType.split(',').filter(Boolean);
        if (vals.length) items = items.filter(i => i.packages.some(p => vals.includes(p.packageType)));
      }
      if (subType) {
        const vals = subType.split(',').filter(Boolean);
        if (vals.length) items = items.filter(i => i.packages.some(p => vals.includes(p.subType)));
      }
      if (limitType) {
        const vals = limitType.split(',').filter(Boolean);
        if (vals.length) {
          items = items.filter(i => i.packages.some(p => {
            if (vals.includes('不限') && (!p.limitType || p.limitType === '不限')) return true;
            return vals.includes(p.limitType);
          }));
        }
      }
      if (district) {
        const vals = district.split(',').filter(Boolean);
        if (vals.length) items = items.filter(i => vals.some(v => i.district === v || (i.address||'').includes(v)));
      }
      if (street) {
        const vals = street.split(',').filter(Boolean);
        if (vals.length) items = items.filter(i => vals.some(v => (i.street||'') === v || (i.address||'').includes(v)));
      }
      // ====== 关键词搜索（名称 + 地址模糊匹配） ======
      if (keyword) {
        const kw = keyword.trim();
        if (kw) {
          items = items.filter(i => {
            const name = (i.name || '').toLowerCase();
            const addr = (i.address || '').toLowerCase();
            const k = kw.toLowerCase();
            return name.includes(k) || addr.includes(k);
          });
        }
      }

      const total = items.length;

      // 分页
      const start = (page - 1) * pageSize;
      const pagedItems = items.slice(start, start + pageSize);

      // ====== 精简返回字段（只保留列表展示所需） ======
      const slimList = pagedItems.map(item => {
        const pkgs = (item.packages || []).map(p => ({
          n: p.name || '',            // 套餐名
          p: p.price || p.originalPrice || 0,  // 价格
          t: p.period || '',          // 周期
          y: p.packageType || '',     // 类型
          s: p.subType || '',         // 细分
          l: p.limitType || '',       // 次卡限定
          r: p.timeRange || '',       // 时限
          d: p.validDays || 0,        // 有效天数(次卡)
          c: p.inOutCount || 0,       // 进出次数(次卡)
          g3: p.groupPrice3 || 0,     // 好友团价
          g10: p.groupPrice15 || 0,   // 企业团价
          pu: p.perUsePrice || 0,     // 单次停放价(次卡)
          op: p.originalPrice || 0,   // 原价
        }));
        return {
          id: item._id,
          na: item.name || '',         // 名称
          ad: item.address || '',      // 地址
          di: item.district || '',     // 区
          st: item.street || '',       // 街道
          la: item.latitude || 0,      // 纬度
          lo: item.longitude || 0,     // 经度
          mp: (()=>{
            const isCountCard = (item.cardType||'') === 'count';
            const vs = isCountCard
              ? (item.packages||[]).map(p=>p.perUsePrice||0).filter(v=>v>0)    // 次卡取单次停放价
              : (item.packages||[]).map(p=>p.price||p.originalPrice||0).filter(v=>v>0);  // 月卡取套餐价
            return vs.length?Math.min(...vs):0;
          })(),  // 最低价
          ct: cardType || item.cardType || '',     // 月卡/次卡（优先用请求参数）
          pc: (item.packages || []).length,  // 套餐数
          pt: (item.packageTags || []).slice(0, 6),  // 标签(限6个)
          pk: pkgs,                    // 前3个套餐(精简)
          fd: item.feeDesc || item.feeStandard || '',  // 收费标准
        };
      });

      return {
        code: 0,
        data: { list: slimList, total },
      };
    }

    // ====== 获取停车场详情 ======
    case 'detail': {
      if (!id) return { code: -1, message: '缺少 ID' };

      // 从两个数据源中查找
      let parking = monthlyData.find(p => p._id === id) || countData.find(p => p._id === id);

      if (!parking) {
        // 回退到数据库查询
        try {
          const parkingResult = await db.collection('parking_lots').doc(id).get();
          parking = parkingResult.data;

          const packagesResult = await db.collection('packages')
            .where({ parkingId: id, status: 'active' })
            .orderBy('sort', 'asc')
            .get();

          return {
            code: 0,
            data: {
              parking,
              packages: packagesResult.data,
              isFavorite: false,
            },
          };
        } catch (e) {
          return { code: -1, message: '停车场不存在' };
        }
      }

      // 检查是否收藏
      let isFavorite = false;
      if (openid) {
        try {
          const favResult = await db.collection('favorites')
            .where({ openid, parkingId: id })
            .count();
          isFavorite = favResult.total > 0;
        } catch (e) {}
      }

      return {
        code: 0,
        data: {
          parking,
          packages: parking.packages || [],
          isFavorite,
        },
      };
    }

    // ====== 搜索停车场 ======
    case 'search': {
      if (!keyword) return { code: 0, data: { list: [], total: 0 } };

      const allData = [...monthlyData, ...countData];
      const kw = keyword.toLowerCase();

      // 去重（同一停车场可能在月卡和次卡中都存在）
      const seen = new Set();
      const results = allData.filter(item => {
        if (seen.has(item.name)) return false;
        const match = (item.name||'').toLowerCase().includes(kw)
          || (item.address||'').toLowerCase().includes(kw)
          || (item.district||'').toLowerCase().includes(kw)
          || (item.street||'').toLowerCase().includes(kw);
        if (match) { seen.add(item.name); return true; }
        return false;
      });

      const list = results.slice(0, 20).map(item => ({
        _id: item._id,
        name: item.name,
        address: item.address,
        district: item.district,
        minPrice: item.minPrice || 0,
        packageCount: (item.packages || []).length,
        cardType: item.cardType,
        packageTags: item.packageTags || [],
      }));

      return { code: 0, data: { list, total: list.length } };
    }

    // ====== 获取筛选器选项 ======
    case 'filterOptions': {
      const sourceData = cardType === 'count' ? countData : monthlyData;

      // 收集所有不重复的选项
      const periods = new Set();
      const types = new Set();
      const subTypes = new Set();
      const limitTypes = new Set();
      const districtMap = {};

      sourceData.forEach(item => {
        const d = item.district || '其他';
        if (!districtMap[d]) districtMap[d] = { count: 0, streets: new Set() };
        districtMap[d].count++;

        // 直接用 JSON 数据中的 street 字段
        const streetVal = item.street || '';
        if (streetVal) districtMap[d].streets.add(streetVal);

        (item.packages || []).forEach(pkg => {
          if (pkg.period) periods.add(pkg.period);
          if (pkg.packageType) types.add(pkg.packageType);
          if (pkg.subType) subTypes.add(pkg.subType);
          if (pkg.limitType && pkg.limitType !== '不限') limitTypes.add(pkg.limitType);
        });
      });

      const districts = Object.entries(districtMap)
        .sort((a,b) => b[1].count - a[1].count)
        .map(([name, info]) => ({
          name, count: info.count,
          streets: [...info.streets].sort(),
        }));

      return {
        code: 0,
        data: {
          filterTree: buildFilterTree(sourceData),
          districts,
          total: sourceData.length,
        },
      };
    }

    // ====== 地图标记（按边界框查询） ======
    case 'bounds': {
      const { swLat, swLng, neLat, neLng } = event;
      if (!swLat || !swLng || !neLat || !neLng) {
        return { code: -1, message: '缺少边界参数' };
      }

      const sourceData = cardType === 'count' ? countData : (cardType === 'monthly' ? monthlyData : [...monthlyData, ...countData]);

      // 边界框过滤
      const items = sourceData.filter(item => {
        const la = item.latitude, lo = item.longitude;
        return la && lo && la >= swLat && la <= neLat && lo >= swLng && lo <= neLng;
      });

      // 超过200个点时做网格聚合
      const list = items.slice(0, 200).map(item => ({
        id: item._id,
        na: item.name || '',
        ad: item.address || '',
        di: item.district || '',
        la: item.latitude || 0,
        lo: item.longitude || 0,
        mp: item.minPrice || 0,
        ct: item.cardType || '',
        pc: (item.packages || []).length,
      }));

      return {
        code: 0,
        data: { list, total: items.length, truncated: items.length > 200 },
      };
    }

    // ====== 附近搜索（按坐标 + 距离排序） ======
    case 'nearby': {
      const { lat, lng, radius = 5, sortBy = 'distance', limit = 20, period = '' } = event;
      if (lat === undefined || lng === undefined) {
        return { code: -1, message: '缺少坐标参数 lat/lng' };
      }

      // 选择数据源
      let sourceData = cardType === 'count' ? countData : (cardType === 'monthly' ? monthlyData : [...monthlyData, ...countData]);

      // period 过滤：优先筛选匹配时段套餐的项目
      if (period && (period === '日间' || period === '夜间')) {
        sourceData = sourceData.filter(item => {
          const pkgs = item.packages || [];
          return pkgs.some(p => (p.period || p.timeRange || '').includes(period));
        });
        // 如果过滤后数据太少，放宽为全部（避免0结果）
        if (sourceData.length < 3) {
          sourceData = cardType === 'count' ? countData : (cardType === 'monthly' ? monthlyData : [...monthlyData, ...countData]);
        }
      }

      // Haversine 公式计算两点距离（公里）
      const toRad = deg => deg * Math.PI / 180;
      const calcDist = (la1, lo1, la2, lo2) => {
        if (!la1 || !lo1 || !la2 || !lo2) return 9999;
        const R = 6371;
        const dLat = toRad(la2 - la1);
        const dLon = toRad(lo2 - lo1);
        const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLon/2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      // 计算距离并过滤
      const withDist = sourceData
        .map(item => ({
          ...item,
          _distance: calcDist(lat, lng, item.latitude, item.longitude),
        }))
        .filter(item => item._distance <= radius);

      // 排序
      if (sortBy === 'price') {
        withDist.sort((a, b) => (a.minPrice || 9999) - (b.minPrice || 9999));
      } else {
        withDist.sort((a, b) => a._distance - b._distance);
      }

      const results = withDist.slice(0, limit);

      // 精简返回
      const list = results.map(item => {
        const pkgs = (item.packages || []).slice(0, 3).map(p => ({
          n: p.name || '',
          p: p.price || p.originalPrice || 0,
          t: p.period || '',
          y: p.packageType || '',    // 全天/日间/夜间
          s: p.subType || '',        // 细分类型
          r: p.timeRange || '',      // 可停放时间
          l: p.limitType || '',      // 次卡限定
          c: p.inOutCount || 0,      // 进出次数
          d: p.validDays || 0,       // 有效天数
          g3: p.groupPrice3 || 0,
          g10: p.groupPrice15 || 0,
          pu: p.perUsePrice || 0,
          op: p.originalPrice || 0,
        }));
        return {
          id: item._id,
          na: item.name || '',
          ad: item.address || '',
          di: item.district || '',
          st: item.street || '',
          la: item.latitude || 0,
          lo: item.longitude || 0,
          mp: item.minPrice || 0,
          ct: item.cardType || '',
          pc: (item.packages || []).length,
          fd: item.feeDesc || item.feeStandard || '',
          pk: pkgs,
          dist: Math.round(item._distance * 100) / 100,  // 距离(km)
        };
      });

      return { code: 0, data: { list, total: list.length, center: { lat, lng } } };
    }

    // ====== 收藏操作（保持不变） ======
    case 'addFavorite': {
      if (!openid || !parkingId) return { code: -1, message: '参数错误' };
      const exist = await db.collection('favorites').where({ openid, parkingId }).count();
      if (exist.total > 0) return { code: 0, data: { success: true } };
      await db.collection('favorites').add({
        data: { openid, parkingId, createdAt: db.serverDate() },
      });
      return { code: 0, data: { success: true } };
    }

    case 'removeFavorite': {
      if (!openid || !parkingId) return { code: -1, message: '参数错误' };
      await db.collection('favorites').where({ openid, parkingId }).remove();
      return { code: 0, data: { success: true } };
    }

    case 'favoriteList': {
      if (!openid) return { code: 0, data: [] };
      const favResult = await db.collection('favorites').where({ openid }).get();
      const parkingIds = favResult.data.map(f => f.parkingId);
      if (parkingIds.length === 0) return { code: 0, data: [] };

      // 建立次卡ID集合，用于推断 cardType
      const countIds = new Set(countData.map(d => d._id));

      const allData = [...monthlyData, ...countData];
      const favorites = allData.filter(p => parkingIds.includes(p._id));

      // 转为 slim 格式（双重字段名：raw 名称供组件直接渲染，slim 名称供 compact 传输）
      const slimFavorites = favorites.map(item => {
        const itemCardType = item.cardType || (countIds.has(item._id) ? 'count' : 'monthly');
        const pkgs = (item.packages || []).map(p => ({
          n: p.name || '',
          p: p.price || p.originalPrice || 0,
          t: p.period || '',
          y: p.packageType || '',
          s: p.subType || '',
          l: p.limitType || '',
          r: p.timeRange || '',
          d: p.validDays || 0,
          c: p.inOutCount || 0,
          g3: p.groupPrice3 || 0,
          g10: p.groupPrice15 || 0,
          pu: p.perUsePrice || 0,
          op: p.originalPrice || 0,
        }));
        const isCount = itemCardType === 'count';
        const prices = isCount
          ? (item.packages || []).map(p => p.perUsePrice || 0).filter(v => v > 0)
          : (item.packages || []).map(p => p.price || p.originalPrice || 0).filter(v => v > 0);
        const minP = prices.length ? Math.min(...prices) : 0;
        return {
          id: item._id, _id: item._id,
          na: item.name || '', name: item.name || '',
          ad: item.address || '', address: item.address || '',
          di: item.district || '', district: item.district || '',
          st: item.street || '', street: item.street || '',
          la: item.latitude || 0, latitude: item.latitude || 0,
          lo: item.longitude || 0, longitude: item.longitude || 0,
          mp: minP, minPrice: minP,
          ct: itemCardType, cardType: itemCardType,
          pc: (item.packages || []).length, packageCount: (item.packages || []).length,
          pt: (item.packageTags || []).slice(0, 6), packageTags: (item.packageTags || []).slice(0, 6),
          pk: pkgs, packages: (item.packages || []),
          fd: item.feeDesc || item.feeStandard || '',
          feeDesc: item.feeDesc || item.feeStandard || '',
        };
      });

      return { code: 0, data: slimFavorites };
    }

    // ====== 逆地理编码（坐标→城市/区） ======
    case 'reverseGeo': {
      const { latitude, longitude } = event;
      if (!latitude || !longitude) {
        return { code: -1, message: '缺少坐标参数' };
      }

      const https = require('https');
      const geoUrl = `https://apis.map.qq.com/ws/geocoder/v1/?location=${latitude},${longitude}&key=${TENCENT_MAP_KEY || 'BXSBZ-EH6CZ-HQTXZ-ZCWMW-3SYN3-SFBTV'}&get_poi=0`;

      return new Promise((resolve) => {
        https.get(geoUrl, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data.status === 0 && data.result) {
                const ad = data.result.address_component || {};
                resolve({
                  code: 0,
                  data: {
                    city: ad.city || '',
                    district: ad.district || '',
                    province: ad.province || '',
                    address: data.result.address || '',
                  },
                });
              } else {
                resolve({ code: -1, message: '逆地理编码失败' });
              }
            } catch (e) {
              resolve({ code: -1, message: '解析失败' });
            }
          });
        }).on('error', () => resolve({ code: -1, message: '网络错误' }));
      });
    }

    default:
      return { code: -1, message: '未知操作' };
  }
};
