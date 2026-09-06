PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS content_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lottery_type INTEGER NOT NULL DEFAULT 5,
  section_key TEXT NOT NULL,
  period INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{}',
  result_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','win','lose')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_content_section_period ON content_items(section_key, period DESC, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_content_type_section_period ON content_items(lottery_type,section_key,period DESC,sort_order,id);

CREATE TABLE IF NOT EXISTS masters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  avatar TEXT NOT NULL DEFAULT '',
  rank_no INTEGER NOT NULL DEFAULT 99,
  specialty TEXT NOT NULL DEFAULT '',
  lottery_scope INTEGER NOT NULL DEFAULT 0,
  replaces_master_id INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_masters_rank ON masters(enabled, rank_no, id);

CREATE TABLE IF NOT EXISTS master_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lottery_type INTEGER NOT NULL DEFAULT 5,
  master_id INTEGER NOT NULL,
  period INTEGER NOT NULL,
  content_json TEXT NOT NULL DEFAULT '{}',
  result_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','win','lose')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lottery_type, master_id, period),
  FOREIGN KEY(master_id) REFERENCES masters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_key TEXT NOT NULL UNIQUE,
  image_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  display_mode TEXT NOT NULL DEFAULT 'always',
  delay_seconds INTEGER NOT NULL DEFAULT 1,
  start_at TEXT,
  end_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ad_stats (
  position_key TEXT PRIMARY KEY,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recommended_sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  site_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_recommended_sites_sort ON recommended_sites(enabled,sort_order,id);

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS automation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_key TEXT NOT NULL DEFAULT 'result_check',
  period INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  checked_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_started ON automation_runs(started_at DESC);

INSERT OR IGNORE INTO site_settings(setting_key,setting_value) VALUES
  ('site_name','123六合网'),
  ('site_domain','123LH.COM'),
  ('site_slogan','打造良心六合，坚持永久免费');

INSERT OR IGNORE INTO masters(name,avatar,rank_no,specialty) VALUES
  ('阿明','阿',1,'八码中特'),('老陈','老',2,'四尾中特'),('小林','小',3,'五肖中特'),('阿杰','阿',4,'六肖中特'),('大勇','大',5,'四肖中特'),
  ('老周','老',6,'吉凶中特'),('阿强','阿',7,'七尾中特'),('小梁','小',8,'绝杀三肖'),('阿峰','阿',9,'平特一肖'),('老吴','老',10,'双波中特'),
  ('阿辉','阿',11,'家畜野兽'),('小郑','小',12,'必中大小'),('大鹏','大',13,'六肖中特'),('老许','老',14,'单双中特'),('阿海','阿',15,'天地中特'),
  ('小罗','小',16,'平特一尾'),('阿凯','阿',17,'四肖中特'),('老马','老',18,'四尾中特'),('阿东','阿',19,'五肖中特'),('小何','小',20,'七肖中特'),
  ('阿南','阿',21,'八肖中特'),('老谢','老',22,'五肖中特'),('阿文','阿',23,'绝杀二肖'),('小高','小',24,'五尾中特'),('阿诚','阿',25,'绝杀二肖'),
  ('老彭','老',26,'绝杀一头'),('阿荣','阿',27,'绝杀四肖'),('小钟','小',28,'四肖中特'),('阿康','阿',29,'11码中特'),('老邓','老',30,'胆大胆小'),
  ('阿斌','阿',31,'合数单双'),('小唐','小',32,'绝杀一头'),('阿良','阿',33,'无错九肖'),('老曹','老',34,'绝杀一合'),('阿发','阿',35,'绝杀一行'),
  ('小冯','小',36,'稳杀五码'),('阿胜','阿',37,'东南西北'),('老严','老',38,'八尾中特'),('阿乐','阿',39,'九肖中特');
