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

INSERT INTO recommended_sites(name,site_url,sort_order,enabled)
SELECT '一路发平特','https://yilufa-pingte.xcx8088.workers.dev/',1,1
WHERE NOT EXISTS(SELECT 1 FROM recommended_sites WHERE site_url='https://yilufa-pingte.xcx8088.workers.dev/');
INSERT INTO recommended_sites(name,site_url,sort_order,enabled)
SELECT '六合王','https://lhw.235-from.com/',2,1
WHERE NOT EXISTS(SELECT 1 FROM recommended_sites WHERE site_url='https://lhw.235-from.com/');
INSERT INTO recommended_sites(name,site_url,sort_order,enabled)
SELECT '跑狗论坛','https://paogt06.h6sdeg6.com/',3,1
WHERE NOT EXISTS(SELECT 1 FROM recommended_sites WHERE site_url='https://paogt06.h6sdeg6.com/');
