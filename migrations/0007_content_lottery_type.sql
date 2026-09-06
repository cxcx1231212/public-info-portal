ALTER TABLE content_items ADD COLUMN lottery_type INTEGER NOT NULL DEFAULT 5;
DROP INDEX IF EXISTS idx_content_seed_unique;
DROP INDEX IF EXISTS idx_content_type_unique;
CREATE INDEX IF NOT EXISTS idx_content_type_lookup ON content_items(lottery_type,section_key,period,title,sort_order);
CREATE INDEX IF NOT EXISTS idx_content_type_section_period ON content_items(lottery_type,section_key,period DESC,sort_order,id);
