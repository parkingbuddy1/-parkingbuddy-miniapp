# 云数据库 Schema 定义

## 1. parking_lots（停车场项目）

```json
{
  "_id": "自动生成",
  "name": "科技园南区停车场",           // 项目名称
  "address": "深圳市南山区科技园南路88号",  // 项目地址
  "feeStandard": "首小时5元，之后2元/小时", // 收费标准
  "images": ["url1", "url2"],            // 项目图片数组
  "tags": ["地下停车场", "充电桩"],       // 项目标签
  "latitude": 22.5417,                  // 经度
  "longitude": 113.9526,                // 纬度
  "rating": 4.5,                        // 评分
  "totalSpaces": 500,                   // 总车位数
  "availableSpaces": 120,               // 可用车位数
  "category": "day",                    // 分类: day|night|full|weekend
  "minPrice": 480,                      // 套餐最低价（用于列表展示）
  "minOriginalPrice": 600,              // 套餐最低原价
  "packageCount": 3,                    // 套餐数量
  "packageTags": ["日间月卡", "全天月卡"],  // 套餐标签（用于列表展示）
  "badge": "热销",                      // 角标文字
  "distanceText": "距你1.2km",          // 距离文字
  "contactPhone": "0755-12345678",      // 联系电话
  "sort": 100,                          // 排序权重
  "status": "active",                   // 状态: active|inactive
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

## 2. packages（月卡套餐）

```json
{
  "_id": "自动生成",
  "parkingId": "关联的停车场_id",         // 所属停车场
  "name": "日间月卡（工作日）",            // 套餐名称
  "description": "限工作日日间使用",        // 套餐说明
  "period": "工作日 8:00-20:00",        // 套餐时限
  "limitText": "限工作日",               // 限制说明标签
  "unit": "月",                          // 计价单位
  "price": 480,                          // 现价（分）
  "originalPrice": 600,                  // 原价（分）
  "recommended": true,                   // 是否推荐
  "sort": 1,                            // 排序
  "status": "active",
  "createdAt": "Date"
}
```

## 3. orders（订单）

```json
{
  "_id": "自动生成",
  "openid": "用户openid",
  "parkingId": "停车场_id",
  "parkingName": "停车场名称",
  "packageId": "套餐_id",
  "packageName": "套餐名称",
  "quantity": 1,
  "unitPrice": 480,
  "totalPrice": 480,
  "discountAmount": 30,
  "finalPrice": 450,
  "couponId": "",
  "groupType": "",          // 3|15|""
  "status": "pending",      // pending|paid|done|cancelled
  "createTime": "Date",
  "updateTime": "Date"
}
```

## 4. users（用户）

```json
{
  "_id": "自动生成",
  "openid": "微信openid",
  "nickName": "用户昵称",
  "avatarUrl": "头像URL",
  "phone": "手机号",
  "tags": ["科技园上班", "SUV车主"],
  "homeAddress": "龙华区民治街道",
  "workAddress": "南山区科技园",
  "carType": "SUV",
  "token": "登录token",
  "lastLoginAt": "Date",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

## 5. coupons（优惠券模板）

```json
{
  "_id": "自动生成",
  "name": "新用户专享券",
  "description": "首单立减",
  "discount": 30,           // 抵扣金额（分）
  "condition": "满100可用",
  "validDays": 30,
  "totalCount": 1000,
  "usedCount": 0,
  "status": "active"
}
```

## 6. user_coupons（用户优惠券）

```json
{
  "_id": "自动生成",
  "openid": "用户openid",
  "couponId": "优惠券模板_id",
  "status": "valid",        // valid|used|expired
  "fromShare": false,
  "sharerOpenid": "",
  "expireDate": "2026-07-01",
  "createdAt": "Date"
}
```

## 7. favorites（收藏）

```json
{
  "_id": "自动生成",
  "openid": "用户openid",
  "parkingId": "停车场_id",
  "createdAt": "Date"
}
```

## 8. reviews（评价）

```json
{
  "_id": "自动生成",
  "openid": "用户openid",
  "parkingId": "停车场_id",
  "orderId": "订单_id",
  "rating": 5,
  "content": "评价内容",
  "images": ["图片url"],
  "createdAt": "Date"
}
```
