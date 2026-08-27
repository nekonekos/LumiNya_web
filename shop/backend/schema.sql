-- ============================================================
-- LumiNya Shop · D1 数据库结构
-- 金额单位统一为「分」（INTEGER），避免浮点误差。
-- 时间戳统一为 Unix 秒。
-- ============================================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt          TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
    display_name  TEXT NOT NULL DEFAULT '',
    disabled      INTEGER NOT NULL DEFAULT 0,      -- 0/1
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

-- 商品分类
CREATE TABLE IF NOT EXISTS categories (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    sort       INTEGER NOT NULL DEFAULT 0,
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
);

-- 运费模板
CREATE TABLE IF NOT EXISTS shipping_templates (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    base_fee       INTEGER NOT NULL DEFAULT 0,   -- 基础运费（分）
    free_threshold INTEGER NOT NULL DEFAULT 0,   -- 满多少包邮（分），0 表示从不包邮
    created_at     INTEGER NOT NULL
);

-- 商品
CREATE TABLE IF NOT EXISTS products (
    id                   TEXT PRIMARY KEY,
    category_id          TEXT,
    title                TEXT NOT NULL,
    slug                 TEXT NOT NULL UNIQUE,
    summary              TEXT NOT NULL DEFAULT '',
    description          TEXT NOT NULL DEFAULT '',
    images               TEXT NOT NULL DEFAULT '[]',        -- JSON 数组（图片 URL）
    type                 TEXT NOT NULL DEFAULT 'virtual',   -- 'virtual' | 'physical'
    price                INTEGER NOT NULL DEFAULT 0,        -- 基础价格（分）
    status               TEXT NOT NULL DEFAULT 'draft',     -- 'draft' | 'on' | 'off'
    stock                INTEGER NOT NULL DEFAULT 0,        -- 无 SKU 时的库存
    resource_url         TEXT NOT NULL DEFAULT '',          -- 虚拟商品资源/下载链接
    shipping_template_id TEXT,
    sold                 INTEGER NOT NULL DEFAULT 0,
    created_at           INTEGER NOT NULL,
    updated_at           INTEGER NOT NULL
);

-- 商品规格 / SKU
CREATE TABLE IF NOT EXISTS product_variants (
    id         TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    name       TEXT NOT NULL DEFAULT '',    -- 例如「红色 / 大号」
    sku        TEXT NOT NULL DEFAULT '',
    price      INTEGER NOT NULL DEFAULT 0,  -- 覆盖价格（分）
    stock      INTEGER NOT NULL DEFAULT 0,
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
);

-- 订单
CREATE TABLE IF NOT EXISTS orders (
    id            TEXT PRIMARY KEY,
    order_no      TEXT NOT NULL UNIQUE,     -- 例如 LN20260825xxxxxxxx
    user_id       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
                    -- pending 待支付 | paid 已支付 | shipped 已发货
                    -- completed 已完成 | cancelled 已取消 | expired 已过期
    items_json    TEXT NOT NULL,            -- 下单快照 JSON
    subtotal      INTEGER NOT NULL DEFAULT 0,  -- 商品小计（分）
    shipping_fee  INTEGER NOT NULL DEFAULT 0,  -- 运费（分）
    total         INTEGER NOT NULL DEFAULT 0,  -- 合计（分）
    remark        TEXT NOT NULL DEFAULT '',
    address_json  TEXT NOT NULL DEFAULT '{}',  -- 收货地址（实物）
    pay_channel   TEXT NOT NULL DEFAULT '',    -- 'alipay'
    pay_ref       TEXT NOT NULL DEFAULT '',    -- 支付流水号占位
    paid_at       INTEGER,
    -- 实物发货
    tracking_company TEXT NOT NULL DEFAULT '', -- 快递公司
    tracking_no   TEXT NOT NULL DEFAULT '',    -- 快递单号
    shipped_at    INTEGER,                     -- 发货时间
    -- 人工售后
    after_sale_status    TEXT NOT NULL DEFAULT '', -- '' | applied 申请中 | processing 处理中 | resolved 已解决 | closed 已关闭
    after_sale_reason    TEXT NOT NULL DEFAULT '',
    after_sale_contact   TEXT NOT NULL DEFAULT '',
    after_sale_note      TEXT NOT NULL DEFAULT '', -- 后台处理备注
    after_sale_created_at INTEGER,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

-- 订单明细
CREATE TABLE IF NOT EXISTS order_items (
    id         TEXT PRIMARY KEY,
    order_id   TEXT NOT NULL,
    product_id TEXT NOT NULL,
    variant_id TEXT,
    title      TEXT NOT NULL,
    sku_name   TEXT NOT NULL DEFAULT '',
    type       TEXT NOT NULL DEFAULT 'virtual', -- 'virtual' | 'physical'（下单时商品类型快照）
    qty        INTEGER NOT NULL,
    unit_price INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

-- 订单发货记录（虚拟商品发放的激活码 / 资源链接）
CREATE TABLE IF NOT EXISTS order_codes (
    id            TEXT PRIMARY KEY,
    order_id      TEXT NOT NULL,
    order_item_id TEXT NOT NULL,
    product_id    TEXT NOT NULL,
    code          TEXT NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'activation', -- 'activation' | 'resource'
    created_at    INTEGER NOT NULL
);

-- 激活码池
CREATE TABLE IF NOT EXISTS activation_codes (
    id            TEXT PRIMARY KEY,
    product_id    TEXT NOT NULL,
    code          TEXT NOT NULL,
    used          INTEGER NOT NULL DEFAULT 0,
    used_order_id TEXT,
    used_at       INTEGER,
    created_at    INTEGER NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_orders_user          ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders (status);
CREATE INDEX IF NOT EXISTS idx_products_category    ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_status      ON products (status);
CREATE INDEX IF NOT EXISTS idx_variants_product     ON product_variants (product_id);
CREATE INDEX IF NOT EXISTS idx_items_order          ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_codes_product_used   ON activation_codes (product_id, used);
CREATE INDEX IF NOT EXISTS idx_ordercodes_order     ON order_codes (order_id);

-- ============================================================
-- 存量数据库升级（仅对已创建过的旧库执行一次，全新库无需执行）
-- ============================================================
-- ALTER TABLE orders ADD COLUMN tracking_company TEXT NOT NULL DEFAULT '';
-- ALTER TABLE orders ADD COLUMN tracking_no TEXT NOT NULL DEFAULT '';
-- ALTER TABLE orders ADD COLUMN shipped_at INTEGER;
-- ALTER TABLE orders ADD COLUMN after_sale_status TEXT NOT NULL DEFAULT '';
-- ALTER TABLE orders ADD COLUMN after_sale_reason TEXT NOT NULL DEFAULT '';
-- ALTER TABLE orders ADD COLUMN after_sale_contact TEXT NOT NULL DEFAULT '';
-- ALTER TABLE orders ADD COLUMN after_sale_note TEXT NOT NULL DEFAULT '';
-- ALTER TABLE orders ADD COLUMN after_sale_created_at INTEGER;
-- ALTER TABLE order_items ADD COLUMN type TEXT NOT NULL DEFAULT 'virtual';
