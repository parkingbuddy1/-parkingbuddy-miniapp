# 粤停汇数据库 Schema 扩展 V1.0
> 在 V1 基础上扩展 6 个集合，支撑物业端/保安端/风控体系
> 日期：2026-06-29

---

## 9. properties（物业/业委会档案）

```json
{
  "_id": "自动生成",
  "userId": 10001,                              // 关联 user_id（自增）
  "openid": "oXyz123abc",                       // 物业管理员 openid
  "name": "万科物业-科技园管理处",
  "type": "property",                           // property|committee
  "contactName": "张经理",
  "contactPhone": "13800138000",
  "contactWechat": "wxid_xxx",
  "managedLots": ["lot_001", "lot_002"],        // 管理的停车场 _id 列表
  "profitShareRule": {
    "base": 0.7,                                 // 物业基础比例
    "platform": 0.3,                             // 平台比例
    "overtimeRatio": 0.5                         // 超时部分五五开
  },
  "guaranteedIncome": 50000,                     // 保底收入（分）
  "contractStart": "2026-01-01",
  "contractEnd": "2027-12-31",
  "status": "active",                            // active|paused|terminated
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

**索引建议**：
- openid (唯一)
- type + status (查询某类物业)
- managedLots (数组索引)

---

## 10. reservations（预约与停车记录，**核心表**）

```json
{
  "_id": "自动生成",
  "orderId": "关联订单_id",
  "openid": "车主 openid",
  "parkingId": "停车场 _id",
  "licensePlate": "粤BXXXXX",
  "carType": "新能源|燃油",

  "packageType": "temp|day_card|month_card|visitor",
  "packageName": "10元/2小时临停",
  "validFrom": "Date",                          // 预约生效时间
  "validTo": "Date",                            // 预约失效时间
  "enterTime": null,                            // 实际入场
  "exitTime": null,                             // 实际离场

  "passengerCount": 1,                          // 同乘人数
  "passengerDeclared": false,                   // 是否已报备

  "gpsTrack": [{                                // GPS 轨迹
    "time": "Date", "lng": 113.95, "lat": 22.54
  }],

  "creditScoreAtEntry": 100,                    // 入场时信用分
  "creditScoreAtExit": 100,                     // 离场时信用分
  "creditChanges": [{                           // 信用分变更
    "reason": "超时30分钟", "delta": -5, "time": "Date"
  }],

  "violations": ["YTH-021", "YTH-036"],
  "violationImages": ["url1", "url2"],

  "overtimeFee": 0,                             // 超时费用（分）
  "totalFee": 1000,                             // 总费用（分）

  "status": "pending|active|completed|expired|overtime|retained",
  "riskLevel": "green|yellow|red",              // AI 风险等级

  "verifiedBy": "保安 openid",
  "verifyTime": "Date",

  "createdAt": "Date",
  "updatedAt": "Date"
}
```

**索引建议**：
- openid + status (我的预约)
- parkingId + status (车场实时查询)
- status + riskLevel (物业预警)
- validTo (超时扫描)

---

## 11. credit_archives（信用档案，**YTHPCS V3.0 标准**）

```json
{
  "_id": "自动生成",
  "openid": "车主 openid（唯一）",
  "licensePlate": "粤BXXXXX",

  "baseScore": 100,                              // 基础分（PPT 风格）/ 500（V3.0 风格）
  "currentScore": 100,                           // 当前信用分
  "level": "AAA|AA|A|B|C|D|E",                  // 信用等级（6 级）
  "levelUpdatedAt": "Date",

  "scoreFormula": {                              // V3.0 计算公式
    "baseScore": 100,
    "positiveSum": 0,
    "negativeSum": 0,
    "bonus": 0,
    "penalty": 0
  },

  "positiveHistory": [{                          // 加分历史
    "ruleId": "POS-001",
    "ruleName": "规范停车",
    "delta": 5,
    "weight": 1.0,
    "time": "Date"
  }],

  "negativeHistory": [{                          // 扣分历史（带衰减）
    "ruleId": "YTH-021",
    "ruleName": "超15分钟",
    "delta": -5,
    "originalDelta": -5,
    "decayedDelta": -3.2,                        // 衰减后
    "decayLambda": 0.005,
    "daysPassed": 120,
    "time": "Date"
  }],

  "blacklistStatus": "none|month|3month|halfyear|permanent",
  "blacklistAddedAt": null,
  "blacklistReason": "",

  "whitelistStatus": "none|owner|medical|teacher|enterprise_vip",

  "recoveryRecords": [{
    "condition": "30天无违规",
    "delta": 5,
    "time": "Date"
  }],

  "ratingFactors": {                             // V3.0 七大因子
    "履约行为分": 0,
    "文明停车分": 0,
    "按时支付分": 0,
    "活跃度分": 0,
    "社区贡献分": 0,
    "信用龄分": 0,
    "评价分": 0
  },

  "createdAt": "Date",
  "updatedAt": "Date"
}
```

**索引建议**：
- openid (唯一)
- currentScore (排序)
- level (筛选)

---

## 12. parking_configs（车场实时配置，**物业端核心**）

> 以 parking_id 作为主键（_id 复用 parking_lots._id）

```json
{
  "_id": "parking_lot_id",                      // 复用停车场 _id

  "sharedEnabled": true,                         // 总开关（一键关闭）
  "sharedTimeRanges": [{                         // 共享时段
    "start": "08:00", "end": "18:30",
    "weekdays": [1,2,3,4,5]
  }],

  "availableSpaces": {                            // 实时可预约数
    "temp": 30,
    "dayCard": 50,
    "monthCard": 0,
    "visitor": 10
  },

  "creditThreshold": {                            // 准入信用分
    "default": 70,
    "high": 90,
    "normal": 70
  },

  "packagePricing": {                              // 定价
    "tempPackages": [
      {"duration": 2, "price": 1000, "original": 1200},
      {"duration": 3, "price": 1200},
      {"duration": 4, "price": 1500},
      {"duration": 6, "price": 1800},
      {"duration": 8, "price": 2000}
    ],
    "dayCardMonthly": 30000,
    "overtimeRules": {
      "temp": {"insideHours": 300, "outsideHours": 500},
      "monthCard": 300,
      "visitor": 0
    }
  },

  "vehicleTypeFilter": {
    "allowNewEnergy": true,
    "allowFuel": true,
    "allowLargeVehicle": false
  },

  "retainedPolicy": {                              // 滞留处置
    "warnTimes": [
      {"at": 30, "action": "sms", "label": "剩余30分钟短信提醒"},
      {"at": 10, "action": "phone", "label": "剩余10分钟客服电话"},
      {"at": 0, "action": "fee", "label": "时间已到开始计费"},
      {"at": -1440, "action": "phone", "label": "24小时物业电话"},
      {"at": -2880, "action": "phone", "label": "48小时物业电话"},
      {"at": -4320, "action": "tow", "label": "72小时报警拖车"}
    ],
    "towEnabled": true
  },

  "aiDevices": [
    {"deviceId": "cam-001", "type": "lpr", "location": "入口"},
    {"deviceId": "cam-002", "type": "behavior", "location": "B1-A区"}
  ],

  "passengerCheckMode": "guard",                 // guard|ai|radio

  "propertyId": "物业 _id",                      // 关联物业

  "updatedBy": "物业 openid",
  "updatedAt": "Date"
}
```

---

## 13. violation_reports（违规上报记录）

```json
{
  "_id": "自动生成",
  "reservationId": "预约 _id",
  "openid": "被举报车主 openid",
  "parkingId": "停车场 _id",

  "reporterType": "guard|owner|ai|camera",       // 上报人类型
  "reporterId": "上报人 openid",
  "reporterName": "李保安",

  "violationType": "YTH-021",                     // 引用 Excel 规则编号
  "violationName": "超15分钟",
  "violationSeverity": "minor|moderate|severe",

  "images": ["url1", "url2", "url3"],
  "videoUrl": "",
  "description": "在 B1-A12 车位停留超 30 分钟",

  "creditDelta": -5,                              // 扣分
  "feeDelta": 0,                                  // 罚款（分）

  "appealStatus": "none|appealing|approved|rejected",
  "appealReason": "",
  "appealResult": "",

  "status": "pending|confirmed|cancelled",
  "handledBy": "审核人 openid",
  "handledAt": "Date",

  "createdAt": "Date"
}
```

---

## 14. profit_settlements（分润结算记录，**B 端核心**）

```json
{
  "_id": "自动生成",
  "parkingId": "停车场 _id",
  "propertyId": "物业 _id",
  "cycle": "2026-06",                              // 结算周期 YYYY-MM

  "incomeDetail": {
    "tempIncome": 120000,
    "dayCardIncome": 360000,
    "visitorIncome": 50000,
    "overtimeIncome": 30000,
    "totalIncome": 560000
  },

  "platformIncome": 168000,                        // 平台分得
  "propertyIncome": 392000,                        // 物业分得

  "guaranteedIncome": 50000,                       // 保底
  "actualPropertyIncome": 392000,                  // 实际物业所得
  "shortfall": 0,                                  // 平台补足
  "platformSubsidy": 0,

  "status": "calculating|confirmed|paid",
  "confirmedBy": "物业 openid",
  "confirmedAt": "Date",
  "paidAt": "Date",

  "createdAt": "Date"
}
```

---

## 📊 14 个集合总览

| # | 集合 | 来源 | 角色 |
|---|------|------|------|
| 1 | parking_lots | V1 已有 | 公共 |
| 2 | packages | V1 已有 | 公共 |
| 3 | orders | V1 已有 | 公共 |
| 4 | users | V1 已有 | 公共 |
| 5 | coupons | V1 已有 | 公共 |
| 6 | user_coupons | V1 已有 | 公共 |
| 7 | favorites | V1 已有 | 公共 |
| 8 | reviews | V1 已有 | 公共 |
| 9 | **properties** | 🆕 V1.0 | 物业 |
| 10 | **reservations** | 🆕 V1.0 | 公共（核心） |
| 11 | **credit_archives** | 🆕 V1.0 | 风控 |
| 12 | **parking_configs** | 🆕 V1.0 | 物业 |
| 13 | **violation_reports** | 🆕 V1.0 | 风控+保安 |
| 14 | **profit_settlements** | 🆕 V1.0 | 物业+平台 |
