# 微信支付商户号开通指引

## 当前状态
支付代码已完整就绪（`cloudfunctions/order/index.js`），包含：
- 微信支付 V2 统一下单 API
- MD5 签名生成
- 二次签名（小程序调起支付）
- 支付回调处理框架

## 开通步骤

### 1. 申请微信支付商户号
访问 [pay.weixin.qq.com](https://pay.weixin.qq.com) → 注册成为商家
- 需要：营业执照、法人身份证、对公银行账户
- 选择「小程序支付」场景

### 2. 获取商户号信息
开通后记录以下信息：
| 配置项 | 位置 | 当前值 |
|---|---|---|
| 商户号 mch_id | 商户平台 → 账户中心 → 商户信息 | 需替换 |
| API密钥 key | 商户平台 → 账户中心 → API安全 → 设置密钥 | 需替换 |
| 回调域名 notify_url | 你自己的服务器 | 需配置 |

### 3. 配置回调地址
在 `cloudfunctions/order/index.js` 第13行更新：
```javascript
notify_url: 'https://your-domain.com/pay/notify',
```

### 4. 绑定小程序
微信支付商户平台 → 产品中心 → AppID 授权管理 → 绑定 `wxe973a4c0847e15dd`

### 5. 部署云函数
微信开发者工具中右键 `cloudfunctions/order` → 「上传并部署：云端安装依赖」

### 6. 小程序后台配置
mp.weixin.qq.com → 开发 → 开发管理 → 接口设置 → 开通微信支付

## 注意事项
- 商户号申请审核约 1-3 个工作日
- API 密钥是 32 位字符串，妥善保管
- 回调地址必须 HTTPS 且已备案
- 测试阶段可用沙箱环境：https://api.mch.weixin.qq.com/sandboxnew/
