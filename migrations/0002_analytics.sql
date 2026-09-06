CREATE TABLE IF NOT EXISTS analytics_visitors (
  ip_address TEXT PRIMARY KEY,
  country TEXT NOT NULL DEFAULT '',
  region_name TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  views INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_analytics_visitors_last ON analytics_visitors(last_seen DESC);

CREATE TABLE IF NOT EXISTS analytics_daily (
  visit_date TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS analytics_uniques (
  visit_date TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  PRIMARY KEY(visit_date, ip_address)
);
