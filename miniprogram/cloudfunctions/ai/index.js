// AI 智能问答云函数 - 对接 DeepSeek API
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 如果初始化失败，尝试用默认环境
try {
  const db = cloud.database();
} catch (e) {
  cloud.init({ env: 'cloudbase' });
}

// ========== 配置 ==========
const AI_CONFIG = {
  baseURL: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat',
  temperature: 0.7,
  max_tokens: 1024,
  // API Key：优先读取云函数环境变量 DEEPSEEK_API_KEY，兜底使用硬编码（粤停汇）
  apiKey: process.env.DEEPSEEK_API_KEY || 'sk-9930131539cc460c974cd2d02e1ea345',
  fallbackReply: '抱歉，AI服务暂时不可用。您可以尝试以下方式：\n1. 使用搜索框直接搜索停车场名称\n2. 使用智能筛选按价格/距离排序\n3. 使用区域筛选查找就近车场'
};

// 腾讯地图地理解码配置
const GEO_CONFIG = {
  apiKey: 'BXSBZ-EH6CZ-HQTXZ-ZCWMW-3SYN3-SFBTV',
  geocoderURL: 'https://apis.map.qq.com/ws/geocoder/v1/',
  placeSearchURL: 'https://apis.map.qq.com/ws/place/v1/search/',
  directionURL: 'https://apis.map.qq.com/ws/direction/v1/driving/',
};

// ========== 智能搜索：解析自然语言为搜索参数 ==========
const SMART_SEARCH_PROMPT = `你是搜索解析器。将用户的停车搜索需求转换为JSON格式的搜索参数。

可用参数：
- keyword: 搜索关键词（地名、小区名、路名、商场名）
- cardType: "monthly"(月卡) 或 "count"(次卡/临停)
- sortBy: "distance"(最近) 或 "price"(最便宜) 或 ""
- period: "" 或 "日间" 或 "夜间" — 停车时间段偏好
- district: 区名，如"福田区"、"南山区"、"罗湖区"、"龙岗区"、"宝安区"、"龙华区"、"光明区"、"坪山区"、"盐田区"、"天河区"、"番禺区"、"白云区"、"越秀区"、"海珠区"、"黄埔区"、"南沙区"、"花都区"、"增城区"、"从化区"
- priceMin/priceMax: 价格范围(数字，可选)
- needLocation: true/false — 用户提到了某个具体地点要找周边
- targetPlace: 具体地点名称（仅当needLocation=true时填写）
- explanation: 一句话解释你理解的需求（20字内）

==== 规则：位置意图识别 ====
以下句式必须设置 needLocation=true，targetPlace=地点名：
【住在/家在】我家住XX / 住在XX / 家在XX / 我们小区XX → targetPlace=XX
【工作在/上班】我在XX上班 / 在XX工作 / 公司XX / 单位在XX → targetPlace=XX
【去办事】去XX办事/办点事/买东西/逛街/看电影/吃饭/约朋友/接人/送人 → targetPlace=XX
【找附近】XX附近/旁边/周围有没有 / 离XX最近 / 靠近XX → targetPlace=XX
【找周边】帮我找XX周边/一带的停车场 / 搜XX周边 → needLocation=true, targetPlace=XX
【导航式】到XX怎么停车 / 去XX哪里停车 / XX那里好停车吗 → targetPlace=XX

==== 规则：卡类型识别 ====
月卡类：月卡/包月/月租/长租/长停/长期停车/按月 → cardType="monthly"
次卡类：次卡/按次/临停/临时/临时停车/停一下/停一会/停几个小时/逛一下 → cardType="count"

==== 规则：时间段识别 ====
日间类：白天/日间/早上/上午/中午/下午/午间/白天时段/天亮/正常时段 → period="日间"
夜间类：夜间/晚上/夜里/通宵/半夜/凌晨/过夜/天黑后/晚班 → period="夜间"

==== 规则：排序识别 ====
最便宜类：便宜/最便宜/划算/省钱/最低价/低价/实惠/平价/经济实惠/优惠/折扣/低于XX/不超过XX → sortBy="price"
最近类：最近/最近距离/离我最近/附近/周边/旁边/近一点/走近路 → sortBy="distance"

==== 规则：价格范围 ====
低于300/不超过500/500以内/300以下 → priceMax=对应数字
高于200/200以上/至少200 → priceMin=对应数字

==== 其他规则 ====
1. 只输出纯JSON，不要markdown，不要额外文字
2. 不确定的参数用空字符串""
3. "临停"即"次卡"，"停车场"即"车场"
4. 未明确说城市名时，默认用户所在城市

示例输入: "我在卓越中心上班，帮我搜一下附近最便宜的车场"
示例输出: {"keyword":"","cardType":"","sortBy":"price","period":"","needLocation":true,"targetPlace":"卓越中心","explanation":"卓越中心周边最便宜停车场"}

示例输入: "明天下午去万象天地逛街，帮我找附近日间最便宜的临停"
示例输出: {"keyword":"","cardType":"count","sortBy":"price","period":"日间","needLocation":true,"targetPlace":"万象天地","explanation":"万象天地日间次卡最便宜"}

示例输入: "我家住在华美丽苑，想找个附近最便宜的月卡"
示例输出: {"keyword":"","cardType":"monthly","sortBy":"price","period":"","needLocation":true,"targetPlace":"华美丽苑","explanation":"华美丽苑周边月卡最便宜"}

示例输入: "晚上去南山海岸城吃饭，附近有没有通宵停车场"
示例输出: {"keyword":"","cardType":"count","sortBy":"price","period":"夜间","district":"南山区","needLocation":true,"targetPlace":"海岸城","explanation":"海岸城周边夜间次卡"}`;

/**
 * 本地智能搜索解析（无需API，正则+关键词）
 */
function localSmartSearch(query, userCity) {
  const result = { keyword: '', cardType: '', sortBy: '', district: '', period: '', priceMin: '', priceMax: '', needLocation: false, targetPlace: '', explanation: '' };

  // 城市/区名映射
  const szDistricts = ['福田', '南山', '罗湖', '龙岗', '宝安', '龙华', '光明', '坪山', '盐田', '大鹏'];
  const gzDistricts = ['天河', '越秀', '海珠', '荔湾', '白云', '番禺', '黄埔', '南沙', '花都', '增城', '从化', '萝岗'];

  // 检测用户是否提到了其他城市
  const cityMentions = {
    '广州': ['广州', '广州市'], '佛山': ['佛山', '佛山市'], '珠海': ['珠海', '珠海市'],
    '深圳': ['深圳', '深圳市'],
  };
  let mentionedCity = '';
  for (const [city, aliases] of Object.entries(cityMentions)) {
    if (aliases.some(a => query.includes(a))) { mentionedCity = city; break; }
  }

  // 实际使用的城市：用户提到的优先，否则用定位城市，默认深圳
  const effectiveCity = mentionedCity || userCity || '深圳';

  // 提取区名（仅在有效城市对应的区名中匹配）
  const districts = effectiveCity === '广州' ? gzDistricts : szDistricts;
  for (const d of districts) {
    if (query.includes(d)) { result.district = d + '区'; break; }
  }

  // 卡类型（扩展关键词）
  if (/月卡|包月|月租|长租|长停|长期停车|按月/.test(query)) result.cardType = 'monthly';
  else if (/次卡|按次|临停|临时|停一下|停一会|逛一下|临时停车/.test(query)) result.cardType = 'count';

  // 时间周期（扩展关键词）
  if (/白天|日间|早上|上午|中午|下午|午间|天亮/.test(query)) result.period = '日间';
  else if (/夜间|晚上|夜里|通宵|半夜|凌晨|过夜|天黑|晚班/.test(query)) result.period = '夜间';

  // 排序
  if (query.includes('便宜') || query.includes('最低') || query.includes('划算') || query.includes('低价')) result.sortBy = 'price';
  else if (query.includes('近') || query.includes('附近') || query.includes('最近') || query.includes('旁边')) result.sortBy = 'distance';

  // ====== 位置意图检测（覆盖全部常见句式） ======
  const goPlacePatterns = [
    /去(.{2,12})(?:办点事|买东西|办事|吃饭|逛街|逛|玩|找朋友|接人|送人|看电影|约会|附近|周边|旁边)/,
    /(?:在|我?在)(.{2,12})(?:上班|工作|做事)/,
    /(?:我家住?|家住?|我们?小区)(.{2,12})/,
    /(?:公司|单位|上班地点)(?:在|是)(.{2,12})/,
    /(?:(?:在|离|靠近|靠)(.{2,12})(?:附近|周边|旁边|一带|最近|近)|.{2,12}(?:的|那)(?:附近|周边|旁边|一带))/,
  ];
  for (const p of goPlacePatterns) {
    const m = query.match(p);
    if (m) {
      result.needLocation = true;
      result.targetPlace = m[1];
      // 也作为关键词兜底
      if (!result.keyword) result.keyword = m[1];
      break;
    }
  }

  // 关键词提取（提取地名/小区名——仅当needLocation未匹配到时）
  if (!result.needLocation) {
    const keywordPatterns = [
      /离(.{2,8})(?:最近|附近|旁边)/, /在(.{2,8})(?:附近|旁边|周围)/,
      /搜索(.{2,8})/, /找(.{2,8})(?:的|附近)/
    ];
    for (const p of keywordPatterns) {
      const m = query.match(p);
      if (m) { result.keyword = m[1]; break; }
    }
  }

  // 价格提取
  const priceUnder = query.match(/(?:低于|小于|不超过|以内)(\d+)/);
  if (priceUnder) result.priceMax = priceUnder[1];

  result.explanation = (result.needLocation && result.targetPlace ? result.targetPlace + '周边' : '')
    + (result.district ? ' ' + result.district : '')
    + (result.cardType === 'monthly' ? ' 月卡' : result.cardType === 'count' ? ' 次卡' : '')
    + (result.sortBy === 'price' ? ' 最便宜' : result.sortBy === 'distance' ? ' 最近' : '')
    || '智能搜索';

  return result;
}

/**
 * AI智能搜索解析（调用DeepSeek）
 */
async function aiSmartSearch(query, apiKey) {
  const msgs = [
    { role: 'system', content: SMART_SEARCH_PROMPT },
    { role: 'user', content: query }
  ];
  const reply = await callDeepSeek(msgs, apiKey);
  // 尝试解析JSON
  const cleaned = reply.replace(/```json\n?|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // 解析失败时用本地兜底
    return localSmartSearch(query);
  }
}
const SYSTEM_PROMPT = `你是"粤停汇"停车比价助手，帮助用户在广州市查找最划算的停车场。
你的知识范围：
- 广州各区停车场月卡/次卡价格对比
- 停车套餐推荐（24小时/白天/夜间/周末/工作日等）
- 附近停车攻略

回答要求：
1. 简洁实用，直接给出建议
2. 涉及价格时注明是月卡还是次卡
3. 如果不确定，建议用户使用App内筛选功能
4. 回复使用中文
5. 每次回答控制在300字以内`;

// 停车知识库（内置，无需API也能回答）
const PARKING_KB = {
  '月卡': '月卡适合长期停车的车主，广州月卡价格一般在300-1200元/月。市中心（天河、越秀）偏贵，外围区（番禺、白云）较便宜。建议按月卡比价筛选。',
  '次卡': '次卡按次计费，适合偶尔停车的车主。价格一般5-30元/次。有10次卡、20次卡、30次卡等套餐，次数越多单价越低。',
  '临停': '临时停车按小时收费，广州核心区首小时10-15元，之后每小时5-8元。全天封顶60-120元不等。',
  '充电': '充电站停车一般充电免2小时停车费，超时按正常收费标准。部分充电站有充电专属停车套餐。',
};

/**
 * 本地规则匹配回复（无需API）
 */
function localReply(question) {
  const q = question.toLowerCase();
  for (const [keyword, answer] of Object.entries(PARKING_KB)) {
    if (question.includes(keyword)) return answer;
  }
  // 通用回复
  if (q.includes('便宜') || q.includes('划算') || q.includes('最低')) {
    return '广州停车最便宜的区域在番禺、白云、黄埔的外围地段，月卡低至300元/月。建议使用"价格最低"排序查找附近最划算的停车场。您也可以告诉我具体想在哪个区停车，我帮您推荐。';
  }
  if (q.includes('附近') || q.includes('周边') || q.includes('最近')) {
    return '请使用App首页的"全部车场"功能，打开"位置最近"排序，即可看到离您最近的停车场和价格。记得授权位置权限哦！';
  }
  if (q.includes('推荐') || q.includes('建议')) {
    return '根据您的需求，建议：\n1. 长期停车选月卡（300-1200元/月）\n2. 偶尔停车选次卡（5-30元/次）\n3. 短期临停按小时计费\n\n请告诉我您的停车频率和预算，我来精准推荐。';
  }
  return '好的，让我帮您分析一下。请告诉我：\n1. 您想在哪个区停车？\n2. 是长期停车还是临时停车？\n3. 预算大概是多少？\n\n这样我能给您更精准的推荐！';
}

/**
 * 腾讯地图地理解码：地名 → 经纬度
 * 策略：优先 POI 地点搜索（适合商场/小区/地标），失败则回退 geocoder 地址解析
 */
async function geocodePlace(placeName, region = '深圳') {
  const https = require('https');
  const qs = require('querystring');

  // ====== 策略1：POI地点搜索（对商场/地标/小区最准） ======
  const regionFull = (region || '').includes('市') ? region : (region || '深圳') + '市';
  const poiUrl = `${GEO_CONFIG.placeSearchURL}?${qs.stringify({
    keyword: placeName,
    key: GEO_CONFIG.apiKey,
    boundary: `region(${encodeURIComponent(regionFull)},0)`,
    page_size: 3,
    orderby: '_distance desc',
  })}`;

  try {
    const poiResult = await new Promise((resolve, reject) => {
      const req = https.get(poiUrl, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.status === 0 && json.data && json.data.length > 0) {
              resolve(json.data[0]); // 取第一个最匹配的POI
            } else {
              reject(new Error('POI未找到'));
            }
          } catch (e) { reject(new Error('POI解析失败')); }
        });
      });
      req.on('error', reject);
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('POI超时')); });
    });

    if (poiResult && poiResult.location) {
      return {
        lat: poiResult.location.lat,
        lng: poiResult.location.lng,
        address: poiResult.address || '',
        title: poiResult.title || placeName,
        source: 'poi',
      };
    }
  } catch (e) {
    console.log('POI搜索失败，回退geocoder:', e.message);
  }

  // ====== 策略2：geocoder 地址解析（兜底） ======
  const regionCandidates = [
    region,
    (region || '') + '市',
    (region || '').replace('市', ''),
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  for (let attempt = 0; attempt < regionCandidates.length; attempt++) {
    const tryRegion = regionCandidates[attempt];
    const url = `${GEO_CONFIG.geocoderURL}?address=${encodeURIComponent(placeName)}&key=${GEO_CONFIG.apiKey}&region=${encodeURIComponent(tryRegion)}`;

    try {
      const result = await new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.status === 0 && json.result?.location) {
                resolve({
                  lat: json.result.location.lat,
                  lng: json.result.location.lng,
                  address: json.result.address || '',
                  title: json.result.title || placeName,
                  source: 'geocoder',
                });
              } else {
                reject(new Error(`status=${json.status} ${json.message || ''}`));
              }
            } catch (e) {
              reject(new Error('解析失败: ' + data.slice(0, 100)));
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('超时')); });
      });
      if (result) return result;
    } catch (e) {
      console.log(`geocoder尝试${attempt + 1}失败 (region=${tryRegion}):`, e.message);
    }
  }

  // 最后尝试不带region
  try {
    const url = `${GEO_CONFIG.geocoderURL}?address=${encodeURIComponent(placeName)}&key=${GEO_CONFIG.apiKey}`;
    const result = await new Promise((resolve, reject) => {
      const req = https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.status === 0 && json.result?.location) {
              resolve({
                lat: json.result.location.lat,
                lng: json.result.location.lng,
                address: json.result.address || '',
                title: json.result.title || placeName,
                source: 'geocoder_no_region',
              });
            } else {
              reject(new Error(`status=${json.status} ${json.message || ''}`));
            }
          } catch (e) { reject(new Error('解析失败')); }
        });
      });
      req.on('error', reject);
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('超时')); });
    });
    return result;
  } catch (e) {
    console.log('geocoder无region也失败:', e.message);
  }

  throw new Error(`无法定位"${placeName}"`);
}

/**
 * 调用 parking 云函数的 nearby 搜索
 */
async function searchNearbyParking(lat, lng, cardType, sortBy, limit, period = '') {
  try {
    const result = await cloud.callFunction({
      name: 'parking',
      data: { action: 'nearby', lat, lng, radius: 5, cardType: cardType || '', sortBy: sortBy || 'price', limit: limit || 15, period },
    });
    return result.result;
  } catch (e) {
    console.error('parking.nearby 调用失败:', e);
    return null;
  }
}

/**
 * 腾讯地图 POI 搜索：搜索附近地点（商场、写字楼等）
 */
async function searchPOI(keyword, lat, lng, radius = 3000) {
  const https = require('https');
  const qs = require('querystring');
  const url = `${GEO_CONFIG.placeSearchURL}?${qs.stringify({
    keyword, key: GEO_CONFIG.apiKey,
    boundary: `nearby(${lat},${lng},${radius})`,
    page_size: 10,
  })}`;

  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 0 && json.data) {
            resolve(json.data.map(p => ({
              title: p.title, address: p.address, category: p.category,
              lat: p.location.lat, lng: p.location.lng,
              distance: p._distance || 0,
            })));
          } else { resolve([]); }
        } catch (e) { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

/**
 * 腾讯地图路线规划：驾车导航距离/时间
 */
async function getRoute(fromLat, fromLng, toLat, toLng) {
  const https = require('https');
  const qs = require('querystring');
  const url = `${GEO_CONFIG.directionURL}?${qs.stringify({
    from: `${fromLat},${fromLng}`,
    to: `${toLat},${toLng}`,
    key: GEO_CONFIG.apiKey,
  })}`;

  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 0 && json.result?.routes?.[0]) {
            const r = json.result.routes[0];
            resolve({ distance: r.distance, duration: r.duration });
          } else { resolve(null); }
        } catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

/**
 * AI Agent 执行协调器：多步骤自主搜索
 * 当用户说"帮我找XX附近最便宜的停车场"时，Agent自动执行：
 * 步骤1: 解析意图 → 步骤2: 地理解码 → 步骤3: nearby搜索 → 步骤4: 排序推荐
 */
async function callDeepSeek(messages, apiKey) {
  const https = require('https');
  const http = require('http');

  const body = JSON.stringify({
    model: AI_CONFIG.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
    ],
    temperature: AI_CONFIG.temperature,
    max_tokens: AI_CONFIG.max_tokens,
    stream: false
  });

  return new Promise((resolve, reject) => {
    const url = new URL(AI_CONFIG.baseURL);
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 15000
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content);
          } else {
            reject(new Error(json.error?.message || 'API返回异常'));
          }
        } catch (e) {
          reject(new Error('解析AI回复失败'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('AI响应超时')); });
    req.write(body);
    req.end();
  });
}

/**
 * 主函数
 */
exports.main = async (event) => {
  const { action, query, messages = [], question, history = [], userCity } = event;
  const wxContext = cloud.getWXContext();
  const apiKey = AI_CONFIG.apiKey;

  // ====== AI Agent 自主执行 ======
  if (action === 'agent' && query) {
    const steps = [];
    try {
      // Step 1: DeepSeek 解析意图（主解析器，失败时降级本地）
      steps.push({ icon: '🤖', label: 'AI分析意图', text: '正在理解您的需求...', status: 'running' });
      let parsed;
      if (apiKey) {
        try {
          parsed = await aiSmartSearch(query, apiKey);
          parsed.source = 'ai';
        } catch (e) {
          console.log('DeepSeek解析失败，降级本地解析:', e.message);
          parsed = localSmartSearch(query, userCity);
          parsed.source = 'local_fallback';
        }
      } else {
        parsed = localSmartSearch(query, userCity);
        parsed.source = 'local';
      }
      steps[0].text = parsed.explanation || '已理解需求';
      steps[0].status = 'done';

      // Step 2: 如需要定位，执行地理解码
      if (parsed.needLocation && parsed.targetPlace) {
        steps.push({ icon: '📍', label: '定位目标地点', text: `正在查找"${parsed.targetPlace}"...`, status: 'running' });
        try {
          const region = userCity || '深圳';
          const geo = await geocodePlace(parsed.targetPlace, region);
          if (geo?.lat) {
            steps[1].text = `${geo.title || parsed.targetPlace} (${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)})`;
            steps[1].status = 'done';

            // Step 3: 周边搜索
            steps.push({ icon: '🔍', label: '周边搜索', text: '正在搜索周边停车场...', status: 'running' });
            stepLabel = `${parsed.sortBy === 'price' ? '最便宜' : '最近'}${parsed.period ? '·' + parsed.period : ''}`;
            const nearbyResult = await searchNearbyParking(geo.lat, geo.lng, parsed.cardType, parsed.sortBy, 15, parsed.period || '');
            if (nearbyResult?.code === 0) {
              steps[2].text = `在5公里内找到${nearbyResult.data.total}个停车场${parsed.period ? '(' + parsed.period + '时段)' : ''}`;
              steps[2].status = 'done';

              // Step 4: 排序推荐
              steps.push({ icon: '📊', label: '排序推荐', text: `已按${parsed.sortBy === 'price' ? '价格最低' : '距离最近'}排序${parsed.period ? '，优先' + parsed.period : ''}`, status: 'done' });

              return {
                code: 0,
                data: {
                  steps,
                  parsed,
                  nearby: {
                    lat: geo.lat, lng: geo.lng,
                    placeName: geo.title || parsed.targetPlace,
                    list: nearbyResult.data.list,
                    total: nearbyResult.data.total,
                  },
                },
              };
            } else {
              steps[2].text = '未找到周边停车场，尝试关键词搜索';
              steps[2].status = 'error';
            }
          } else {
            steps[1].text = `无法定位"${parsed.targetPlace}"，请尝试更具体的地点名称`;
            steps[1].status = 'error';
          }
        } catch (geoErr) {
          console.log('地理定位失败:', geoErr.message);
          steps[1].text = `定位失败"${parsed.targetPlace}"，转为关键词搜索`;
          steps[1].status = 'error';
          // 降级：仍返回解析结果，让前端用关键词搜索
        }
      }

      return { code: 0, data: { steps, parsed } };
    } catch (e) {
      return { code: -1, message: e.message || 'Agent执行失败', steps: steps || [] };
    }
  }

  // ====== 智能搜索动作 ======
  if (action === 'smartSearch' && query) {
    let result;
    if (apiKey) {
      try {
        result = await aiSmartSearch(query, apiKey);
        result.source = 'ai';
      } catch (e) {
        console.log('DeepSeek解析失败，降级本地:', e.message);
        result = localSmartSearch(query, userCity);
        result.source = 'local_fallback';
      }
    } else {
      result = localSmartSearch(query, userCity);
      result.source = 'local';
    }

    // ====== 位置意图增强：needLocation=true → 地理解码 + nearby搜索 ======
    if (result.needLocation && result.targetPlace) {
      try {
        // 根据地名+区名定位，默认使用用户所在城市
        const defaultRegion = userCity || '深圳';
        const region = defaultRegion;
        const geo = await geocodePlace(result.targetPlace, region);
        if (geo && geo.lat && geo.lng) {
          // 调用 parking nearby
          const nearbyResult = await searchNearbyParking(
            geo.lat, geo.lng, result.cardType, result.sortBy, 15, result.period || ''
          );
          if (nearbyResult && nearbyResult.code === 0) {
            result.nearby = {
              lat: geo.lat,
              lng: geo.lng,
              placeName: geo.title || result.targetPlace,
              placeAddress: geo.address || '',
              list: nearbyResult.data.list,
              total: nearbyResult.data.total,
            };
            result.explanation = (geo.title || result.targetPlace) + '周边'
              + (result.cardType === 'monthly' ? '月卡' : result.cardType === 'count' ? '次卡' : '停车场')
              + (result.sortBy === 'price' ? '·按价格排序' : '·按距离排序');
          }
        }
      } catch (geoErr) {
        console.log('地理解码失败，降级为普通搜索:', geoErr.message);
        // 降级：仍然返回 keyword+distance 让前端做普通搜索
        if (!result.keyword) result.keyword = result.targetPlace;
        result.sortBy = result.sortBy || 'distance';
        result.needLocationFallback = true;
      }
    }

    return { code: 0, data: { result } };
  }

  // ====== 聊天动作 ======

  // 构建消息历史（最近5轮对话）
  const chatMessages = history.slice(-10).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }));

  // 添加当前问题
  const currentQuestion = question || (messages.length ? messages[messages.length - 1].content : '');
  if (currentQuestion) {
    chatMessages.push({ role: 'user', content: currentQuestion });
  }

  // 如果没有消息，返回欢迎语
  if (!chatMessages.length || !currentQuestion) {
    return {
      reply: '你好！我是粤停汇AI助手 🅿️\n\n我可以帮你：\n🔍 查找最便宜的停车场\n📍 按区域推荐停车方案\n💰 对比月卡/次卡价格\n⚡ 查找充电站停车优惠\n\n直接告诉我你的需求吧！',
      source: 'local'
    };
  }

  if (apiKey) {
    try {
      const reply = await callDeepSeek(chatMessages, apiKey);
      return { reply, source: 'ai' };
    } catch (err) {
      console.error('AI API调用失败:', err.message);
      // API失败时降级到本地回复
      const localR = localReply(currentQuestion);
      return { reply: localR, source: 'local', note: 'AI服务暂不可用，使用本地智能回复' };
    }
  }

  // 无API Key时使用本地规则回复
  const localR = localReply(currentQuestion);
  return { reply: localR, source: 'local', note: 'AI服务未配置，使用本地智能回复。管理员可配置DEEPSEEK_API_KEY启用AI。' };
};
