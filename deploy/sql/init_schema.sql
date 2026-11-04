-- =============================================================================
-- E-Ink NFC Photo Frame - PostgreSQL 16 初始化建表脚本 (DDL)
-- 说明：Go 后端启动时会通过 GORM AutoMigrate 自动同步此表结构与初始数据；
--       本脚本亦可用于手动建表、Navicat/DBeaver 导入或生产环境 DBA 审计。
-- =============================================================================

-- 1. 用户表 (users)
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    phone VARCHAR(32) NOT NULL UNIQUE,
    nickname VARCHAR(64) DEFAULT '',
    avatar_url VARCHAR(255) DEFAULT '',
    status VARCHAR(16) DEFAULT 'active',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
COMMENT ON TABLE users IS '终端用户主表';
COMMENT ON COLUMN users.phone IS '手机号（唯一登录标识）';
COMMENT ON COLUMN users.status IS '账户状态: active / disabled / deleted';

-- 2. 短信验证码审计与防刷表 (sms_verification_codes)
CREATE TABLE IF NOT EXISTS sms_verification_codes (
    id BIGSERIAL PRIMARY KEY,
    phone VARCHAR(32) NOT NULL,
    code VARCHAR(16) NOT NULL,
    purpose VARCHAR(32) DEFAULT 'login',
    status VARCHAR(16) DEFAULT 'pending',
    ip VARCHAR(64) DEFAULT '',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_codes_phone ON sms_verification_codes(phone);
CREATE INDEX IF NOT EXISTS idx_sms_codes_expires ON sms_verification_codes(expires_at);
COMMENT ON TABLE sms_verification_codes IS '短信验证码发放与核验审计表';

-- 3. 用户上传与创作历史照片作品表 (artworks)
CREATE TABLE IF NOT EXISTS artworks (
    id VARCHAR(64) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title VARCHAR(128) NOT NULL DEFAULT 'Untitled',
    subtitle VARCHAR(128) DEFAULT '',
    original_image_url TEXT DEFAULT '',
    rendered_preview_url TEXT DEFAULT '',
    bitmap_base64 TEXT DEFAULT '',
    bitmap_hash VARCHAR(64) DEFAULT '',
    bitmap_size INT DEFAULT 30000,
    filter_id VARCHAR(64) DEFAULT '',
    frame_id VARCHAR(64) DEFAULT 'polaroid',
    dither_method VARCHAR(32) DEFAULT 'atkinson',
    params_json TEXT DEFAULT '{}',
    target_device_id VARCHAR(64) DEFAULT '',
    flashed_count INT DEFAULT 0,
    last_flashed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_artworks_user_id ON artworks(user_id);
CREATE INDEX IF NOT EXISTS idx_artworks_created_at ON artworks(created_at DESC);
COMMENT ON TABLE artworks IS '用户上传照片与墨水屏暗室创作历史表';
COMMENT ON COLUMN artworks.params_json IS '暗室全量编辑参数快照(旋转/缩放/平移/6大影调滑块JSON)';
COMMENT ON COLUMN artworks.bitmap_base64 IS '400x300 四色 2-bit 封包二进制 Base64 (30,000 Bytes)';

-- 4. 胶片与色彩滤镜预设表 (filter_presets)
CREATE TABLE IF NOT EXISTS filter_presets (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    category VARCHAR(32) DEFAULT 'film',
    description VARCHAR(255) DEFAULT '',
    tag VARCHAR(32) DEFAULT '',
    cover_color VARCHAR(32) DEFAULT '',
    cube_file VARCHAR(128) DEFAULT '',
    params_json TEXT DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_filter_presets_category ON filter_presets(category);

-- 5. 相框画框模板表 (frame_templates)
CREATE TABLE IF NOT EXISTS frame_templates (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    aspect VARCHAR(16) DEFAULT '4:3',
    border_top INT DEFAULT 0,
    border_bottom INT DEFAULT 0,
    border_left INT DEFAULT 0,
    border_right INT DEFAULT 0,
    has_subtitle BOOLEAN DEFAULT FALSE,
    default_subtitle VARCHAR(64) DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. 墨水屏硬件规格配置表 (display_profiles)
CREATE TABLE IF NOT EXISTS display_profiles (
    id VARCHAR(64) PRIMARY KEY,
    vendor_id VARCHAR(64) DEFAULT '',
    adapter_id VARCHAR(64) DEFAULT '',
    width INT DEFAULT 400,
    height INT DEFAULT 300,
    palette_json TEXT DEFAULT '[]',
    pack_format_json TEXT DEFAULT '{}',
    max_chunk INT DEFAULT 240,
    refresh_timeout_sec INT DEFAULT 30,
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. 设备生产批次表 (device_batches)
CREATE TABLE IF NOT EXISTS device_batches (
    id BIGSERIAL PRIMARY KEY,
    batch_no VARCHAR(64) UNIQUE,
    vendor_id VARCHAR(64) DEFAULT '',
    profile_id VARCHAR(64) DEFAULT '',
    quantity INT DEFAULT 0,
    remark VARCHAR(255) DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. 墨水屏设备白名单与绑定状态表 (devices)
CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    uid_hmac VARCHAR(64) NOT NULL UNIQUE,
    uid_last4 VARCHAR(8) DEFAULT '',
    batch_id BIGINT DEFAULT 0,
    profile_id VARCHAR(64) DEFAULT '',
    status VARCHAR(16) DEFAULT 'in_stock',
    owner_user_id BIGINT DEFAULT 0,
    nickname VARCHAR(64) DEFAULT '',
    location VARCHAR(64) DEFAULT '',
    activation_code VARCHAR(16) DEFAULT '',
    bound_at TIMESTAMPTZ,
    last_flashed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devices_owner_user_id ON devices(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);

-- 9. 设备绑定/解绑审计事件表 (device_binding_events)
CREATE TABLE IF NOT EXISTS device_binding_events (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    user_id BIGINT DEFAULT 0,
    action VARCHAR(32) NOT NULL,
    operator VARCHAR(64) DEFAULT 'user',
    ip VARCHAR(64) DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_binding_events_device_id ON device_binding_events(device_id);
CREATE INDEX IF NOT EXISTS idx_binding_events_user_id ON device_binding_events(user_id);

-- 10. NFC 刷图硬件遥测日志表 (flash_logs)
CREATE TABLE IF NOT EXISTS flash_logs (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(64) DEFAULT '',
    user_id BIGINT DEFAULT 0,
    result VARCHAR(16) DEFAULT 'success',
    failed_step VARCHAR(32) DEFAULT '',
    error_code VARCHAR(32) DEFAULT '',
    duration_ms INT DEFAULT 0,
    chunks INT DEFAULT 0,
    platform VARCHAR(16) DEFAULT '',
    phone_model VARCHAR(64) DEFAULT '',
    os_version VARCHAR(32) DEFAULT '',
    app_version VARCHAR(32) DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flash_logs_device_id ON flash_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_flash_logs_user_id ON flash_logs(user_id);

-- 11. 全局动态配置表 (app_configs)
CREATE TABLE IF NOT EXISTS app_configs (
    key VARCHAR(64) PRIMARY KEY,
    value_json TEXT DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
