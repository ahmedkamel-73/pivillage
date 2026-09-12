PRAGMA foreign_keys = ON;

-- Sessions - FIX 14,31,2,3,14
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pi_access_token_hash TEXT NOT NULL UNIQUE, -- FIX 2: hashed, FIX 14: UNIQUE
  pi_access_token_last4 TEXT NOT NULL,
  pi_uid TEXT NOT NULL,
  ip_address TEXT,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash_unique ON sessions(pi_access_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(pi_uid);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  pi_uid TEXT UNIQUE NOT NULL,
  pi_username TEXT NOT NULL,
  wallet_address TEXT,
  display_name TEXT,
  role TEXT DEFAULT 'pioneer' CHECK(role IN ('pioneer','moderator','admin')),
  is_verified BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- FIX 9,16: moderators with section restriction
CREATE TABLE IF NOT EXISTS moderators (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id TEXT REFERENCES sections(id),
  can_resolve_all BOOLEAN DEFAULT FALSE,
  assigned_by TEXT REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, section_id)
);
CREATE INDEX IF NOT EXISTS idx_moderators_user ON moderators(user_id);
CREATE INDEX IF NOT EXISTS idx_moderators_section ON moderators(section_id);

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL CHECK(slug GLOB '*[a-z0-9-]*'),
  created_by TEXT REFERENCES users(id),
  shops_count INTEGER DEFAULT 0 CHECK(shops_count >=0),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  section_id TEXT REFERENCES sections(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  hidden_reason TEXT,
  hidden_at DATETIME,
  hidden_by TEXT REFERENCES users(id),
  rating REAL DEFAULT 0 CHECK(rating >=0 AND rating <=5),
  sales_count INTEGER DEFAULT 0 CHECK(sales_count >=0),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_shops_section ON shops(section_id);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_pi REAL NOT NULL CHECK(price_pi >0),
  images TEXT CHECK(json_valid(images)),
  stock INTEGER DEFAULT 0 CHECK(stock >=0),
  is_digital BOOLEAN DEFAULT FALSE,
  delivery_type TEXT DEFAULT 'agreement' CHECK(delivery_type IN ('agreement','shipping','pickup','digital')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);

-- Orders - FIX 32: dispute_id FK, FIX 24: auto_release handling
CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  raised_by TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  evidence TEXT CHECK(json_valid(evidence)),
  status TEXT DEFAULT 'open' CHECK(status IN ('open','under_review','resolved_buyer','resolved_seller','resolved_split')),
  resolution TEXT,
  resolution_reason TEXT,
  split_seller_percent INTEGER CHECK(split_seller_percent BETWEEN 0 AND 100),
  resolved_by TEXT REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_disputes_order ON disputes(order_id);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES users(id),
  shop_id TEXT NOT NULL REFERENCES shops(id),
  total_pi REAL NOT NULL CHECK(total_pi >0),
  pi_payment_id TEXT UNIQUE,
  pi_txid TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','shipped','delivered','completed','disputed','refunded','cancelled','auto_released')),
  buyer_confirmed BOOLEAN DEFAULT FALSE,
  seller_delivered BOOLEAN DEFAULT FALSE,
  disputed BOOLEAN DEFAULT FALSE,
  dispute_id TEXT REFERENCES disputes(id),
  tracking_number TEXT,
  delivery_proof TEXT,
  delivered_at DATETIME,
  auto_release_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_pi_payment ON orders(pi_payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_auto ON orders(auto_release_at) WHERE status='delivered' AND disputed=FALSE;

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK(quantity >0),
  price_pi REAL NOT NULL CHECK(price_pi >0)
);

CREATE TABLE IF NOT EXISTS escrow_transactions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  amount_pi REAL NOT NULL CHECK(amount_pi >0),
  pi_payment_id TEXT UNIQUE,
  status TEXT DEFAULT 'held' CHECK(status IN ('held','released','refunded','disputed','split')),
  buyer_approved BOOLEAN DEFAULT FALSE,
  seller_approved BOOLEAN DEFAULT FALSE,
  buyer_amount REAL CHECK(buyer_amount >=0),
  seller_amount REAL CHECK(seller_amount >=0),
  released_at DATETIME,
  auto_release_after DATETIME,
  last_action_by TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_escrow_auto ON escrow_transactions(auto_release_after) WHERE status='held';

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id, product_id)
);

CREATE TABLE IF NOT EXISTS billboards (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  type TEXT DEFAULT 'normal' CHECK(type IN ('normal','3d','sponsored')),
  price_per_day REAL DEFAULT 0.1 CHECK(price_per_day >0),
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL CHECK(ends_at > starts_at),
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS billboard_stats (
  id TEXT PRIMARY KEY,
  billboard_id TEXT NOT NULL REFERENCES billboards(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  views INTEGER DEFAULT 0 CHECK(views >=0),
  clicks INTEGER DEFAULT 0 CHECK(clicks >=0),
  UNIQUE(billboard_id, date)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id), -- NULL allowed only for system/cron - FIX 34 documented
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  ip_address TEXT, -- FIX 19
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  window_start DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_key ON rate_limits(key, window_start);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR REPLACE INTO platform_settings VALUES ('version','2.6-production'),('commission','0%'),('security','45-fixed');