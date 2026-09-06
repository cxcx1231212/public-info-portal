import {encryptJsonPayload} from './aes-gcm.ts';

const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const isBusinessError=payload=>payload&&typeof payload==='object'&&(payload.success===false||payload.ok===false||(typeof payload.code==='number'&&![0,10000].includes(payload.code))||(typeof payload.status==='number'&&payload.status!==0));
async function maybeEncryptJsonResponse(request,response){
  const url=new URL(request.url);
  if(request.method!=='GET'||url.searchParams.get('encrypted')!=='1'||!response.ok||!(response.headers.get('content-type')||'').includes('application/json'))return response;
  try{
    const payload=JSON.parse(await response.clone().text());
    if(isBusinessError(payload))return response;
    return json(await encryptJsonPayload(payload),response.status,{'x-content-type-options':'nosniff'});
  }catch(error){
    console.error('public_response_encryption_failed',url.pathname,error?.message||error);
    return json({message:'数据加载失败'},500);
  }
}
const safeScriptJson=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
async function encryptedHtmlShell(html){
  const title=((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').replace(/<[^>]*>/g,'').trim();
  const [pageEnvelope,titleEnvelope]=await Promise.all([encryptJsonPayload({html}),encryptJsonPayload(title)]);
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title><style>html,body{height:100%;margin:0;background:#050505}.loading-shell{height:100%;display:grid;place-items:center}.loading-spinner{width:42px;height:42px;border:4px solid rgba(218,174,75,.2);border-top-color:#daae4b;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.decrypt-error{min-height:100%;display:grid;place-items:center;color:#eed078;font:600 18px/1.6 system-ui;background:#050505;padding:24px;text-align:center}</style></head><body><div class="loading-shell" aria-label="loading"><span class="loading-spinner"></span></div><script id="encrypted-page" type="application/json">'+safeScriptJson(pageEnvelope)+'</script><script id="encrypted-title" type="application/json">'+safeScriptJson(titleEnvelope)+'</script><script src="/app-loader.js" defer></script></body></html>';
}
async function maybeEncryptHtmlResponse(response){
  if(!response.ok||!(response.headers.get('content-type')||'').includes('text/html'))return response;
  const html=await response.text(),headers=new Headers(response.headers);
  headers.set('content-type','text/html; charset=utf-8');headers.set('cache-control','no-store, max-age=0');headers.set('x-content-type-options','nosniff');
  return new Response(await encryptedHtmlShell(html),{status:response.status,headers});
}
const textEncoder=new TextEncoder();
const b64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const safeEqual=(a,b)=>{if(a.length!==b.length)return false;let value=0;for(let i=0;i<a.length;i++)value|=a.charCodeAt(i)^b.charCodeAt(i);return value===0;};

async function sign(value,secret){
  const key=await crypto.subtle.importKey('raw',textEncoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return b64url(await crypto.subtle.sign('HMAC',key,textEncoder.encode(value)));
}
async function makeSession(secret){const payload=b64url(textEncoder.encode(JSON.stringify({exp:Date.now()+8*60*60*1000})));return payload+'.'+await sign(payload,secret);}
async function validSession(request,secret){
  if(!secret)return false;
  const cookie=request.headers.get('cookie')||'';const match=cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);if(!match)return false;
  const [payload,signature]=match[1].split('.');if(!payload||!signature||!safeEqual(signature,await sign(payload,secret)))return false;
  try{let encoded=payload.replace(/-/g,'+').replace(/_/g,'/');while(encoded.length%4)encoded+='=';const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))));return Number(data.exp)>Date.now();}catch{return false;}
}
async function body(request){try{return await request.json();}catch{return null;}}
const cleanText=(value,max=5000)=>String(value??'').trim().slice(0,max);
const cleanInt=(value,fallback=0)=>Number.isFinite(Number(value))?Math.trunc(Number(value)):fallback;
const allowedStatus=value=>['pending','win','lose'].includes(value)?value:'pending';
const validLotteryType=value=>[1,5,8].includes(Number(value))?Number(value):5;
async function ensureContentLotteryType(env){
  const info=await env.DB.prepare('PRAGMA table_info(content_items)').all(),columns=new Set((info.results||[]).map(row=>row.name));
  if(!columns.has('lottery_type'))await env.DB.prepare('ALTER TABLE content_items ADD COLUMN lottery_type INTEGER NOT NULL DEFAULT 5').run();
  await env.DB.prepare('DROP INDEX IF EXISTS idx_content_seed_unique').run();
  await env.DB.prepare('DROP INDEX IF EXISTS idx_content_type_unique').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_content_type_lookup ON content_items(lottery_type,section_key,period,title,sort_order)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_content_type_section_period ON content_items(lottery_type,section_key,period DESC,sort_order,id)').run();
}
async function ensureRecommendedSites(env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS recommended_sites (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,site_url TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_recommended_sites_sort ON recommended_sites(enabled,sort_order,id)').run();
}
async function ensureAdsSchema(env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS ads (id INTEGER PRIMARY KEY AUTOINCREMENT,position_key TEXT NOT NULL UNIQUE,image_url TEXT NOT NULL DEFAULT '',link_url TEXT NOT NULL DEFAULT '',display_mode TEXT NOT NULL DEFAULT 'always',delay_seconds INTEGER NOT NULL DEFAULT 1,start_at TEXT,end_at TEXT,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const info=await env.DB.prepare('PRAGMA table_info(ads)').all(),columns=new Set((info.results||[]).map(row=>row.name));
  const additions=[['image_url',"TEXT NOT NULL DEFAULT ''"],['link_url',"TEXT NOT NULL DEFAULT ''"],['display_mode',"TEXT NOT NULL DEFAULT 'always'"],['delay_seconds','INTEGER NOT NULL DEFAULT 1'],['start_at','TEXT'],['end_at','TEXT'],['enabled','INTEGER NOT NULL DEFAULT 1'],['updated_at','TEXT']];
  for(const [name,type] of additions)if(!columns.has(name))await env.DB.prepare('ALTER TABLE ads ADD COLUMN '+name+' '+type).run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS ad_stats (position_key TEXT PRIMARY KEY,impressions INTEGER NOT NULL DEFAULT 0,clicks INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
}
async function ensureTextAdsSchema(env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS text_ads (id INTEGER PRIMARY KEY AUTOINCREMENT,ad_text TEXT NOT NULL,link_url TEXT NOT NULL DEFAULT '',text_color TEXT NOT NULL DEFAULT '#f2cf68',sort_order INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_text_ads_sort ON text_ads(enabled,sort_order,id)').run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS text_ad_domains (id INTEGER PRIMARY KEY AUTOINCREMENT,domain_url TEXT NOT NULL UNIQUE,sort_order INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_text_ad_domains_sort ON text_ad_domains(enabled,sort_order,id)').run();
  await env.DB.prepare("INSERT OR IGNORE INTO text_ad_domains(domain_url,sort_order,enabled) SELECT DISTINCT link_url,sort_order,1 FROM text_ads WHERE link_url LIKE 'http%'").run();
  await env.DB.prepare("UPDATE text_ads SET link_url='' WHERE link_url LIKE 'http%'").run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS text_ad_imports (import_key TEXT PRIMARY KEY,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
  const imported=await env.DB.prepare("SELECT import_key FROM text_ad_imports WHERE import_key='initial-42-phrases-v1'").first();
  if(!imported){
    const phrases=[
      '{期数}期: {彩种简称}→【绝杀三肖】←全网最稳','{期数}期: {彩种简称}→【女肖男肖】←快杀二肖','{期数}期: {彩种简称}→【最强三码】←开奖发财','{期数}期: {彩种简称}→【单数双数】←超准四码','{期数}期: {彩种简称}→【一肖一码】←十中八九','{期数}期: {彩种简称}→【必开⑫码】←期期公开','{期数}期: {彩种简称}→【⑳码中特】←两期必开','{期数}期: {彩种简称}→【内幕③码】←主攻①码','{期数}期: {彩种简称}→【无错⑤肖】←家禽野兽','{期数}期: {彩种简称}→【家禽野兽】←精准杀料','{期数}期: {彩种简称}→【单数双数】←真的很准','{期数}期: {彩种简称}→【重点六码】←两期必开','{期数}期: {彩种简称}→【网红五码】←开奖发财','{期数}期: {彩种简称}→【砍杀二肖】←三期必开','{期数}期: {彩种简称}→【单数双数】←绝杀③肖','{期数}期: {彩种简称}→【二期必开】←赚钱双波','{期数}期: {彩种简称}→【四尾12码】←站长推荐','{期数}期: {彩种简称}→【绝杀三肖】←全年无错','{期数}期: {彩种简称}→【泄密③码】←内幕资料','{期数}期: {彩种简称}→【三期必出】←精彩继续','{期数}期: {彩种简称}→【单吊一码】←二期必开','{期数}期: {彩种简称}→【内幕②码】←站长推荐','{期数}期: {彩种简称}→【二字爆特】←天机泄密','{期数}期: {彩种简称}→【泄密３肖】←绝杀④肖','{期数}期: {彩种简称}→【牛逼一码】←欢迎验证','{期数}期: {彩种简称}→【单双必中】←内幕①码','{期数}期: {彩种简称}→【一肖中特】←赶快上车','{期数}期: {彩种简称}→【一码中特】←高手云集','{期数}期: {彩种简称}→【平特一肖】←无错公开','{期数}期: {彩种简称}→【内部三肖】←内部平特','{期数}期: {彩种简称}→【牛逼２码】←重点关注','{期数}期: {彩种简称}→【精选③肖】←超准单双','{期数}期: {彩种简称}→【精准一肖】←强力推荐','{期数}期: {彩种简称}→【一波中特】←两期必开','{期数}期: {彩种简称}→【绝杀三肖】←连准31期','{期数}期: {彩种简称}→【平特一肖】←家禽野兽','{期数}期: {彩种简称}→【家禽野兽】←绝杀３肖','{期数}期: {彩种简称}→【天地生肖】←一肖平特','{期数}期: {彩种简称}→【一肖平特】←二期必开','{期数}期: {彩种简称}→【平特一肖】←两期必开','{期数}期: {彩种简称}→【绝杀三肖】←今年无错','{期数}期: {彩种简称}→【单数双数】←站长推荐'
    ];
    for(let offset=0;offset<phrases.length;offset+=40){const chunk=phrases.slice(offset,offset+40);await env.DB.batch(chunk.map((phrase,index)=>env.DB.prepare("INSERT INTO text_ads(ad_text,text_color,sort_order,enabled) SELECT ?,'#f2cf68',?,1 WHERE NOT EXISTS(SELECT 1 FROM text_ads WHERE ad_text=?)").bind(phrase,offset+index,phrase)));}
    await env.DB.prepare("INSERT OR REPLACE INTO text_ad_imports(import_key) VALUES('initial-42-phrases-v1')").run();
  }
}

async function trackVisit(request,env){
  const ip=cleanText(request.headers.get('CF-Connecting-IP')||'unknown',80),cf=request.cf||{},date=new Date().toISOString().slice(0,10),country=cleanText(cf.country||'',80),region=cleanText(cf.region||'',120),city=cleanText(cf.city||'',120);
  const unique=await env.DB.prepare('INSERT OR IGNORE INTO analytics_uniques(visit_date,ip_address) VALUES(?,?)').bind(date,ip).run(),isNew=Number(unique.meta?.changes||0);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO analytics_daily(visit_date,views,unique_visitors) VALUES(?,1,?) ON CONFLICT(visit_date) DO UPDATE SET views=views+1,unique_visitors=unique_visitors+excluded.unique_visitors').bind(date,isNew),
    env.DB.prepare('INSERT INTO analytics_visitors(ip_address,country,region_name,city,views,first_seen,last_seen) VALUES(?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(ip_address) DO UPDATE SET country=excluded.country,region_name=excluded.region_name,city=excluded.city,views=analytics_visitors.views+1,last_seen=CURRENT_TIMESTAMP').bind(ip,country,region,city)
  ]);
}

const parseJson=value=>{try{return JSON.parse(value||'{}')||{};}catch{return {};}};
const colorName=value=>Number(value)===1?'红波':Number(value)===2?'蓝波':'绿波';
const domestic=new Set(['牛','马','羊','鸡','狗','猪']);
const idiomZodiacMap={守株待兔:'兔',龙马精神:'龙',虎虎生威:'虎',亡羊补牢:'羊',金鸡独立:'鸡',猴年马月:'猴',画蛇添足:'蛇',九牛一毛:'牛',狗急跳墙:'狗',猪突豨勇:'猪',鼠目寸光:'鼠',龙腾虎跃:'龙',猛虎下山:'虎'};
const idiomTarget=data=>{
  const explicit=String(data?.zodiac||'').match(/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/)?.[0];if(explicit)return explicit;
  const text=String(data?.pick||''),idiom=(text.match(/【([^】]+)】/)||[])[1]||text;
  return idiomZodiacMap[idiom]||idiom.match(/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/)?.[0]||'';
};
function evaluateContent(row,special){
  const data=parseJson(row.content_json),pick=String(data.pick||data.zodiac||row.title||''),number=Number(special.number),zodiac=String(special.shengXiao||''),color=colorName(special.color),element=String(special.wuXing||''),key=row.section_key;
  if(!number||!zodiac)return null;
  if(key==='thirty'){const values=Array.isArray(data.numbers)?data.numbers.map(Number):[];return values.includes(number);}
  if(key==='threehead')return pick.includes(Math.floor(number/10)+'头');
  if(key==='doublewave')return pick.includes(color);
  if(key==='threeelements')return pick.includes(element);
  if(key==='sumparity'){const parity=((Math.floor(number/10)+number%10)%2)?'合数单':'合数双';return pick.includes(parity);}
  if(key==='singledouble'){const parity=number%2?'单数':'双数';return pick.includes(parity)||pick.includes(zodiac);}
  if(key==='study'){
    const kind=String(data.kind||row.title||'');if(kind.includes('肖'))return pick.includes(zodiac);if(kind.includes('单双'))return pick.includes(number%2?'单数':'双数');if(kind.includes('波色'))return pick.includes(color);if(kind.includes('七尾'))return pick.replace(/\D/g,'').includes(String(number%10));if(kind.includes('家野')){const group=domestic.has(zodiac)?'家禽':'野兽';return pick.includes(group)||pick.includes(zodiac);}return null;
  }
  if(key==='homewild'){const group=domestic.has(zodiac)?'家禽':'野兽';return pick.includes(group)||pick.includes(zodiac);}
  if(key==='idiom')return new Set(Array.isArray(special.allZodiacs)?special.allZodiacs.map(String):[zodiac]).has(idiomTarget(data));
  if(['sixcode','ninezodiac'].includes(key)){const numbers=String(data.numbers||'').match(/\d{1,2}/g)?.map(Number)||[];return pick.includes(zodiac)||numbers.includes(number);}
  if(key==='loseall')return !pick.includes(zodiac);
  if(key==='kill'){const fields=Array.isArray(data.fields)?data.fields.map(String):[];return !fields.some(value=>value.includes(zodiac)||value.includes(number%10+'尾')||value.includes(color.replace('波',''))||value.includes(Math.floor(number/10)+'头'));}
  if(key==='threeperiod')return null;
  return pick.includes(zodiac)||pick.includes(String(number).padStart(2,'0'));
}
function evaluatePost(row,special){
  const data=parseJson(row.content_json),pick=String(data.pick||data.value||''),specialty=String(row.specialty||pick.split('【')[0]||''),number=Number(special.number),zodiac=String(special.shengXiao||''),color=colorName(special.color),element=String(special.wuXing||'');if(!pick||!number||!zodiac)return null;const selection=(pick.match(/【([^】]*)】/)||[])[1]||pick;
  const tokens=selection.match(/(?:^|\D)(0?[1-9]|[1-4]\d)(?=\D|$)/g)?.map(value=>Number(value.replace(/\D/g,'')))||[],tail=number%10,head=Math.floor(number/10),sumParity=((Math.floor(number/10)+tail)%2)?'合数单':'合数双',size=number>=25?'大数':'小数',group=domestic.has(zodiac)?'家禽':'野兽';
  const direction=({兔:'东',虎:'东',龙:'东',蛇:'南',马:'南',羊:'南',猴:'西',鸡:'西',狗:'西',猪:'北',鼠:'北',牛:'北'})[zodiac]||'',heaven=new Set(['兔','马','猴','猪','牛','龙']).has(zodiac)?'天肖':'地肖';
  let matched=selection.includes(zodiac)||tokens.includes(number)||(color&&selection.includes(color))||(element&&selection.includes(element))||selection.includes(head+'头')||selection.includes(number%2?'单数':'双数');
  if(specialty.includes('尾'))matched=matched||selection.includes(tail+'尾')||(!selection.includes('尾')&&selection.replace(/\D/g,'').includes(String(tail)));
  if(specialty.includes('大小')||specialty.includes('胆大'))matched=matched||selection.includes(size);
  if(specialty.includes('合数')||specialty.includes('一合'))matched=matched||selection.includes(sumParity);
  if(specialty.includes('家禽')||specialty.includes('家野'))matched=matched||selection.includes(group);
  if(specialty.includes('天地'))matched=matched||selection.includes(heaven);
  if(specialty.includes('东南西北'))matched=matched||selection.includes(direction);
  return /绝杀|稳杀|必禁/.test(specialty)?!matched:matched;
}
const zodiacOrder=['马','蛇','龙','兔','虎','牛','鼠','猪','狗','鸡','猴','羊'];
const waves=['红波','蓝波','绿波'],elements=['金','木','水','火','土'];
const idioms=['守株待兔','龙马精神','虎虎生威','亡羊补牢','金鸡独立','猴年马月','画蛇添足','九牛一毛','狗急跳墙','猪突豨勇','鼠目寸光','龙腾虎跃'];
const expectedSections={study:8,sixcode:3,doublewave:1,homewild:1,threehead:1,idiom:1,threeperiod:1,sumparity:1,ninezodiac:4,threeelements:1,loseall:1,thirty:1,singledouble:1,kill:1};
const numberPool=Array.from({length:49},(_,i)=>i+1);
const rngFor=seed=>{let state=(Number(seed)||1)>>>0;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};};
const sample=(values,count,random)=>{const copy=[...values];for(let i=copy.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy.slice(0,count);};
const numbersFor=zodiacs=>numberPool.filter(number=>zodiacs.includes(zodiacOrder[(number-1)%12]));
const masterCatalog=[
  ['曹操','八码中特'],['刘备','四尾中特'],['孙权','五肖中特'],['诸葛亮','六肖中特'],['关羽','四肖中特'],['张飞','吉凶中特'],['赵云','七尾中特'],['马超','绝杀三肖'],['黄忠','平特一肖'],['周瑜','双波中特'],
  ['吕布','家禽野兽'],['司马懿','必中大小'],['典韦','六肖中特'],['许褚','单双中特'],['张辽','天地中特'],['徐晃','平特一尾'],['夏侯惇','四肖中特'],['夏侯渊','四尾中特'],['曹仁','五肖中特'],['曹丕','七肖中特'],
  ['孙策','八肖中特'],['鲁肃','五肖中特'],['陆逊','绝杀二肖'],['甘宁','五尾中特'],['太史慈','绝杀二肖'],['黄盖','绝杀一头'],['程普','绝杀四肖'],['姜维','四肖中特'],['魏延','11码中特'],['庞统','胆大胆小'],
  ['法正','合数单双'],['董卓','绝杀一头'],['袁绍','无错九肖'],['袁术','绝杀一合'],['貂蝉','绝杀一行'],['大乔','稳杀五码'],['小乔','东南西北'],['华佗','八尾中特'],['陈宫','九肖中特']
];
const replacementMasterNames=['郭嘉','荀彧','荀攸','贾诩','吕蒙','张昭','张纮','曹洪','华雄','张角','公孙瓒','颜良','文丑','高顺','陈群','钟会','邓艾','陆抗','羊祜','王平','廖化','关平','周仓','马岱','严颜','张任','蒋琬','费祎','顾雍','诸葛瑾','凌统','潘璋','丁奉','于禁','乐进','李典','程昱','满宠','曹真','曹休'];
const generatedMasterPrefixes=['金陵','长安','洛阳','江东','巴蜀','荆州','中原','塞北','岭南','关中','燕赵','齐鲁','河西','云中','天山','沧海','青城','昆仑','武陵','西凉'];
const generatedMasterSuffixes=['刀客','剑客','神算','奇侠','名士','智囊','豪杰','先锋','谋士','隐侠','宗师','高人','神捕','侠士','军师','贤士','飞将','虎将','名将','义士'];
function nextUniqueMasterName(usedNames){for(const prefix of generatedMasterPrefixes)for(const suffix of generatedMasterSuffixes){const candidate=prefix+suffix;if(!usedNames.has(candidate))return candidate;}for(let index=0;index<4096;index++){const candidate='高手'+String.fromCharCode(0x4e00+Math.floor(index/64))+String.fromCharCode(0x4e00+index%64);if(!usedNames.has(candidate))return candidate;}throw new Error('高手姓名库已满');}
async function ensureMasterRosterSchema(env){const info=await env.DB.prepare('PRAGMA table_info(masters)').all(),columns=new Set((info.results||[]).map(item=>item.name));if(!columns.has('lottery_scope'))await env.DB.prepare('ALTER TABLE masters ADD COLUMN lottery_scope INTEGER NOT NULL DEFAULT 0').run();if(!columns.has('replaces_master_id'))await env.DB.prepare('ALTER TABLE masters ADD COLUMN replaces_master_id INTEGER NOT NULL DEFAULT 0').run();}
async function ensureMasterCatalog(env){
  await ensureMasterRosterSchema(env);
  const version='catalog-232-three-kingdoms-v2',row=await env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='master_catalog_version' LIMIT 1").first();if(row?.setting_value===version){await ensureMasterPostCoverage(env);await ensureAdditionalMasterResults(env);await auditStoredMasterPosts(env);return;}
  await env.DB.batch([env.DB.prepare('DELETE FROM master_posts'),env.DB.prepare('DELETE FROM masters')]);
  await env.DB.batch(masterCatalog.map(([name,specialty],index)=>env.DB.prepare('INSERT INTO masters(name,avatar,rank_no,specialty,enabled) VALUES(?,?,?,?,1)').bind(name,name.slice(0,1),index+1,specialty)));
  await generateNextPeriod(env,232,232);
  await env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('master_catalog_version',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(version).run();
  await ensureMasterPostCoverage(env);
  await ensureAdditionalMasterResults(env);
  await auditStoredMasterPosts(env);
}
async function ensureMasterPostCoverage(env){
  const rows=await env.DB.prepare("SELECT lottery_type,MAX(period) period FROM content_items WHERE enabled=1 AND section_key<>'threeperiod' GROUP BY lottery_type").all();
  for(const row of rows.results||[]){const lotteryType=validLotteryType(row.lottery_type),period=Number(row.period||0);if(!period)continue;const exists=await env.DB.prepare('SELECT 1 found FROM master_posts WHERE lottery_type=? AND period=? LIMIT 1').bind(lotteryType,period).first();if(!exists)await generateNextPeriod(env,period,period,lotteryType);}
}
async function ensureAdditionalMasterResults(env){
  const version='split-master-results-v1',done=await env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='additional_master_result_version' LIMIT 1").first();if(done?.setting_value===version)return;
  await syncAdditionalLotteryTypes(env);
  await env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('additional_master_result_version',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(version).run();
}
async function publicMasters(env,lotteryType=5){
  lotteryType=validLotteryType(lotteryType);await ensureMasterRosterSchema(env);const [masters,posts]=await Promise.all([env.DB.prepare('SELECT id,name,avatar,rank_no,specialty,lottery_scope,replaces_master_id FROM masters WHERE enabled=1 AND lottery_scope IN (0,?) ORDER BY rank_no,id').bind(lotteryType).all(),env.DB.prepare("SELECT master_id,status,period FROM master_posts WHERE lottery_type=? AND status IN ('win','lose') ORDER BY master_id,period DESC,id DESC").bind(lotteryType).all()]),recent=new Map();
  for(const post of posts.results||[]){if(!recent.has(post.master_id))recent.set(post.master_id,[]);const rows=recent.get(post.master_id);if(rows.length<3)rows.push(post.status);}
  const roster=(masters.results||[]).map(master=>{const rows=recent.get(master.id)||[],archived=rows.length===3&&rows.every(status=>status==='lose');return {...master,archived,streak:archived?3:0};}),active=roster.filter(master=>!master.archived);let created=0;
  if(active.length<39){const usedNames=new Set((await env.DB.prepare('SELECT name FROM masters').all()).results?.map(item=>item.name)||[]),baseByRank=new Map(roster.filter(master=>master.lottery_scope===0).map(master=>[Number(master.rank_no),master])),activeRanks=new Set(active.map(master=>Number(master.rank_no))),missing=Array.from({length:39},(_,index)=>index+1).filter(rank=>!activeRanks.has(rank));
    for(const rank of missing.slice(0,39-active.length)){const base=baseByRank.get(rank)||masterCatalog[(rank-1)%masterCatalog.length],availableName=replacementMasterNames.find(item=>!usedNames.has(item)),name=availableName||nextUniqueMasterName(usedNames),specialty=base.specialty||base[1]||'免费资料',replaced=roster.find(master=>Number(master.rank_no)===rank&&master.archived);const result=await env.DB.prepare('INSERT INTO masters(name,avatar,rank_no,specialty,lottery_scope,replaces_master_id,enabled) VALUES(?,?,?,?,?,?,1)').bind(name,name.slice(0,1),rank,specialty,lotteryType,replaced?.id||0).run(),master={id:result.meta.last_row_id,name,avatar:name.slice(0,1),rank_no:rank,specialty,lottery_scope:lotteryType,replaces_master_id:replaced?.id||0,archived:false,streak:0};roster.push(master);active.push(master);usedNames.add(name);created++;}
    if(created){const period=Number((await env.DB.prepare("SELECT MAX(period) period FROM content_items WHERE lottery_type=? AND enabled=1 AND section_key<>'threeperiod'").bind(lotteryType).first())?.period||0);if(period)await generateNextPeriod(env,period,period,lotteryType);}
  }
  return roster.sort((a,b)=>Number(a.rank_no)-Number(b.rank_no)||Number(a.id)-Number(b.id));
}
async function activeMasterRows(env,lotteryType,masters){
  const posts=await env.DB.prepare("SELECT master_id,status FROM master_posts WHERE lottery_type=? AND status IN ('win','lose') ORDER BY master_id,period DESC,id DESC").bind(lotteryType).all(),recent=new Map();
  for(const post of posts.results||[]){if(!recent.has(post.master_id))recent.set(post.master_id,[]);const rows=recent.get(post.master_id);if(rows.length<3)rows.push(post.status);}
  return (masters||[]).filter(master=>{const rows=recent.get(master.id)||[];return !(rows.length===3&&rows.every(status=>status==='lose'));});
}
function normalizeMasterCategoryPick(specialty,contentJson){
  const data=parseJson(contentJson);let pick=String(data.pick||''),changed=false;
  if(specialty.includes('尾')&&!/\d尾/.test(pick)){const inside=(pick.match(/【([^】]*)】/)||[])[1]||'',tails=inside.replace(/\D/g,'').split('').filter(Boolean).map(value=>value+'尾').join('·');if(tails){pick=specialty+'【'+tails+'】';changed=true;}}
  if(specialty==='合数单双'&&!/【合数[单双]】/.test(pick)){pick=specialty+'【'+(pick.includes('单数')?'合数单':'合数双')+'】';changed=true;}
  if(specialty==='胆大胆小'&&!/[大小]数/.test(pick)){pick=specialty+'【'+(pick.includes('单数')?'小数':'大数')+'】';changed=true;}
  if(changed)data.pick=pick;return {changed,contentJson:changed?JSON.stringify(data):contentJson};
}
async function auditStoredMasterPosts(env){
  const version='category-audit-v5',done=await env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='master_post_audit_version' LIMIT 1").first();if(done?.setting_value===version)return;
  const rows=await env.DB.prepare("SELECT p.id,p.content_json,p.result_text,m.specialty FROM master_posts p JOIN masters m ON m.id=p.master_id WHERE m.specialty NOT LIKE '%波%' AND m.specialty NOT LIKE '%一行%' AND m.specialty NOT LIKE '%吉凶%'").all(),updates=[];
  for(const row of rows.results||[]){
    const normalized=normalizeMasterCategoryPick(row.specialty,row.content_json);if(normalized.changed)row.content_json=normalized.contentJson;
    const match=String(row.result_text||'').match(/开:([^0-9])([0-9]{1,2})/);if(!match){if(normalized.changed)updates.push(env.DB.prepare("UPDATE master_posts SET content_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.content_json,row.id));continue;}const verdict=evaluatePost(row,{shengXiao:match[1],number:Number(match[2])});if(verdict===null)continue;updates.push(env.DB.prepare("UPDATE master_posts SET content_json=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.content_json,verdict?'win':'lose',row.id));
  }
  for(let offset=0;offset<updates.length;offset+=80)await env.DB.batch(updates.slice(offset,offset+80));
  await env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('master_post_audit_version',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(version).run();
}
async function auditStoredIdiomContent(env){
  const version='idiom-all-draw-zodiacs-v2',done=await env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='idiom_content_audit_version' LIMIT 1").first();if(done?.setting_value===version)return;
  const rows=await env.DB.prepare("SELECT id,lottery_type,period,section_key,content_json,result_text,status FROM content_items WHERE section_key='idiom'").all(),updates=[],draws=new Map(),year=new Date().getUTCFullYear();
  for(const lotteryType of [1,5,8]){
    try{
      const response=await fetch('https://6htv70.com/gallerynew/h5/lottery/search?pageNum=1&year='+year+'&sort=1&lotteryType='+lotteryType,{headers:{accept:'application/json','user-agent':'Mozilla/5.0'}}),payload=response.ok?await response.json():null;
      for(const record of payload?.data?.recordList||[])draws.set(lotteryType+':'+Number(record.period),record);
    }catch(error){console.error('idiom_history_fetch_failed',lotteryType,error?.message||error);}
  }
  for(const row of rows.results||[]){
    const data=parseJson(row.content_json),target=idiomTarget(data);if(target)data.zodiac=target;
    const draw=draws.get(validLotteryType(row.lottery_type)+':'+Number(row.period)),numbers=Array.isArray(draw?.numberList)?draw.numberList:[],allZodiacs=new Set(numbers.map(item=>String(item?.shengXiao||'')).filter(item=>VALID_ZODIACS.has(item))),special=numbers[numbers.length-1];
    if(numbers.length&&special?.number&&special?.shengXiao){const status=allZodiacs.has(target)?'win':'lose',result='开:'+special.shengXiao+String(special.number).padStart(2,'0');updates.push(env.DB.prepare('UPDATE content_items SET content_json=?,result_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(data),result,status,row.id));}
    else updates.push(env.DB.prepare('UPDATE content_items SET content_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(data),row.id));
  }
  for(let offset=0;offset<updates.length;offset+=80)await env.DB.batch(updates.slice(offset,offset+80));
  await env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('idiom_content_audit_version',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(version).run();
}
async function generateNextPeriod(env,period,seed,lotteryType=5){
  if(!period)return {period:0,created:0,posts:0};
  lotteryType=validLotteryType(lotteryType);await ensureContentLotteryType(env);
  const random=rngFor(period*100+(Number(seed)||0)+lotteryType*1000003),zs=count=>sample(zodiacOrder,count,random),ns=count=>sample(numberPool,count,random).sort((a,b)=>a-b),heads=()=>sample(['0头','1头','2头','3头','4头'],3,random),pair=()=>sample(waves,2,random),els=()=>sample(elements,3,random),threePeriodStart=period-(((period-226)%3+3)%3);
  const six=zs(6),sixNumbers=sample(numbersFor(six),6,random).map(n=>String(n).padStart(2,'0'));
  const studyZ=zs(9),nine=zs(9),threeZ=zs(3),parity=random()<.5?'单数':'双数',sumParity=random()<.5?'合数单':'合数双',home=random()<.5?'家禽':'野兽',idiom=idioms[Math.floor(random()*idioms.length)];
  const templates=[
    ...[[4,'四肖'],[5,'五肖'],[7,'七肖'],[9,'九肖']].map(([count,title],index)=>['study',title,{kind:title,pick:studyZ.slice(0,count).join('')},index+1]),
    ['study','单双',{kind:'单双',pick:parity+'+'+zs(2).join('')},5],['study','波色',{kind:'波色',pick:pair().join('+')},6],['study','家野',{kind:'家野',pick:home+'+'+zs(2).join('')},7],['study','七尾',{kind:'七尾',pick:sample([0,1,2,3,4,5,6,7,8,9],7,random).join('')},8],
    ['sixcode','6肖',{kind:'6肖',zodiac:six.join(''),numbers:'⑥码'+sixNumbers.join('.')},1],['sixcode','4肖',{kind:'4肖',zodiac:six.slice(0,4).join(''),numbers:'④码'+sixNumbers.slice(0,4).join('.')},2],['sixcode','2肖',{kind:'2肖',zodiac:six.slice(0,2).join(''),numbers:'②码'+sixNumbers.slice(0,2).join('.')},3],
    ['doublewave','牛逼双波',{pick:'牛逼双波【'+pair().join('')+'】'},0],['homewild','家野出特',{pick:'家野出特【'+home+'+'+zs(2).join('')+'】'},0],['idiom','成语爆平特',{pick:'成语爆平特【'+idiom+'】',zodiac:idiomZodiacMap[idiom]},0],['threehead','三头爆特',{pick:'三头爆特【'+heads().join('')+'】'},0],
    ['threeperiod','三期必中',{issues:[threePeriodStart,threePeriodStart+1,threePeriodStart+2],pick:'三期必中（'+zs(4).join('')+'）',opens:['开:？00','开:？00','开:？00']},0],['sumparity','合数单双',{pick:'合数单双【'+sumParity+'】'},0],
    ...[[3,'③肖'],[5,'⑤肖'],[7,'⑦肖'],[9,'⑨肖']].map(([count,title],index)=>['ninezodiac',title,{kind:title,pick:nine.slice(0,count).join('')},index+1]),
    ['threeelements','三行中特',{pick:'三行中特【'+els().join('')+'】'},0],['loseall','输尽光生肖',{pick:'今期买'+threeZ.join('')+'输尽光'},0],['thirty','精选30码',{numbers:ns(30),open:'待开奖'},0],['singledouble','单双中特',{pick:'单双中特【'+parity+'+'+zs(2).join('')+'】'},0],['kill','绝杀专区',{fields:[zs(1)[0]+'肖',Math.floor(random()*10)+'尾',waves[Math.floor(random()*3)].replace('波',random()<.5?'单':'双'),Math.floor(random()*5)+'头']},0]
  ];
  const statements=[];
  for(const [section,title,data,sort] of templates){const recordPeriod=section==='threeperiod'?threePeriodStart+2:period;statements.push(env.DB.prepare("INSERT INTO content_items(lottery_type,section_key,period,title,content_json,result_text,status,sort_order,enabled) SELECT ?,?,?,?,?,'待开奖','pending',?,1 WHERE NOT EXISTS(SELECT 1 FROM content_items WHERE lottery_type=? AND section_key=? AND period=? AND title=? AND sort_order=?)").bind(lotteryType,section,recordPeriod,title,JSON.stringify(data),sort,lotteryType,section,recordPeriod,title,sort));}
  await ensureMasterRosterSchema(env);const masterResult=await env.DB.prepare('SELECT id,specialty FROM masters WHERE enabled=1 AND lottery_scope IN (0,?) ORDER BY rank_no,id').bind(lotteryType).all(),masters=await activeMasterRows(env,lotteryType,masterResult.results||[]);
  for(const master of masters){const specialty=String(master.specialty||'免费资料');let pick=zs(3).join(''),count=Number(specialty.match(/[四五六七八九]/)?.[0]?.replace('四','4').replace('五','5').replace('六','6').replace('七','7').replace('八','8').replace('九','9'))||0;if(specialty.includes('11码'))pick=ns(11).map(n=>String(n).padStart(2,'0')).join('.');else if(specialty.includes('八码')||specialty.includes('五码'))pick=ns(specialty.includes('八码')?8:5).map(n=>String(n).padStart(2,'0')).join('.');else if(specialty.includes('尾'))pick=sample([0,1,2,3,4,5,6,7,8,9],count||1,random).map(n=>n+'尾').join('·');else if(specialty.includes('肖'))pick=zs(count||(/二肖/.test(specialty)?2:/一肖/.test(specialty)?1:3)).join('');else if(specialty.includes('波'))pick=pair().join('+');else if(specialty.includes('头'))pick=heads().slice(0,1).join('');else if(specialty.includes('单双')||specialty.includes('胆大'))pick=parity+'+'+zs(2).join('');else if(specialty.includes('合数'))pick=sumParity;else if(specialty.includes('一合'))pick=(random()<.5?'合数单':'合数双');else if(specialty.includes('一行'))pick=elements[Math.floor(random()*elements.length)];else if(specialty.includes('家禽'))pick=home+'+'+zs(2).join('');else if(specialty.includes('大小'))pick=(random()<.5?'大数':'小数')+'+'+zs(2).join('');else if(specialty.includes('天地'))pick=(random()<.5?'天肖':'地肖')+'+'+zs(3).join('');else if(specialty.includes('吉凶'))pick=(random()<.5?'吉数':'凶数')+'+'+zs(2).join('');else if(specialty.includes('东南西北'))pick=sample(['东','南','西','北'],2,random).join('+');statements.push(env.DB.prepare("INSERT OR IGNORE INTO master_posts(lottery_type,master_id,period,content_json,result_text,status) VALUES(?,?,?,?, '待开奖','pending')").bind(lotteryType,master.id,period,JSON.stringify({pick:specialty+'【'+pick+'】'})));}
  const results=statements.length?await env.DB.batch(statements):[],created=results.slice(0,templates.length).reduce((n,r)=>n+Number(r.meta?.changes||0),0),posts=results.slice(templates.length).reduce((n,r)=>n+Number(r.meta?.changes||0),0);
  const generatedPosts=await env.DB.prepare('SELECT p.id,p.content_json,m.specialty FROM master_posts p JOIN masters m ON m.id=p.master_id WHERE p.lottery_type=? AND p.period=?').bind(lotteryType,period).all(),categoryUpdates=[];
  for(const row of generatedPosts.results||[]){const normalized=normalizeMasterCategoryPick(row.specialty,row.content_json);if(normalized.changed)categoryUpdates.push(env.DB.prepare('UPDATE master_posts SET content_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(normalized.contentJson,row.id));}
  if(categoryUpdates.length)await env.DB.batch(categoryUpdates);
  return {period,created,posts};
}
async function auditPeriod(env,requestedPeriod=0,lotteryType=5){
  lotteryType=validLotteryType(lotteryType);const latest=requestedPeriod||Number((await env.DB.prepare('SELECT MAX(period) period FROM content_items WHERE lottery_type=? AND enabled=1').bind(lotteryType).first())?.period||0);if(!latest)return {period:0,passed:false,issues:['尚无资料'],sections:[],postCount:0};
  const [content,posts]=await Promise.all([env.DB.prepare("SELECT section_key,period,title,content_json FROM content_items WHERE lottery_type=? AND enabled=1 AND (period=? OR section_key='threeperiod') ORDER BY section_key,sort_order,id").bind(lotteryType,latest).all(),env.DB.prepare('SELECT COUNT(*) count FROM master_posts WHERE lottery_type=? AND period=?').bind(lotteryType,latest).first()]);
  const rows=content.results||[],sections=[],issues=[],seen=new Map();
  for(const [key,expected] of Object.entries(expectedSections)){
    const own=rows.filter(row=>row.section_key===key&&(key!=='threeperiod'||((parseJson(row.content_json).issues||[]).map(Number).includes(latest)))),problems=[];if(own.length!==expected)problems.push('应有'+expected+'条，实际'+own.length+'条');
    for(const row of own){let data;try{data=JSON.parse(row.content_json||'');}catch{problems.push(row.title+' JSON格式错误');continue;}const value=String(data.pick||data.zodiac||data.numbers||data.fields||'').trim();if(!value)problems.push(row.title+' 内容为空');else{const signature=key+'|'+value;if(seen.has(signature))problems.push(row.title+' 内容重复');seen.set(signature,true);}}
    sections.push({key,expected,actual:own.length,passed:problems.length===0,problems});for(const problem of problems)issues.push(key+'：'+problem);
  }
  const postCount=Number(posts?.count||0);if(postCount<1)issues.push('高手帖子：当前期没有内容');
  return {period:latest,passed:issues.length===0,issues,sections,postCount};
}
async function fetchLatestLottery(lotteryType=5){
  lotteryType=validLotteryType(lotteryType);const response=await fetch('https://6htv70.com/gallerynew/h5/index/lastLotteryRecord?lotteryType='+lotteryType,{headers:{accept:'application/json','user-agent':'Mozilla/5.0'}});if(!response.ok)throw new Error('开奖接口 HTTP '+response.status);const payload=await response.json();if(!payload||payload.code!==10000||!payload.data)throw new Error('开奖接口返回异常');return payload;
}
async function ensureLotteryContent(env,lotteryType){
  lotteryType=validLotteryType(lotteryType);const exists=await env.DB.prepare('SELECT 1 found FROM content_items WHERE lottery_type=? AND enabled=1 LIMIT 1').bind(lotteryType).first();
  if(!exists){const latest=await fetchLatestLottery(lotteryType),draw=latest.data||{},nextPeriod=Number(draw.nextLotteryNumber||draw.nextIntLotteryNumber||Number(draw.period||draw.intPeriod||0)+1);if(nextPeriod)await generateNextPeriod(env,nextPeriod,nextPeriod,lotteryType);}
}
async function homepageInitialData(env){
  const byType={1:[],5:[],8:[]};
  try{
    const content=await env.DB.prepare('SELECT * FROM content_items WHERE lottery_type IN (1,5,8) AND enabled=1 ORDER BY lottery_type,period DESC,sort_order,id LIMIT 1500').all();
    for(const row of content.results||[])(byType[validLotteryType(row.lottery_type)]||byType[5]).push(row);
  }catch(error){
    console.error('homepage_typed_content_failed',error?.message||error);
    const legacy=await env.DB.prepare('SELECT * FROM content_items WHERE enabled=1 ORDER BY period DESC,sort_order,id LIMIT 500').all();
    for(const type of [1,5,8])byType[type]=(legacy.results||[]).map(row=>({...row,lottery_type:type}));
  }
  let masters=[];try{await ensureMasterRosterSchema(env);masters=(await env.DB.prepare('SELECT id,name,avatar,rank_no,specialty FROM masters WHERE enabled=1 AND lottery_scope=0 ORDER BY rank_no,id').all()).results||[];}catch(error){console.error('homepage_masters_failed',error?.message||error);}
  return {contentByType:byType,masters};
}
const VALID_ZODIACS=new Set(['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪']);
const DRAW_CHECK_VERSION='v5-all-draw-zodiacs';
function normalizeDraw(payload){
  const draw=payload?.data||{},period=Number(draw.period||draw.intPeriod),numbers=Array.isArray(draw.numberList)?draw.numberList:[],special=numbers[numbers.length-1]||{},rawNumber=String(special.number??'').trim(),number=Number(rawNumber),zodiac=String(special.shengXiao??'').trim();
  const complete=Number.isInteger(period)&&period>0&&/^\d{1,2}$/.test(rawNumber)&&Number.isInteger(number)&&number>=1&&number<=49&&VALID_ZODIACS.has(zodiac);
  const allZodiacs=[...new Set(numbers.map(item=>String(item?.shengXiao||'').trim()).filter(item=>VALID_ZODIACS.has(item)))];
  return {draw,period,numbers,special:{...special,allZodiacs},number,zodiac,allZodiacs,complete};
}
async function logWaitingDraw(env,drawInfo){
  const latest=await env.DB.prepare("SELECT started_at FROM automation_runs WHERE task_key='result_check' AND status='waiting' ORDER BY id DESC LIMIT 1").first();
  if(latest&&Date.now()-Date.parse(String(latest.started_at).replace(' ','T')+'Z')<20*60*1000)return;
  const shown=String(drawInfo.special?.shengXiao??'')+String(drawInfo.special?.number??'');
  await env.DB.prepare("INSERT INTO automation_runs(task_key,period,status,message,finished_at) VALUES('result_check',?,'waiting',?,CURRENT_TIMESTAMP)").bind(drawInfo.period||null,'等待完整开奖结果'+(shown?'：'+shown:'')).run();
}
async function ensureFixedThreePeriodGroups(env){
  const version='fixed-groups-backfill-v3',saved=await env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='threeperiod_group_version' LIMIT 1").first();if(saved?.setting_value===version)return;
  const rows=await env.DB.prepare("SELECT id,period,content_json FROM content_items WHERE section_key='threeperiod' ORDER BY id").all(),seen=new Set(),changes=[];
  for(const row of rows.results||[]){const data=parseJson(row.content_json),issues=Array.isArray(data.issues)?data.issues.map(Number):[],start=issues[0],valid=issues.length===3&&issues[1]===start+1&&issues[2]===start+2&&((start-226)%3+3)%3===0;if(!valid||seen.has(start)){changes.push(env.DB.prepare('DELETE FROM content_items WHERE id=?').bind(row.id));continue;}seen.add(start);changes.push(env.DB.prepare('UPDATE content_items SET period=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(start+2,row.id));}
  if(changes.length)await env.DB.batch(changes);
  let row=await env.DB.prepare("SELECT id,content_json FROM content_items WHERE section_key='threeperiod' AND period=234 ORDER BY id LIMIT 1").first();
  if(!row){await generateNextPeriod(env,232,232);row=await env.DB.prepare("SELECT id,content_json FROM content_items WHERE section_key='threeperiod' AND period=234 ORDER BY id LIMIT 1").first();}
  if(row){const data=parseJson(row.content_json),pick=String(data.pick||'三期必中（马蛇龙兔）');await env.DB.prepare("UPDATE content_items SET content_json=?,result_text='待开奖',status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify({issues:[232,233,234],pick,opens:['开:？00','开:？00','开:？00']}),row.id).run();}
  const groups=await env.DB.prepare("SELECT id,content_json FROM content_items WHERE section_key='threeperiod' AND enabled=1 ORDER BY period,id").all();
  for(const group of groups.results||[]){
    const data=parseJson(group.content_json),issues=Array.isArray(data.issues)?data.issues.map(Number):[],opens=Array.isArray(data.opens)?[...data.opens]:[];if(issues.length!==3)continue;while(opens.length<issues.length)opens.push('开:？00');let changed=false;
    for(let index=0;index<issues.length;index++){
      if(!/\?|？|待开奖/.test(String(opens[index]||'')))continue;
      const settled=await env.DB.prepare("SELECT result_text FROM content_items WHERE lottery_type=5 AND period=? AND section_key<>'threeperiod' AND status IN ('win','lose') AND result_text NOT LIKE '%?%' AND result_text NOT LIKE '%？%' AND result_text<>'待开奖' ORDER BY id DESC LIMIT 1").bind(issues[index]).first();
      if(settled?.result_text){opens[index]=settled.result_text;changed=true;}
    }
    if(!changed)continue;data.opens=opens;const pick=String(data.pick||''),hit=opens.some(open=>[...VALID_ZODIACS].some(item=>pick.includes(item)&&String(open).includes(item))),finished=opens.every(open=>!/\?|？|待开奖/.test(String(open))),status=hit?'win':finished?'lose':'pending',lastResult=[...opens].reverse().find(open=>!/\?|？|待开奖/.test(String(open)))||'待开奖';await env.DB.prepare("UPDATE content_items SET content_json=?,result_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify(data),lastResult,status,group.id).run();
  }
  await env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('threeperiod_group_version',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(version).run();
}
async function runResultCheck(env,latestPayload=null){
  const created=await env.DB.prepare("INSERT INTO automation_runs(task_key,status,message) VALUES('result_check','running','正在读取澳门开奖结果')").run(),runId=created.meta.last_row_id;
  try{
    const payload=latestPayload||await fetchLatestLottery();
    const info=normalizeDraw(payload),{draw,period,special}=info;if(!info.complete)throw new Error('尚未取得完整开奖结果（需要01-49号码及正确生肖）');
    // Re-evaluate the whole period so an earlier live-draw placeholder cannot leave bad win/lose results behind.
    await ensureFixedThreePeriodGroups(env);
    await env.DB.batch([env.DB.prepare("UPDATE content_items SET result_text='待开奖',status='pending',updated_at=CURRENT_TIMESTAMP WHERE lottery_type=5 AND period=? AND enabled=1 AND section_key<>'threeperiod'").bind(period),env.DB.prepare("UPDATE master_posts SET result_text='待开奖',status='pending',updated_at=CURRENT_TIMESTAMP WHERE lottery_type=5 AND period=?").bind(period)]);
    const [content,posts]=await Promise.all([env.DB.prepare("SELECT * FROM content_items WHERE lottery_type=5 AND enabled=1 AND ((period=? AND status='pending') OR section_key='threeperiod')").bind(period).all(),env.DB.prepare("SELECT * FROM master_posts WHERE lottery_type=5 AND period=? AND status='pending'").bind(period).all()]);
    const updates=[],result='开:'+info.zodiac+String(info.number).padStart(2,'0');let checked=0;
    for(const row of content.results||[]){
      if(row.section_key==='threeperiod'){
        const data=parseJson(row.content_json),issues=Array.isArray(data.issues)?data.issues.map(Number):[],index=issues.indexOf(period);if(index<0)continue;const opens=Array.isArray(data.opens)?[...data.opens]:[];while(opens.length<issues.length)opens.push('开:？00');opens[index]=result;data.opens=opens;const pick=String(data.pick||''),hit=opens.some(open=>[...VALID_ZODIACS].some(item=>pick.includes(item)&&String(open).includes(item))),finished=opens.slice(0,issues.length).every(open=>!/\?|\uff1f|待开奖/.test(String(open))),status=hit?'win':finished?'lose':'pending';checked++;updates.push(env.DB.prepare('UPDATE content_items SET content_json=?,result_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(data),result,status,row.id));continue;
      }
      const verdict=evaluateContent(row,special);if(verdict===null)continue;checked++;updates.push(env.DB.prepare('UPDATE content_items SET result_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(result,verdict?'win':'lose',row.id));
    }
    for(const row of posts.results||[]){const verdict=evaluatePost(row,special);if(verdict===null)continue;checked++;updates.push(env.DB.prepare('UPDATE master_posts SET result_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(result,verdict?'win':'lose',row.id));}
    if(updates.length)await env.DB.batch(updates);const nextPeriod=Number(draw.nextLotteryNumber||draw.nextIntLotteryNumber||period+1),generated=await generateNextPeriod(env,nextPeriod,info.number),audit=await auditPeriod(env,nextPeriod),signature=DRAW_CHECK_VERSION+':'+period+':'+info.number+':'+info.zodiac;const message='核对完成：'+result+'；'+nextPeriod+'期生成资料'+generated.created+'条、高手帖子'+generated.posts+'条；质量检查'+(audit.passed?'通过':'发现'+audit.issues.length+'项问题');await env.DB.batch([env.DB.prepare("UPDATE automation_runs SET period=?,status='success',checked_count=?,updated_count=?,message=?,finished_at=CURRENT_TIMESTAMP WHERE id=?").bind(period,checked,updates.length,message,runId),env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('last_processed_draw',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(String(period)),env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('last_processed_draw_signature',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(signature)]);return {period,checked,updated:updates.length,result,nextPeriod,generated,audit};
  }catch(error){await env.DB.prepare("UPDATE automation_runs SET status='failed',message=?,finished_at=CURRENT_TIMESTAMP WHERE id=?").bind(cleanText(error?.message||'自动核对失败',500),runId).run();throw error;}
}
async function maybeRunResultCheck(env){
  const now=new Date(),minutes=now.getUTCHours()*60+now.getUTCMinutes();if(minutes<13*60+30||minutes>15*60+20)return;
  const row=await env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='last_auto_check' LIMIT 1").first(),last=Number(row?.setting_value||0);if(Date.now()-last<90000)return;
  await env.DB.prepare("INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES('last_auto_check',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(String(Date.now())).run();
  const payload=await fetchLatestLottery(),info=normalizeDraw(payload),period=info.period;if(!period)return;if(!info.complete){await logWaitingDraw(env,info);return;}
  const [processed,signature]=await Promise.all([env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='last_processed_draw' LIMIT 1").first(),env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key='last_processed_draw_signature' LIMIT 1").first()]),currentSignature=DRAW_CHECK_VERSION+':'+period+':'+info.number+':'+info.zodiac;if(Number(processed?.setting_value||0)>=period&&signature?.setting_value===currentSignature)return;
  await runResultCheck(env,payload);
}
async function syncAdditionalLotteryTypes(env){
  const names={1:'香港',8:'天天'};
  for(const lotteryType of [1,8]){
    const payload=await fetchLatestLottery(lotteryType),info=normalizeDraw(payload);
    if(!info.complete)continue;
    const {draw,period,special}=info,result='开:'+info.zodiac+String(info.number).padStart(2,'0');
    const [rows,posts]=await Promise.all([env.DB.prepare("SELECT * FROM content_items WHERE lottery_type=? AND enabled=1 AND period=? AND section_key<>'threeperiod'").bind(lotteryType,period).all(),env.DB.prepare("SELECT * FROM master_posts WHERE lottery_type=? AND period=?").bind(lotteryType,period).all()]),updates=[];
    for(const row of rows.results||[]){const verdict=evaluateContent(row,special);if(verdict===null)continue;updates.push(env.DB.prepare('UPDATE content_items SET result_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(result,verdict?'win':'lose',row.id));}
    for(const row of posts.results||[]){const verdict=evaluatePost(row,special);if(verdict===null)continue;updates.push(env.DB.prepare('UPDATE master_posts SET result_text=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(result,verdict?'win':'lose',row.id));}
    if(updates.length)await env.DB.batch(updates);
    const nextPeriod=Number(draw.nextLotteryNumber||draw.nextIntLotteryNumber||period+1),generated=await generateNextPeriod(env,nextPeriod,info.number,lotteryType);
    await env.DB.prepare("INSERT INTO automation_runs(task_key,period,status,checked_count,updated_count,message,finished_at) VALUES(?,?, 'success',?,?,?,CURRENT_TIMESTAMP)").bind('result_check_'+lotteryType,period,(rows.results||[]).length+(posts.results||[]).length,updates.length,names[lotteryType]+'核对完成：'+result+'；'+nextPeriod+'期生成资料'+generated.created+'条、高手帖子'+generated.posts+'条').run();
  }
}
async function runAllLotteryChecks(env){
  const macau=await runResultCheck(env);
  await syncAdditionalLotteryTypes(env);
  return macau;
}
async function handleWuqi(url){
  const types={1:'xg',5:'xam',8:'tt'},lotteryType=cleanInt(url.searchParams.get('lotteryType'),5),page=Math.min(100,Math.max(1,cleanInt(url.searchParams.get('page'),1))),type=types[lotteryType];
  if(!type)return json({success:false,message:'彩种参数错误'},422);
  try{
    const response=await fetch('https://lhw.235-from.com/index/wuqiapi/getwuqibizhong',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json','user-agent':'Mozilla/5.0'},body:new URLSearchParams({page:String(page),type})});
    if(!response.ok)throw new Error('HTTP '+response.status);return new Response(response.body,{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }catch(error){console.error('wuqi_fetch_failed',error?.message||error);return json({success:false,message:'五期必中接口暂时不可用'},502);}
}
async function kingThirtyRaw(env,lotteryType=5){
  const type={1:'xg',5:'xam',8:'tt'}[Number(lotteryType)]||'xam';
  try{const response=await env.KING_SITE.fetch(new Request('https://liuhe-king-site/api/materials?category=thirty&type='+type+'&page=1&pageSize=5',{headers:{accept:'application/json','cache-control':'no-cache'}}));return new Response(response.body,{status:response.status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}catch(error){console.error('king_thirty_raw_failed',error?.message||error);return json({success:false,message:'30码资料暂时不可用'},502);}
}
const materialList=payload=>{const arrays=[];const walk=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){if(node.length)arrays.push(node);node.forEach(walk);return;}Object.values(node).forEach(walk);};walk(payload);const scored=arrays.map(value=>({value,score:value.reduce((total,item)=>total+(item&&typeof item==='object'&&(item.period||item.issue||item.issueNo||item.intPeriod)?10:0),0)+Math.min(value.length,20)})).sort((a,b)=>b.score-a.score);return scored[0]?.value||[];};
const materialContent=item=>{let value=item?.content??item?.data??item?.value??{};if(typeof value==='string'){try{value=JSON.parse(value);}catch{}}return value;};
const materialScalars=value=>{const out=[];const walk=(node,path='')=>{if(node===null||node===undefined)return;if(typeof node!=='object'){out.push([path,node]);return;}if(Array.isArray(node)){node.forEach((item,index)=>walk(item,path+'['+index+']'));return;}for(const [key,item] of Object.entries(node))walk(item,path?path+'.'+key:key);};walk(value);return out;};
const materialStatus=(item,content)=>{const scalars=materialScalars({item,content}),raw=scalars.filter(([key,value])=>/status|state|check|verify|hit|核对|结果|result/i.test(key)||/[准错]|pending|win|lose|hit|miss|命中|未中/i.test(String(value))).map(([,value])=>String(value)).join('|').toLowerCase();if(/(^|\|)(win|hit|中)(\||$)/.test(raw)||raw.includes('准')||raw.includes('命中')||raw.includes('中奖'))return 'win';if(/(^|\|)(lose|miss)(\||$)/.test(raw)||raw.includes('错')||raw.includes('未中'))return 'lose';return 'pending';};
const materialHit=(item,content)=>{const candidates=materialScalars({item,content}).filter(([key,value])=>/hit|result|special|open|lottery|开奖|特码/i.test(key)||/[开准错]/.test(String(value))).map(([,value])=>value);for(const value of candidates){const matches=String(value??'').match(/(?:^|\D)(0?[1-9]|[1-4]\d)(?=\D|$)/g)||[];for(const token of matches){const number=Number(String(token).replace(/\D/g,''));if(number>=1&&number<=49)return String(number).padStart(2,'0');}}return '';};
const thirtyMaterial=item=>{const content=materialContent(item),raw=Array.isArray(content)?content:(content?.numbers||content?.numberList||item?.numbers||item?.numberList||[]),numberValues=Array.isArray(raw)?raw.map(value=>value?.number??value):String(typeof content==='string'?content:(item?.content??'')).match(/(?:^|\D)(0?[1-9]|[1-4]\d)(?=\D|$)/g)||[],numbers=numberValues.map(value=>Number(String(value).replace(/\D/g,''))).filter(number=>number>=1&&number<=49).slice(0,30),periodEntry=materialScalars(item).find(([key])=>/(^|\.)(period|issue|issueNo|intPeriod)$/i.test(key)),period=parseInt(String(item?.period||item?.issue||item?.issueNo||content?.period||periodEntry?.[1]||0),10)||0;let status=materialStatus(item,content),hit=materialHit(item,content);if(hit&&status==='pending')status=numbers.includes(Number(hit))?'win':'lose';return {period,numbers,status,hit,open:status==='pending'?'待开奖':'开:'+hit+(status==='win'?'准':'错')};};
async function kingForecasts(env,lotteryType=5){
  try{
    const type={1:'xg',5:'xam',8:'tt'}[Number(lotteryType)]||'xam',call=category=>env.KING_SITE.fetch(new Request('https://liuhe-king-site/api/materials?category='+category+'&type='+type+'&page=1&pageSize=5',{headers:{accept:'application/json','cache-control':'no-cache'}}));
    const [nineResponse,thirtyResponse]=await Promise.all([call('nine'),call('thirty')]);if(!thirtyResponse.ok)throw new Error('30码 HTTP '+thirtyResponse.status);
    const [ninePayload,thirtyPayload]=await Promise.all([nineResponse.ok?nineResponse.json():Promise.resolve({}),thirtyResponse.json()]),nineItems=materialList(ninePayload),thirtyItems=materialList(thirtyPayload),latestNine=nineItems[0]||{},latestThirty=thirtyItems[0]||{},nineContent=materialContent(latestNine),thirtyContent=materialContent(latestThirty);
    const period=Number(latestNine.period||latestNine.issue||latestNine.issueNo||latestThirty.period||latestThirty.issue||latestThirty.issueNo||0),rawRows=Array.isArray(nineContent)?nineContent:(nineContent.rows||nineContent.items||nineContent.recommendations||latestNine.rows||latestNine.recommendations||[]);
    const nine=rawRows.map((row,index)=>{const pick=Array.isArray(row.zodiacs)?row.zodiacs.join(''):String(row.pick||row.zodiac||row.zodiacs||row.content||'').replace(/[\s,，、]/g,''),label=row.kind||row.label||row.title||['③肖','⑤肖','⑦肖','⑨肖'][index]||'';const status=String(row.status||latestNine.status||'').toLowerCase();return {period:Number(row.period||period),kind:String(label),pick,status:status==='win'||status.includes('中')||status.includes('准')?'win':status==='lose'||status.includes('错')||status.includes('未中')?'lose':'pending'};}).filter(row=>row.kind&&row.pick).slice(0,4);
    const thirty=thirtyItems.map(thirtyMaterial).filter(row=>row.period&&row.numbers.length===30).slice(0,5),latestThirtyRow=thirty[0]||{},numbers=latestThirtyRow.numbers||[],thirtyPeriod=latestThirtyRow.period||0;let thirtyStatus=latestThirtyRow.status||'pending',thirtyHit=latestThirtyRow.hit||'';
    // The source may publish the new list before writing its verification fields. In that case,
    // settle this imported forecast with the same authoritative draw used by this site.
    if(thirtyStatus==='pending')try{const drawInfo=normalizeDraw(await fetchLatestLottery());if(drawInfo.complete&&drawInfo.period===thirtyPeriod){thirtyHit=String(drawInfo.number).padStart(2,'0');thirtyStatus=numbers.includes(drawInfo.number)?'win':'lose';}}catch(error){console.error('thirty_fallback_check_failed',error?.message||error);}
    const thirtyOpen=thirtyStatus==='pending'?'待开奖':'开:'+thirtyHit+(thirtyStatus==='win'?'准':'错');if(thirty[0])Object.assign(thirty[0],{status:thirtyStatus,hit:thirtyHit,open:thirtyOpen});
    if(!thirtyPeriod||numbers.length!==30)throw new Error('六合王30码接口结构暂不可识别');return json({success:true,data:{period:period||thirtyPeriod,nine,numbers,thirty,source:'KING_SITE:/api/materials'}});
  }catch(error){console.error('king_forecasts_failed',error?.message||error);return json({success:false,message:'六合王资料暂时不可用'},502);}
}

async function publicApi(request,env,url){
  if(url.pathname==='/api/public/lottery-latest'&&request.method==='GET'){
    const lotteryType=cleanInt(url.searchParams.get('lotteryType'),5);
    if(![1,5,8].includes(lotteryType))return json({success:false,message:'彩种参数错误'},422);
    try{
      const response=await fetch('https://6htv70.com/gallerynew/h5/index/lastLotteryRecord?lotteryType='+lotteryType,{headers:{accept:'application/json','user-agent':'Mozilla/5.0'}});
      if(!response.ok)throw new Error('HTTP '+response.status);
      return new Response(response.body,{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate','pragma':'no-cache','expires':'0'}});
    }catch(error){
      console.error('lottery_latest_failed',lotteryType,error?.message||error);
      return json({success:false,message:'开奖接口暂时不可用'},502,{'cache-control':'no-store'});
    }
  }
  if(url.pathname==='/api/public/king-forecasts'&&request.method==='GET')return kingForecasts(env,cleanInt(url.searchParams.get('lotteryType'),5));
  if(url.pathname==='/api/public/king-thirty-raw'&&request.method==='GET')return kingThirtyRaw(env,cleanInt(url.searchParams.get('lotteryType'),5));
  if(url.pathname==='/api/public/content'){
    await ensureFixedThreePeriodGroups(env);
    await auditStoredIdiomContent(env);
    const lotteryType=validLotteryType(url.searchParams.get('lotteryType')),section=cleanText(url.searchParams.get('section'),60);const period=cleanInt(url.searchParams.get('period'));
    let query='SELECT * FROM content_items WHERE lottery_type=? AND enabled=1';const binds=[lotteryType];
    if(section){query+=' AND section_key=?';binds.push(section);}if(period){query+=' AND period=?';binds.push(period);}
    query+=' ORDER BY period DESC,sort_order,id LIMIT 500';const result=await env.DB.prepare(query).bind(...binds).all();return json({success:true,data:result.results});
  }
  if(url.pathname==='/api/public/masters'){
    await ensureMasterCatalog(env);
    const lotteryType=validLotteryType(url.searchParams.get('lotteryType'));return json({success:true,data:await publicMasters(env,lotteryType)});
  }
  if(url.pathname==='/api/public/master-posts'){
    await ensureMasterCatalog(env);
    const lotteryType=validLotteryType(url.searchParams.get('lotteryType')),masterId=cleanInt(url.searchParams.get('masterId'));const period=cleanInt(url.searchParams.get('period'));
    let query='SELECT p.*,m.name,m.avatar,m.rank_no,m.specialty FROM master_posts p JOIN masters m ON m.id=p.master_id WHERE m.enabled=1 AND p.lottery_type=?';const binds=[lotteryType];
    if(masterId){query+=' AND p.master_id=?';binds.push(masterId);}if(period){query+=' AND p.period=?';binds.push(period);}
    query+=' ORDER BY p.period DESC,m.rank_no LIMIT 200';const result=await env.DB.prepare(query).bind(...binds).all();return json({success:true,data:result.results});
  }
  if(url.pathname==='/api/public/ads'){
    await ensureAdsSchema(env);
    const result=await env.DB.prepare("SELECT position_key,image_url,link_url,display_mode,delay_seconds,start_at,end_at FROM ads WHERE enabled=1 AND image_url<>'' AND (start_at IS NULL OR start_at='' OR start_at<=CURRENT_TIMESTAMP) AND (end_at IS NULL OR end_at='' OR end_at>=CURRENT_TIMESTAMP) ORDER BY CASE WHEN position_key='popup' THEN 0 WHEN position_key='banner' THEN 1 ELSE 2 END,position_key").all();
    const absoluteAd=item=>item&&({...item,image_url:/^\/ad-image\//.test(item.image_url)?'https://123-liuhe-site.xcx8088.workers.dev'+item.image_url:item.image_url});
    const rows=result.results||[],popup=absoluteAd(rows.find(item=>item.position_key==='popup')),banner=absoluteAd(rows.find(item=>item.position_key==='banner')||rows.find(item=>item.position_key!=='popup'));
    const data=[];if(banner){data.push({...banner,position_key:'banner'});for(let index=1;index<=20;index++)data.push({...banner,position_key:'home-'+index});data.push({...banner,position_key:'list'},{...banner,position_key:'detail'});}if(popup)data.push(popup);
    return json({success:true,data},200,{'access-control-allow-origin':'*'});
  }
  if(url.pathname==='/api/public/text-ads'){
    await ensureTextAdsSchema(env);
    const [texts,domains]=await Promise.all([
      env.DB.prepare("SELECT id,ad_text,text_color,sort_order FROM text_ads WHERE enabled=1 AND ad_text<>'' ORDER BY sort_order,id").all(),
      env.DB.prepare("SELECT id,domain_url,sort_order FROM text_ad_domains WHERE enabled=1 AND domain_url<>'' ORDER BY sort_order,id").all()
    ]);
    return json({success:true,data:texts.results||[],texts:texts.results||[],domains:domains.results||[]},200,{'access-control-allow-origin':'*'});
  }
  if(url.pathname==='/api/public/recommended-sites'){
    await ensureRecommendedSites(env);
    const result=await env.DB.prepare('SELECT id,name,site_url FROM recommended_sites WHERE enabled=1 ORDER BY sort_order,id').all();return json({success:true,data:result.results},200,{'access-control-allow-origin':'*'});
  }
  if(url.pathname==='/api/public/ad-event'&&request.method==='POST'){
    let input={};try{const type=request.headers.get('content-type')||'';if(type.includes('application/json'))input=await request.json();else input=Object.fromEntries(await request.formData());}catch{}
    const position=cleanText(input.position_key,80),event=String(input.event_type||'');if(!position||!['view','click'].includes(event))return json({success:false},400);
    const column=event==='click'?'clicks':'impressions';await env.DB.prepare('INSERT INTO ad_stats(position_key,'+column+',updated_at) VALUES(?,1,CURRENT_TIMESTAMP) ON CONFLICT(position_key) DO UPDATE SET '+column+'='+column+'+1,updated_at=CURRENT_TIMESTAMP').bind(position).run();return json({success:true});
  }
  return null;
}

const resources={
  content:{table:'content_items',fields:['lottery_type','section_key','period','title','content_json','result_text','status','sort_order','enabled']},
  masters:{table:'masters',fields:['name','avatar','rank_no','specialty','enabled']},
  posts:{table:'master_posts',fields:['lottery_type','master_id','period','content_json','result_text','status']},
  ads:{table:'ads',fields:['position_key','image_url','link_url','display_mode','delay_seconds','start_at','end_at','enabled']},
  textads:{table:'text_ads',fields:['ad_text','text_color','sort_order','enabled']},
  textdomains:{table:'text_ad_domains',fields:['domain_url','sort_order','enabled']},
  links:{table:'recommended_sites',fields:['name','site_url','sort_order','enabled']}
};
function normalize(resource,input){const output={};for(const field of resource.fields){if(!(field in input))continue;if(['period','sort_order','enabled','rank_no','master_id','delay_seconds'].includes(field))output[field]=cleanInt(input[field]);else if(field==='lottery_type')output[field]=validLotteryType(input[field]);else if(field==='status')output[field]=allowedStatus(input[field]);else if(['start_at','end_at'].includes(field))output[field]=cleanText(input[field],40).replace('T',' ');else output[field]=cleanText(input[field]);}if('site_url'in output&&!/^https?:\/\//i.test(output.site_url))delete output.site_url;return output;}

async function adminApi(request,env,url){
  if(url.pathname==='/api/admin/login'&&request.method==='POST'){
    if(!env.ADMIN_PASSWORD||!env.ADMIN_SESSION_SECRET)return json({success:false,message:'后台 Secret 尚未配置'},503);
    const input=await body(request);if(!input||!safeEqual(String(input.password||''),String(env.ADMIN_PASSWORD)))return json({success:false,message:'密码错误'},401);
    const token=await makeSession(env.ADMIN_SESSION_SECRET);return json({success:true},200,{'set-cookie':'admin_session='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800'});
  }
  if(url.pathname==='/api/admin/logout'&&request.method==='POST')return json({success:true},200,{'set-cookie':'admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
  if(!(await validSession(request,env.ADMIN_SESSION_SECRET)))return json({success:false,message:'请先登录'},401);
  if(url.pathname==='/api/admin/session')return json({success:true});
  if(url.pathname==='/api/admin/ad-upload'&&request.method==='POST'){
    const form=await request.formData(),file=form.get('image');if(!(file instanceof File)||!file.size)return json({success:false,message:'请选择广告图片'},400);
    if(file.size>5*1024*1024)return json({success:false,message:'图片不能超过 5MB'},422);
    const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};if(!types[file.type])return json({success:false,message:'只支持 JPG、PNG、WebP、GIF'},422);
    const key='ads/'+Date.now()+'-'+crypto.randomUUID()+'.'+types[file.type];await env.AD_IMAGES.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type},customMetadata:{uploadedAt:new Date().toISOString()}});return json({success:true,url:'/ad-image/'+key});
  }
  if(url.pathname==='/api/admin/dashboard'&&request.method==='GET'){
    const [content,masters,posts,ads,recent]=await Promise.all([
      env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) enabled,SUM(CASE WHEN status='win' THEN 1 ELSE 0 END) wins FROM content_items").first(),
      env.DB.prepare('SELECT COUNT(*) total,SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) enabled FROM masters').first(),
      env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='win' THEN 1 ELSE 0 END) wins FROM master_posts").first(),
      env.DB.prepare('SELECT COUNT(*) total,SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) enabled FROM ads').first(),
      env.DB.prepare('SELECT id,section_key,period,title,status,enabled,updated_at FROM content_items ORDER BY updated_at DESC,id DESC LIMIT 8').all()
    ]);
    return json({success:true,data:{content,masters,posts,ads,recent:recent.results||[]}});
  }
  if(url.pathname==='/api/admin/settings'){
    if(request.method==='GET'){const result=await env.DB.prepare('SELECT setting_key,setting_value,updated_at FROM site_settings ORDER BY setting_key').all();return json({success:true,data:result.results});}
    if(request.method==='PUT'){
      const input=(await body(request))||{},allowed=['site_name','site_domain','site_slogan'];
      for(const key of allowed){if(key in input)await env.DB.prepare('INSERT INTO site_settings(setting_key,setting_value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP').bind(key,cleanText(input[key],200)).run();}
      return json({success:true});
    }
    return json({success:false,message:'请求方式不支持'},405);
  }
  if(url.pathname==='/api/admin/analytics'&&request.method==='GET'){
    const [totals,today,visitors]=await Promise.all([
      env.DB.prepare('SELECT COALESCE(SUM(views),0) views,COALESCE(SUM(unique_visitors),0) daily_uniques FROM analytics_daily').first(),
      env.DB.prepare("SELECT COALESCE(views,0) views,COALESCE(unique_visitors,0) unique_visitors FROM analytics_daily WHERE visit_date=date('now')").first(),
      env.DB.prepare('SELECT ip_address,country,region_name,city,views,first_seen,last_seen FROM analytics_visitors ORDER BY last_seen DESC LIMIT 300').all()
    ]);
    const unique=await env.DB.prepare('SELECT COUNT(*) total FROM analytics_visitors').first();
    return json({success:true,data:{total_views:totals?.views||0,total_unique:unique?.total||0,today_views:today?.views||0,today_unique:today?.unique_visitors||0,visitors:visitors.results||[]}});
  }
  if(url.pathname==='/api/admin/analytics/clear'&&request.method==='POST'){
    await env.DB.batch([env.DB.prepare('DELETE FROM analytics_uniques'),env.DB.prepare('DELETE FROM analytics_daily'),env.DB.prepare('DELETE FROM analytics_visitors')]);return json({success:true});
  }
  if(url.pathname==='/api/admin/analytics/export'&&request.method==='GET'){
    const result=await env.DB.prepare('SELECT ip_address,country,region_name,city,views,first_seen,last_seen FROM analytics_visitors ORDER BY last_seen DESC').all(),q=value=>'"'+String(value??'').replaceAll('"','""')+'"',csv='\ufeffIP,国家/地区,省份/州,城市,访问次数,首次访问,最后访问\n'+(result.results||[]).map(row=>[row.ip_address,row.country,row.region_name,row.city,row.views,row.first_seen,row.last_seen].map(q).join(',')).join('\n');
    return new Response(csv,{headers:{'content-type':'text/csv;charset=utf-8','content-disposition':'attachment; filename=123lh-visitor-statistics.csv','cache-control':'no-store'}});
  }
  if(url.pathname==='/api/admin/automation'&&request.method==='GET'){const result=await env.DB.prepare('SELECT * FROM automation_runs ORDER BY id DESC LIMIT 50').all();return json({success:true,data:result.results});}
  if(url.pathname==='/api/admin/automation/audit'&&request.method==='GET'){return json({success:true,data:await auditPeriod(env,cleanInt(url.searchParams.get('period')))});}
  if(url.pathname==='/api/admin/automation/run'&&request.method==='POST'){try{return json({success:true,data:await runAllLotteryChecks(env)});}catch(error){return json({success:false,message:cleanText(error?.message||'自动核对失败',500)},502);}}
  const bulkDelete=url.pathname.match(/^\/api\/admin\/(textads|textdomains)\/bulk-delete$/);
  if(bulkDelete&&request.method==='POST'){
    await ensureTextAdsSchema(env);const input=(await body(request))||{},ids=[...new Set((Array.isArray(input.ids)?input.ids:[]).map(value=>cleanInt(value)).filter(value=>value>0))];if(!ids.length)return json({success:false,message:'请选择要删除的内容'},422);
    const table=bulkDelete[1]==='textads'?'text_ads':'text_ad_domains';for(let offset=0;offset<ids.length;offset+=50){const chunk=ids.slice(offset,offset+50);await env.DB.prepare('DELETE FROM '+table+' WHERE id IN ('+chunk.map(()=>'?').join(',')+')').bind(...chunk).run();}return json({success:true,count:ids.length});
  }
  const match=url.pathname.match(/^\/api\/admin\/(content|masters|posts|ads|textads|textdomains|links)(?:\/(\d+))?$/);if(!match)return null;
  const resource=resources[match[1]],id=cleanInt(match[2]);
  if(match[1]==='links')await ensureRecommendedSites(env);
  if(match[1]==='ads')await ensureAdsSchema(env);
  if(['textads','textdomains'].includes(match[1]))await ensureTextAdsSchema(env);
  if(request.method==='GET'){if(match[1]==='ads'){await env.DB.prepare("INSERT OR IGNORE INTO ads(position_key,image_url,link_url,display_mode,delay_seconds,start_at,end_at,enabled) SELECT 'banner',image_url,link_url,display_mode,delay_seconds,start_at,end_at,enabled FROM ads WHERE position_key<>'popup' AND image_url<>'' ORDER BY CASE WHEN position_key='home-1' THEN 0 ELSE 1 END,id LIMIT 1").run();const result=await env.DB.prepare("SELECT a.*,COALESCE(s.impressions,0) impressions,COALESCE(s.clicks,0) clicks FROM ads a LEFT JOIN ad_stats s USING(position_key) WHERE a.position_key IN ('banner','popup') ORDER BY CASE WHEN a.position_key='banner' THEN 0 ELSE 1 END").all();return json({success:true,data:result.results});}const order=match[1]==='masters'?'rank_no,id':['links','textads','textdomains'].includes(match[1])?'sort_order,id':'id DESC';const result=await env.DB.prepare('SELECT * FROM '+resource.table+' ORDER BY '+order+' LIMIT 500').all();return json({success:true,data:result.results});}
  if(request.method==='POST'){
    const raw=(await body(request))||{};if(match[1]==='links'&&(!cleanText(raw.name,100)||!/^https?:\/\//i.test(cleanText(raw.site_url))))return json({success:false,message:'请填写网站名称和以 http:// 或 https:// 开头的网址'},422);
    if(match[1]==='textads'){
      const values=String(raw.ad_text||'').split(/\r?\n/).map(value=>cleanText(value,500).replace(/^\*\*(.*?)\*\*$/,'$1').trim()).filter(Boolean);if(!values.length)return json({success:false,message:'请填写广告词，每行一条'},422);
      const base=cleanInt(raw.sort_order),color=/^#[0-9a-f]{6}$/i.test(String(raw.text_color||''))?String(raw.text_color):'#f2cf68',enabled=cleanInt(raw.enabled,1);
      await env.DB.batch(values.map((value,index)=>env.DB.prepare('INSERT INTO text_ads(ad_text,text_color,sort_order,enabled) VALUES(?,?,?,?)').bind(value,color,base+index,enabled)));return json({success:true,count:values.length});
    }
    if(match[1]==='textdomains'){
      const values=[...new Set(String(raw.domain_url||'').split(/\r?\n/).map(value=>cleanText(value,1000)).filter(value=>/^https?:\/\//i.test(value)))];if(!values.length)return json({success:false,message:'请填写以 http:// 或 https:// 开头的域名，每行一个'},422);
      const base=cleanInt(raw.sort_order),enabled=cleanInt(raw.enabled,1);await env.DB.batch(values.map((value,index)=>env.DB.prepare('INSERT OR IGNORE INTO text_ad_domains(domain_url,sort_order,enabled) VALUES(?,?,?)').bind(value,base+index,enabled)));return json({success:true,count:values.length});
    }
    if(match[1]==='ads'&&raw.position_key!=='popup')raw.position_key='banner';
    const input=normalize(resource,raw);const fields=Object.keys(input);if(!fields.length)return json({success:false,message:'没有可保存的内容'},400);
    if(match[1]==='ads'){
      if(!input.position_key)return json({success:false,message:'请选择广告位置'},422);const updates=fields.filter(field=>field!=='position_key');
      const sql='INSERT INTO ads ('+fields.join(',')+') VALUES ('+fields.map(()=>'?').join(',')+') ON CONFLICT(position_key) DO UPDATE SET '+updates.map(field=>field+'=excluded.'+field).join(',')+(updates.length?',':'')+'updated_at=CURRENT_TIMESTAMP';
      const result=await env.DB.prepare(sql).bind(...fields.map(field=>input[field])).run(),saved=await env.DB.prepare('SELECT id FROM ads WHERE position_key=?').bind(input.position_key).first();return json({success:true,id:saved?.id||result.meta.last_row_id});
    }
    const result=await env.DB.prepare('INSERT INTO '+resource.table+' ('+fields.join(',')+') VALUES ('+fields.map(()=>'?').join(',')+')').bind(...fields.map(field=>input[field])).run();return json({success:true,id:result.meta.last_row_id});
  }
  if(request.method==='PUT'&&id){
    const raw=(await body(request))||{};if(match[1]==='links'&&'site_url'in raw&&!/^https?:\/\//i.test(cleanText(raw.site_url)))return json({success:false,message:'网址必须以 http:// 或 https:// 开头'},422);const input=normalize(resource,raw);const fields=Object.keys(input);if(!fields.length)return json({success:false,message:'没有可更新的内容'},400);
    await env.DB.prepare('UPDATE '+resource.table+' SET '+fields.map(field=>field+'=?').join(',')+',updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(...fields.map(field=>input[field]),id).run();return json({success:true});
  }
  if(request.method==='DELETE'&&id){await env.DB.prepare('DELETE FROM '+resource.table+' WHERE id=?').bind(id).run();return json({success:true});}
  return json({success:false,message:'请求方式不支持'},405);
}

export default {async scheduled(controller,env,ctx){
  ctx.waitUntil(Promise.all([
    maybeRunResultCheck(env).catch(error=>console.error('scheduled_result_check_failed',error?.stack||error?.message||error)),
    syncAdditionalLotteryTypes(env).catch(error=>console.error('scheduled_additional_types_failed',error?.stack||error?.message||error))
  ]));
},async fetch(request,env,ctx){
  try{
    const url=new URL(request.url);
    if(url.pathname==='/wuqi-data.php'&&request.method==='GET')return maybeEncryptJsonResponse(request,await handleWuqi(url));
    if(url.pathname==='/api/chat/v1'&&(request.method==='GET'||request.method==='POST')){const target=new URL('https://xinshui-chat-api.jijin888888.workers.dev/v1/chat');target.search=url.search;return maybeEncryptJsonResponse(request,await fetch(new Request(target.toString(),request)));}
    if(url.pathname.startsWith('/ad-image/')){const key=decodeURIComponent(url.pathname.slice('/ad-image/'.length)),object=await env.AD_IMAGES.get(key);if(!object)return new Response('Not found',{status:404});return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'application/octet-stream','cache-control':'public,max-age=31536000,immutable','x-content-type-options':'nosniff'}});}
    if(url.pathname.startsWith('/api/public/')){const response=await publicApi(request,env,url);if(response)return maybeEncryptJsonResponse(request,response);}
    if(url.pathname.startsWith('/api/admin/')){const response=await adminApi(request,env,url);if(response)return response;}
    if(request.method==='GET'&&!url.pathname.startsWith('/admin')&&!url.pathname.startsWith('/api/')&&(request.headers.get('accept')||'').includes('text/html'))ctx.waitUntil(Promise.all([trackVisit(request,env).catch(()=>{}),maybeRunResultCheck(env).catch(()=>{})]));
    const asset=await env.ASSETS.fetch(request);
    if(request.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')&&asset.ok){
      try{const initial=await homepageInitialData(env),serialized=JSON.stringify(initial).replace(/</g,'\\u003c');let html=await asset.clone().text();html=html.replace('<script src="backend-sync.js?v=87"></script>','<script id="initialBackendData" type="application/json">'+serialized+'</script><script src="backend-sync.js?v=87"></script>');const headers=new Headers(asset.headers);headers.set('content-type','text/html; charset=utf-8');headers.set('cache-control','no-store');return maybeEncryptHtmlResponse(new Response(html,{status:asset.status,headers}));}catch(error){console.error('homepage_initial_data_failed',error?.message||error);}
    }
    if(request.method==='GET'&&(url.pathname==='/admin'||url.pathname==='/admin.html')&&asset.ok){
      let html=await asset.text();
      html=html.replace('管理广告位置、投放时间、展示与点击统计','统一管理三个网站广告：一张横幅图用于全部横幅位置，弹窗单独设置').replace("['position_key','广告位置','adposition']","['position_key','广告类型','adposition']");
      const oldAdOptions=`<option value="popup">首页弹窗广告</option>'+Array.from({length:16},(_,i)=>'<option value="home-'+(i+1)+'">首页板块广告 '+(i+1)+'</option>').join('')+'<option value="list">列表页广告</option><option value="detail">内容页广告</option>`;
      html=html.replace(oldAdOptions,'<option value="banner">全站横幅广告（所有位置共用）</option><option value="popup">首页弹窗广告</option>');
      const headers=new Headers(asset.headers);headers.set('content-type','text/html; charset=utf-8');headers.set('cache-control','no-store');return maybeEncryptHtmlResponse(new Response(html,{status:asset.status,headers}));
    }
    return maybeEncryptHtmlResponse(asset);
  }catch(error){
    console.error('request_failed',new URL(request.url).pathname,error?.stack||error?.message||error);
    const path=new URL(request.url).pathname,isAdmin=path.startsWith('/api/admin/'),detail=cleanText(error?.message||'',240);
    return json({success:false,message:isAdmin&&detail?'处理失败：'+detail:'服务器处理失败'},500);
  }
}};
