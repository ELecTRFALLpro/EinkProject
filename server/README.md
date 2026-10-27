# 墨水屏 NFC 相框后端服务 (Go + Gin)

基于 Go 1.24+、Gin、GORM 构建的高性能无状态后端，核心负责：
1. **设备白名单与批次管理**（入库登记、UID 掩码哈希存储、防伪防蹭）
2. **账号绑定与离线凭证签发**（基于 Ed25519 签名，支持 App 客户端离线 30 天贴卡验签）
3. **屏幕与供应商配置动态下发**（DisplayProfile、调色板、单包大小、功能开关）
4. **用户鉴权**（手机短信验证码登录、JWT）
5. **刷图遥测与审计日志**（耗时、包数、成功率指标采集）

---

## 目录结构

```
server/
├── cmd/
│   └── api/
│       └── main.go               # 服务启动入口
├── internal/
│   ├── config/                   # 环境配置读取与默认值
│   ├── handler/                  # HTTP 接口处理函数
│   ├── middleware/               # 鉴权 (JWT)、CORS、错误恢复中间件
│   ├── model/                    # 数据表结构定义 (GORM)
│   └── service/                  # 业务逻辑层（白名单、凭证签发、鉴权、配置）
├── pkg/
│   ├── crypto/                   # Ed25519 签名、UID 规范化、HMAC、激活码
│   └── response/                 # 统一 API JSON 响应封装
└── test/
    └── api_e2e_test.go           # 全链路端到端自动化测试
```

---

## 快速启动

### 1. 本地启动（默认 SQLite 0 配置）
```bash
cd server
go run cmd/api/main.go
```
服务将在 `http://localhost:8080` 启动，并在本地自动创建 `eink.db` 数据库及表结构。

### 2. 切换为 PostgreSQL 生产环境
通过环境变量指定驱动与连接串：
```bash
export DB_DRIVER=postgres
export DB_DSN="postgres://username:password@localhost:5432/eink?sslmode=disable"
export JWT_SECRET="your_production_jwt_secret"
export HMAC_SECRET="your_production_hmac_secret"
go run cmd/api/main.go
```

### 3. 执行全链路自动化测试
```bash
cd server
go test -v ./test/...
```

---

## 核心接口清单

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| `GET` | `/health` | 无 | 服务健康检查 |
| `GET` | `/v1/config` | 无 | 获取屏幕规格、Ed25519 公钥及调色板配置 |
| `POST` | `/v1/auth/sms/send` | 无 | 发送登录验证码（开发环境下默认 `888888`） |
| `POST` | `/v1/auth/sms/login` | 无 | 验证码登录并获取 JWT Token |
| `POST` | `/tool/v1/devices/register` | 工具 | 入库工具登记单个板子 UID 到白名单 |
| `POST` | `/admin/v1/devices/batch` | 管理员 | 批量导入 UID 白名单列表 |
| `GET` | `/v1/auth/me` | Bearer | 获取当前用户身份 |
| `POST` | `/v1/devices/activate` | Bearer | 贴卡激活绑定设备（非白名单拒绝，签发离线 Ticket） |
| `GET` | `/v1/devices` | Bearer | 获取当前用户已绑定的设备列表 |
| `DELETE`| `/v1/devices/:id/binding` | Bearer | 解绑设备 |
| `POST` | `/v1/devices/:id/tickets/refresh` | Bearer | 续期设备离线 Ticket |
| `POST` | `/v1/telemetry/flash` | Bearer | 上报刷图结果与耗时指标 |
