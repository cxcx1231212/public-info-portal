-- 将首页现有展示内容导入后台；重复执行不会重复写入。
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_seed_unique ON content_items(section_key,period,title,sort_order);

INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'study',231,'四肖','{"kind":"四肖","pick":"龙鼠狗猴"}','开:00','pending',1,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='study' AND period=231 AND title='四肖');
INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'study',231,'五肖','{"kind":"五肖","pick":"龙鼠狗猴马"}','开:00','pending',2,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='study' AND period=231 AND title='五肖');
INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'study',231,'七肖','{"kind":"七肖","pick":"龙鼠狗猴马兔牛"}','开:00','pending',3,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='study' AND period=231 AND title='七肖');
INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'study',231,'九肖','{"kind":"九肖","pick":"龙鼠狗猴马兔牛虎猪"}','开:00','pending',4,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='study' AND period=231 AND title='九肖');
INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'study',231,'单双','{"kind":"单双","pick":"单数+兔猪"}','开:00','pending',5,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='study' AND period=231 AND title='单双');
INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'study',231,'波色','{"kind":"波色","pick":"绿波+蓝波"}','开:00','pending',6,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='study' AND period=231 AND title='波色');
INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'study',231,'家野','{"kind":"家野","pick":"野兽+狗马"}','开:00','pending',7,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='study' AND period=231 AND title='家野');
INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'study',231,'七尾','{"kind":"七尾","pick":"5714239"}','开:00','pending',8,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='study' AND period=231 AND title='七尾');

INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'sixcode',231,'6肖','{"kind":"6肖","zodiac":"狗马龙虎牛猪","numbers":"⑥码33.37.03.17.30.44"}','','pending',1,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='sixcode' AND period=231 AND title='6肖');
INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'sixcode',231,'4肖','{"kind":"4肖","zodiac":"狗马龙虎","numbers":"④码33.37.03.17"}','','pending',2,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='sixcode' AND period=231 AND title='4肖');
INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'sixcode',231,'2肖','{"kind":"2肖","zodiac":"狗马","numbers":"②码33.37"}','','pending',3,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='sixcode' AND period=231 AND title='2肖');
INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'sixcode',230,'6肖','{"kind":"6肖","zodiac":"兔蛇羊鸡鼠猴","numbers":"⑥码14.26.38.21.09.45"}','','pending',1,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='sixcode' AND period=230 AND title='6肖');
INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'sixcode',230,'4肖','{"kind":"4肖","zodiac":"兔蛇羊鸡","numbers":"④码14.26.38.21"}','','pending',2,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='sixcode' AND period=230 AND title='4肖');
INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'sixcode',230,'2肖','{"kind":"2肖","zodiac":"兔蛇","numbers":"②码14.26"}','','pending',3,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='sixcode' AND period=230 AND title='2肖');

INSERT OR IGNORE INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled) VALUES
('doublewave',227,'牛逼双波','{"pick":"牛逼双波【绿波蓝波】"}','开兔16','win',0,1),
('doublewave',228,'牛逼双波','{"pick":"牛逼双波【蓝波红波】"}','开猴23','win',0,1),
('doublewave',229,'牛逼双波','{"pick":"牛逼双波【绿波蓝波】"}','开蛇38','win',0,1),
('doublewave',230,'牛逼双波','{"pick":"牛逼双波【红波蓝波】"}','开兔16','lose',0,1),
('doublewave',231,'牛逼双波','{"pick":"牛逼双波【绿波红波】"}','开？00','pending',0,1);

INSERT OR IGNORE INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled) VALUES
('homewild',227,'家野出特','{"pick":"家野出特【野兽+羊牛】"}','开兔16','win',0,1),
('homewild',228,'家野出特','{"pick":"家野出特【家禽+猴蛇】"}','开猴23','win',0,1),
('homewild',229,'家野出特','{"pick":"家野出特【家禽+鼠龙】"}','开蛇38','lose',0,1),
('homewild',230,'家野出特','{"pick":"家野出特【野兽+鸡马】"}','开兔16','win',0,1),
('homewild',231,'家野出特','{"pick":"家野出特【野兽+猪牛】"}','开？00','pending',0,1);

INSERT OR IGNORE INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled) VALUES
('threehead',227,'三头爆特','{"pick":"三头爆特【4头2头3头】"}','开兔16','lose',0,1),
('threehead',228,'三头爆特','{"pick":"三头爆特【4头2头3头】"}','开猴23','win',0,1),
('threehead',229,'三头爆特','{"pick":"三头爆特【0头1头3头】"}','开蛇38','win',0,1),
('threehead',230,'三头爆特','{"pick":"三头爆特【1头4头2头】"}','开兔16','win',0,1),
('threehead',231,'三头爆特','{"pick":"三头爆特【1头3头4头】"}','开？00','pending',0,1);

INSERT OR IGNORE INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled) VALUES
('idiom',230,'成语爆平特','{"pick":"成语爆平特【守株待兔】"}','开兔16','win',0,1),
('idiom',231,'成语爆平特','{"pick":"成语爆平特【猛虎下山】"}','开？00','pending',0,1);

INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'threeperiod',228,'三期必中','{"issues":[226,227,228],"pick":"三期必中（蛇龙羊虎）","opens":["开:虎17","开:兔16","开:猴23"]}','','win',0,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='threeperiod' AND period=228);
INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'threeperiod',231,'三期必中','{"issues":[229,230,231],"pick":"三期必中（羊狗猴蛇）","opens":["开:蛇38","开:兔16","开:？00"]}','','pending',0,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='threeperiod' AND period=231);

INSERT OR IGNORE INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled) VALUES
('sumparity',227,'合数单双','{"pick":"合数单双【合数双】"}','开:兔16','lose',0,1),
('sumparity',228,'合数单双','{"pick":"合数单双【合数单】"}','开:猴23','win',0,1),
('sumparity',229,'合数单双','{"pick":"合数单双【合数双】"}','开:蛇38','lose',0,1),
('sumparity',230,'合数单双','{"pick":"合数单双【合数双】"}','开:兔16','lose',0,1),
('sumparity',231,'合数单双','{"pick":"合数单双【合数双】"}','开:？00','pending',0,1);

INSERT OR IGNORE INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled) VALUES
('ninezodiac',231,'③肖','{"kind":"③肖","pick":"蛇马猴"}','','pending',1,1),
('ninezodiac',231,'⑤肖','{"kind":"⑤肖","pick":"蛇马猴兔虎"}','','pending',2,1),
('ninezodiac',231,'⑦肖','{"kind":"⑦肖","pick":"蛇马猴兔虎狗鼠"}','','pending',3,1),
('ninezodiac',231,'⑨肖','{"kind":"⑨肖","pick":"蛇马猴兔虎狗鼠牛羊"}','','pending',4,1);

INSERT OR IGNORE INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled) VALUES
('threeelements',227,'三行中特','{"pick":"三行中特【水土火】"}','开兔16','lose',0,1),
('threeelements',228,'三行中特','{"pick":"三行中特【火金水】"}','开猴23','win',0,1),
('threeelements',229,'三行中特','{"pick":"三行中特【土木火】"}','开蛇38','win',0,1),
('threeelements',230,'三行中特','{"pick":"三行中特【火金木】"}','开兔16','win',0,1),
('threeelements',231,'三行中特','{"pick":"三行中特【水木火】"}','开？00','pending',0,1);

INSERT OR IGNORE INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled) VALUES
('loseall',227,'输尽光生肖','{"pick":"今期买蛇鸡猪输尽光"}','开:兔16','pending',0,1),
('loseall',228,'输尽光生肖','{"pick":"今期买兔鸡狗输尽光"}','开:猴23','pending',0,1),
('loseall',229,'输尽光生肖','{"pick":"今期买猴虎鸡输尽光"}','开:蛇38','pending',0,1),
('loseall',230,'输尽光生肖','{"pick":"今期买猪虎羊输尽光"}','开:兔16','pending',0,1),
('loseall',231,'输尽光生肖','{"pick":"今期买蛇鸡羊输尽光"}','开:？00','pending',0,1);

INSERT INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled)
SELECT 'thirty',231,'精选30码','{"numbers":[1,3,4,6,8,9,11,13,14,16,18,19,21,22,24,25,27,29,30,32,33,35,36,38,40,41,43,45,47,49],"open":"待开奖"}','待开奖','pending',0,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE section_key='thirty' AND period=231);

INSERT OR IGNORE INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled) VALUES
('singledouble',227,'单双中特','{"pick":"单双中特【双数+狗龙】"}','开兔16','win',0,1),
('singledouble',228,'单双中特','{"pick":"单双中特【双数+虎鼠】"}','开猴23','lose',0,1),
('singledouble',229,'单双中特','{"pick":"单双中特【单数+兔蛇】"}','开蛇38','win',0,1),
('singledouble',230,'单双中特','{"pick":"单双中特【单数+牛兔】"}','开兔16','win',0,1),
('singledouble',231,'单双中特','{"pick":"单双中特【单数+牛羊】"}','开？00','pending',0,1);

INSERT OR IGNORE INTO content_items(section_key,period,title,content_json,result_text,status,sort_order,enabled) VALUES
('kill',227,'绝杀专区','{"fields":["猪肖","4尾","红单","4头"]}','兔16','pending',0,1),
('kill',228,'绝杀专区','{"fields":["兔肖","0尾","红单","1头"]}','猴23','pending',0,1),
('kill',229,'绝杀专区','{"fields":["猴肖","7尾","蓝单","1头"]}','蛇38','pending',0,1),
('kill',230,'绝杀专区','{"fields":["猪肖","3尾","蓝单","2头"]}','兔16','pending',0,1),
('kill',231,'绝杀专区','{"fields":["蛇肖","9尾","红双","4头"]}','？00','pending',0,1);

INSERT OR IGNORE INTO master_posts(master_id,period,content_json,result_text,status) VALUES
(1,231,'{"pick":"三期必中【羊狗猴蛇】"}','待开奖','pending'),
(2,231,'{"pick":"两期必中【龙兔】"}','待开奖','pending'),
(3,231,'{"pick":"顶尖六肖【蛇马猴兔虎狗】"}','待开奖','pending'),
(4,231,'{"pick":"一肖平特【马】"}','待开奖','pending'),
(5,231,'{"pick":"绝杀三肖【鸡牛羊】"}','待开奖','pending'),
(6,231,'{"pick":"两波中特【绿波红波】"}','待开奖','pending'),
(7,231,'{"pick":"三头中特【1头3头4头】"}','待开奖','pending'),
(8,231,'{"pick":"必中单双【单数+牛羊】"}','待开奖','pending');
