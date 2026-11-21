# ==============================================================================
# EinkFrame 全栈多阶段构建 Dockerfile (Go API + iOS 前端暗室工作台)
# 支持平台: DigitalOcean App Platform / Azure / Render / Railway / Zeabur / K8s
# ==============================================================================

# Stage 1: 编译 Go 后端 (启用 CGO 以同时兼容 SQLite 与 PostgreSQL 驱动)
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /build/server

# 优先缓存 Go Modules
COPY server/go.mod server/go.sum ./
RUN go mod download

# 拷贝后端源码并编译生产二进制
COPY server/ ./
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o /build/eink-api ./cmd/api/main.go

# Stage 2: 极简运行时镜像 (~30MB)
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata sqlite-libs \
    && mkdir -p /app/uploads /app/frontend

WORKDIR /app

# 1. 拷贝编译好的 Go 后端二进制
COPY --from=builder /build/eink-api /app/eink-api

# 2. 拷贝前端静态资源 (由 Go 后端直接同源托管，零跨域烦恼)
COPY frontend/ /app/frontend/

# 默认环境变量 (可在云平台控制台覆盖为 DB_DRIVER=postgres 及 DB_DSN / DATABASE_URL)
ENV GIN_MODE=release \
    PORT=8080 \
    DB_DRIVER=sqlite \
    DB_DSN=/app/uploads/eink.db

EXPOSE 8080

CMD ["/app/eink-api"]

