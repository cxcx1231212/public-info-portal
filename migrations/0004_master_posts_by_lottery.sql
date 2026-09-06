PRAGMA foreign_keys=OFF;

CREATE TABLE master_posts_new (
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

INSERT INTO master_posts_new(id,lottery_type,master_id,period,content_json,result_text,status,created_at,updated_at)
SELECT id,CASE WHEN period<200 THEN 1 ELSE 5 END,master_id,period,
  REPLACE(REPLACE(REPLACE(content_json,'单数数','单数'),'双数数','双数'),'家畜','家禽'),
  result_text,status,created_at,updated_at
FROM master_posts;

DROP TABLE master_posts;
ALTER TABLE master_posts_new RENAME TO master_posts;
CREATE INDEX IF NOT EXISTS idx_master_posts_type_period ON master_posts(lottery_type,period DESC,master_id);
UPDATE masters SET specialty=REPLACE(specialty,'家畜','家禽');
UPDATE master_posts
SET content_json=json_set(content_json,'$.pick',REPLACE(json_extract(content_json,'$.pick'),'】','尾】'))
WHERE master_id=(SELECT id FROM masters WHERE specialty='平特一尾' LIMIT 1)
  AND json_extract(content_json,'$.pick') NOT LIKE '%尾】';

PRAGMA foreign_keys=ON;
