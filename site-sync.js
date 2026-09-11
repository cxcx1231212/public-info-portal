(function () {
  'use strict';
  const validTypes = [1, 5, 8];
  const sectionKeys = ['history','yixiao','erxiao','sanxiao','liuxiao','tema','weishu','sanzhongsan','erzhonger','chengyu'];
  const currentType = () => {
    const value = Number(localStorage.getItem('lotteryType'));
    return validTypes.includes(value) ? value : 1;
  };
  const cleanContent=value=>String(value||'').replace(/\s*·?\s*回测\s*$/,'').trim();
  const splitValues = value => cleanContent(value).split(/[\s,，、·・]+/).filter(Boolean);
  const parseIdiomContent = content => {
    const clean=cleanContent(content);
    const parts=clean.split('｜');
    return {idiom:(parts[0]||'成语推荐').trim(),zodiacs:(parts.slice(1).join('｜')||'').trim()};
  };
  const api = (section, lotteryType=currentType()) => fetch('api/data.php?lotteryType=' + lotteryType + '&section=' + encodeURIComponent(section) + '&limit=500', {cache:'no-store'}).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(data => data && data.success ? data : Promise.reject(new Error('Invalid response')));
  const wuqiApi = (page=1,lotteryType=currentType()) => fetch('wuqi-data.php?lotteryType='+lotteryType+'&page='+page,{cache:'no-store'}).then(r=>{
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }).then(data=>Array.isArray(data&&data.data)?data:Promise.reject(new Error('Invalid response')));
  const wuqiCache=new Map();
  const wuqiAll=lotteryType=>{
    if(wuqiCache.has(lotteryType))return Promise.resolve(wuqiCache.get(lotteryType));
    return wuqiApi(1,lotteryType).then(first=>{
      const pages=Math.max(1,Number(first.pages)||1);const jobs=[];for(let page=2;page<=pages;page++)jobs.push(wuqiApi(page,lotteryType));
      return Promise.all(jobs).then(rest=>{const seen=new Set();const records=[...(first.data||[]),...rest.flatMap(item=>item.data||[])].filter(item=>{const key=String(item.id||item.issueNo||'');if(!key||seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>Number(b.issueNo||0)-Number(a.issueNo||0));const result={...first,data:records};wuqiCache.set(lotteryType,result);return result;});
    });
  };
  function track(section) {
    const type=currentType(); const device=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)||innerWidth<760?'mobile':'desktop';
    const key='visit:'+new Date().toISOString().slice(0,10)+':'+type+':'+section+':'+location.pathname;
    if(sessionStorage.getItem(key)) return;
    const body=new URLSearchParams({lottery_type:String(type),section_key:section,device});
    fetch('api/track.php',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),keepalive:true}).then(response=>{
      if(response.ok) sessionStorage.setItem(key,'1');
    }).catch(()=>{});
  }
  const latestByName = records => {
    const map = new Map();
    records.forEach(record => { if (!map.has(record.source_name)) map.set(record.source_name, record); });
    return map;
  };
  const setTokens = (node, content, className) => {
    if (!node) return;
    node.textContent = '';
    splitValues(content).forEach(value => {
      const span = document.createElement('span');
      if (className) span.className = className;
      span.textContent = value;
      node.appendChild(span);
    });
  };
  const drawNumberCache=new Map();
  const periodKey=value=>{const digits=String(value||'').replace(/\D/g,'');const short=digits.length>3?digits.slice(-3):digits;return String(Number(short)||'');};
  async function drawNumbersFor(periods){
    const wanted=new Set(periods.map(periodKey).filter(Boolean));
    const found=new Map();
    wanted.forEach(period=>{const key=currentType()+':'+period;if(drawNumberCache.has(key))found.set(period,drawNumberCache.get(key));});
    const missing=()=>[...wanted].filter(period=>!found.has(period));
    if(!missing().length)return found;
    const year=new Date().getFullYear();
    for(let page=1;page<=4&&missing().length;page++){
      try{
        const response=await fetch('https://6htv70.com/gallerynew/h5/lottery/search?pageNum='+page+'&year='+year+'&sort=1&lotteryType='+currentType(),{cache:'no-store',mode:'cors'});
        if(!response.ok)break;
        const payload=await response.json();
        const records=payload&&payload.data&&Array.isArray(payload.data.recordList)?payload.data.recordList:[];
        records.forEach(record=>{const period=periodKey(record.period);const numbers=new Set((record.numberList||[]).slice(0,7).map(item=>String(item.number||'').padStart(2,'0')));if(period&&numbers.size){drawNumberCache.set(currentType()+':'+period,numbers);if(wanted.has(period))found.set(period,numbers);}});
        if(!records.length)break;
      }catch(_){break;}
    }
    return found;
  }
  const isNumberSection=section=>section==='sanzhongsan'||section==='erzhonger';
  const numberLimit=section=>section==='sanzhongsan'?10:section==='erzhonger'?16:49;
  function showEmpty(node,text='暂无资料'){
    if(!node)return;node.textContent='';const empty=document.createElement('div');empty.className='material-empty';empty.textContent=text;node.appendChild(empty);
  }
  function setNumberBalls(node,content,winning,limit=49){
    node.textContent='';node.classList.add('number-value');const row=document.createElement('span');row.className='number-row three-number-row';
    splitValues(content).filter(value=>/^\d{1,2}$/.test(value)).slice(0,limit).forEach(value=>{const number=value.padStart(2,'0');const matched=winning&&winning.has(number);const ball=document.createElement('span');ball.className='mini-ball three-ball'+(matched?' matched':'');ball.textContent=number;if(matched){const check=document.createElement('i');check.className='number-hit-check';check.textContent='✓';check.setAttribute('aria-label','命中');ball.appendChild(check);}row.appendChild(ball);});
    node.appendChild(row);
  }
  async function updateHomepageSection(section, data) {
    const link = document.querySelector('.section .more[href="' + section + '.html"]');
    const panel = link && link.closest('.section');
    if (!panel) return;
    if(!data.records.length){panel.querySelectorAll('.material,.six-row,.tail,.combo-card,.idiom').forEach(card=>card.hidden=true);return;}
    const currentPeriod=Math.max(...data.records.map(record=>Number(record.period)||0));
    const latest = latestByName(data.records.filter(record=>(Number(record.period)||0)===currentPeriod));
    const countNode = panel.querySelector('.section-title .count');
    if (countNode && (countNode.textContent.includes('统计中') || /共\d+份资料/.test(countNode.textContent))) countNode.textContent = '（共' + latest.size + '份资料）';
    const available = [...latest.values()].sort((a,b)=>{const sa=data.stats[a.source_name]||{accuracy:0,hits:0};const sb=data.stats[b.source_name]||{accuracy:0,hits:0};return sb.accuracy-sa.accuracy||sb.hits-sa.hits||a.source_name.localeCompare(b.source_name,'zh-CN');});
    const used = new Set();
    const drawMap=isNumberSection(section)?await drawNumbersFor([...latest.values()].map(record=>record.period)):new Map();
    panel.querySelectorAll('.material,.six-row,.tail,.combo-card,.idiom').forEach(card => {
      const nameNode = card.querySelector('.name,strong,.title');
      const record = available.find(item => !used.has(item.source_name));
      if (!record) return;
      used.add(record.source_name);
      card.hidden=false;
      const display=section==='chengyu'?parseIdiomContent(record.content):{idiom:record.source_name,zodiacs:record.content};
      const detailUrl=section+'-1.html?source='+encodeURIComponent(record.source_name);
      card.style.cursor='pointer';card.setAttribute('role','link');card.tabIndex=0;card.setAttribute('aria-label','查看 '+record.source_name+' 往期记录');
      card.onclick=event=>{if(event.target.closest('a,button'))return;location.href=detailUrl;};
      card.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();location.href=detailUrl;}};
      if (nameNode) nameNode.textContent = display.idiom;
      if(section==='chengyu'){
        const periodTag=card.querySelector('.period-tag'); if(periodTag) periodTag.textContent='第'+record.period+'期';
        const lines=card.querySelectorAll('.line');
        if(lines[0]) lines[0].textContent=display.zodiacs;
        if(lines[1]) lines[1].textContent='推荐生肖：'+display.zodiacs.replace(/^解肖：/,'').replace(/[・、，]/g,' ');
        return;
      }
      const plain = card.querySelector('.pick,.value,.line.green,.line');
      const combo = card.querySelector('.combo-nums');
      if (combo) {
        if(isNumberSection(section))setNumberBalls(combo,record.content,drawMap.get(periodKey(record.period)),numberLimit(section));
        else setTokens(combo, record.content, 'combo-num');
        const chip = card.querySelector('.chip');
        if (chip) chip.textContent = '共' + splitValues(record.content).length + '码';
      } else if (plain && card.classList.contains('six-row')) {
        setTokens(plain, record.content, '');
      } else if (plain) {
        plain.textContent = section==='chengyu'?display.zodiacs:cleanContent(record.content);
      }
    });
  }
  function updateFive(data) {
    const grid = document.getElementById('fiveHistoryGrid');
    if (!grid || !data.records.length) return;
    const source = data.records[0].source_name;
    const records = data.records.filter(r => r.source_name === source).slice(0, 5);
    if (!records.length) return;
    grid.textContent = '';
    records.forEach(record => {
      const row = document.createElement('div'); row.className = 'five-row';
      const issue = document.createElement('div'); issue.className = 'issue'; issue.textContent = record.period + '期';
      const nums = document.createElement('div'); nums.className = 'numline';
      splitValues(record.content).forEach(value => { const n=document.createElement('span'); n.className='num'; n.textContent=value; nums.appendChild(n); });
      row.append(issue, nums);
      if (record.hit_status !== 'pending') {
        const result=document.createElement('div'); result.className='five-result'; result.append('开奖特码 ' + (record.result_special || '-'));
        const strong=document.createElement('strong'); strong.className=record.hit_status==='hit'?'win':'lose'; strong.textContent=record.hit_status==='hit'?'命中':'未中'; result.appendChild(strong); row.appendChild(result);
      }
      grid.appendChild(row);
    });
  }
  function updateFiveWuqi(payload){
    const grid=document.getElementById('fiveHistoryGrid');
    const nav=document.querySelector('.five-history-nav');
    const records=Array.isArray(payload.data)?payload.data:[];
    if(!grid||!nav||!records.length)return;
    const groups=[];for(let i=0;i<records.length;i+=5)groups.push(records.slice(i,i+5));
    const periodOf=item=>String(item.issueNo||'').slice(-3);
    const render=groupIndex=>{
      grid.textContent='';
      (groups[groupIndex]||[]).forEach(item=>{
        const numbers=String(item.haoma||'').split(/[,，\s]+/).filter(Boolean).map(n=>n.padStart(2,'0'));
        const special=item.tema==null||item.tema===''?'':String(item.tema).padStart(2,'0');
        const row=document.createElement('div');row.className='five-row';
        const issue=document.createElement('div');issue.className='issue';issue.textContent=periodOf(item)+'期';
        const nums=document.createElement('div');nums.className='numline';numbers.forEach(value=>{const n=document.createElement('span');n.className='num'+(special===value?' hit':'');n.textContent=value;nums.appendChild(n);});
        row.append(issue,nums);
        const result=document.createElement('div');result.className='five-result';
        if(special){result.append('开奖特码 '+special);const won=numbers.includes(special);const strong=document.createElement('strong');strong.className=won?'win':'lose';strong.textContent=won?'命中':'未中';result.appendChild(strong);}else{result.classList.add('pending');result.textContent='未开奖';}
        row.appendChild(result);
        grid.appendChild(row);
      });
      [...nav.children].forEach((button,index)=>button.classList.toggle('active',index===groupIndex));
    };
    nav.textContent='';groups.forEach((group,index)=>{if(!group.length)return;const button=document.createElement('button');button.type='button';button.textContent=periodOf(group[0])+'–'+periodOf(group[group.length-1])+'期';button.addEventListener('click',()=>render(index));nav.appendChild(button);});
    render(0);
  }
  let homepageRenderToken=0;
  function renderHomepage() {
    const requestedType=currentType();
    const renderToken=++homepageRenderToken;
    const fiveGrid=document.getElementById('fiveHistoryGrid');
    if(fiveGrid)showEmpty(fiveGrid,'正在加载当期资料…');
    ['yixiao','erxiao','sanxiao','liuxiao','weishu','sanzhongsan','erzhonger','chengyu'].forEach(section => {
      const more=document.querySelector('.section .more[href="'+section+'.html"]');
      const panel=more&&more.closest('.section');
      if(!panel)return;
      const openList=event=>{if(event.target.closest('a,button'))return;location.href=section+'.html';};
      const title=panel.querySelector('.section-title .left');
      if(title){title.style.cursor='pointer';title.setAttribute('role','link');title.tabIndex=0;title.onclick=openList;title.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();location.href=section+'.html';}};}
      panel.querySelectorAll('.material,.six-row,.tail,.combo-card,.idiom').forEach(card=>{card.hidden=true;card.style.cursor='pointer';card.setAttribute('role','link');card.tabIndex=0;card.onclick=openList;card.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();location.href=section+'.html';}};});
    });
    sectionKeys.filter(section=>section!=='tema').forEach(section => api(section,requestedType).then(data => {
      if(renderToken!==homepageRenderToken||currentType()!==requestedType)return;
      return updateHomepageSection(section,data);
    }).catch(() => {}));
    wuqiAll(requestedType).then(data=>{if(renderToken===homepageRenderToken&&currentType()===requestedType)updateFiveWuqi(data);}).catch(()=>{});
  }
  function renderList(section) {
    showEmpty(document.querySelector('.inner-list'),'正在加载资料…');
    api(section).then(async data => {
      const currentPeriod=Math.max(...data.records.map(record=>Number(record.period)||0));
      const latest = latestByName(data.records.filter(record=>(Number(record.period)||0)===currentPeriod));
      if (!latest.size){showEmpty(document.querySelector('.inner-list'));return;}
      const list = document.querySelector('.inner-list'); list.textContent = '';
      const ordered=[...latest.entries()].sort(([nameA],[nameB])=>{const a=data.stats[nameA]||{accuracy:0,hits:0};const b=data.stats[nameB]||{accuracy:0,hits:0};return b.accuracy-a.accuracy||b.hits-a.hits||nameA.localeCompare(nameB,'zh-CN');});
      const drawMap=isNumberSection(section)?await drawNumbersFor([...latest.values()].map(record=>record.period)):new Map();
      ordered.forEach(([name,record]) => {
        const display=section==='chengyu'?parseIdiomContent(record.content):{idiom:name,zodiacs:record.content};
        const row=document.createElement('a'); row.className='inner-row has-stats'+(isNumberSection(section)?' number-list-row':''); row.href=section+'-1.html?source='+encodeURIComponent(name);
        const nameNode=document.createElement('span'); nameNode.className='inner-name'; nameNode.textContent=display.idiom;
        const side=document.createElement('span'); side.className='row-side';
        const value=document.createElement('span'); value.className='inner-value';
        if(isNumberSection(section))setNumberBalls(value,record.content,drawMap.get(periodKey(record.period)),numberLimit(section));
        else value.textContent=section==='chengyu'?display.zodiacs:cleanContent(record.content);
        const badge=document.createElement('span'); badge.className='accuracy-badge'; const stat=data.stats[name]||{accuracy:0,hits:0,settled:0}; badge.textContent=stat.settled+'期中'+stat.hits+'期';
        side.append(value,badge); row.append(nameNode,side); list.appendChild(row);
      });
    }).catch(() => showEmpty(document.querySelector('.inner-list')));
  }
  function renderDetail(section) {
    const params = new URLSearchParams(location.search);
    const source = params.get('source') || (document.querySelector('.inner-title') || {}).textContent || '';
    const title = document.querySelector('.inner-title'); if (title && params.get('source')) title.textContent = section==='chengyu'?'成语往期记录':source;
    showEmpty(document.querySelector('.inner-list'),'正在加载资料…');
    api(section).then(async data => {
      const records = data.records.filter(r => r.source_name === source.trim());
      if (!records.length){showEmpty(document.querySelector('.inner-list'));return;}
      const stat = data.stats[source.trim()] || {hits:0,settled:0,accuracy:0};
      const statNodes = document.querySelectorAll('.stats-card .stat strong');
      const statLabels = document.querySelectorAll('.stats-card .stat span');
      let streak=0;for(const record of records){if(record.hit_status==='pending')continue;if(record.hit_status==='hit')streak++;else break;}
      if (statNodes[0]) statNodes[0].textContent = stat.hits + '期';
      if (statNodes[1]) statNodes[1].textContent = stat.settled + '期中' + stat.hits + '期';
      if (statNodes[2]) statNodes[2].textContent = streak + '期';
      if (statNodes[3]) statNodes[3].textContent = stat.settled + '期';
      if (statLabels[0]) statLabels[0].textContent = '命中期数';
      if (statLabels[1]) statLabels[1].textContent = '命中情况';
      const list = document.querySelector('.inner-list'); list.textContent='';
      const drawMap=isNumberSection(section)?await drawNumbersFor(records.map(record=>record.period)):new Map();
      records.forEach(record => {
        const row=document.createElement('div'); row.className='record'+(isNumberSection(section)?' number-record-row':'');
        const period=document.createElement('span'); period.className='period'; period.textContent='第'+record.period+'期';
        const value=document.createElement('span'); value.className='value';
        if(isNumberSection(section))setNumberBalls(value,record.content,drawMap.get(periodKey(record.period)),numberLimit(section));
        else value.textContent=cleanContent(record.content);
        const result=document.createElement('span'); result.className='ok'+(record.hit_status==='miss'?' miss':''); result.textContent=record.hit_status==='hit'?'✓':record.hit_status==='miss'?'×':'待';
        row.append(period,value,result); list.appendChild(row);
      });
    }).catch(() => showEmpty(document.querySelector('.inner-list')));
  }
  function ensureAdStyles(){
    if(document.getElementById('bannerAdStyles'))return;
    const style=document.createElement('style'); style.id='bannerAdStyles';
    style.textContent='.banner-ad{display:block;width:100%;margin:10px 0 14px;border:1px solid #453a20;border-radius:8px;overflow:hidden;background:#0b0b0b;line-height:0}.banner-ad img{display:block;width:100%;height:auto;aspect-ratio:7.5/1;object-fit:contain;background:#0b0b0b}.banner-ad:focus-visible{outline:2px solid #efcd68;outline-offset:2px}.popup-ad-overlay{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:28px;background:rgba(0,0,0,.76)}.popup-ad-box{position:relative;width:min(420px,86vw);max-height:76vh}.popup-ad-link{display:flex;align-items:center;justify-content:center;border-radius:12px;overflow:hidden;line-height:0;box-shadow:0 12px 42px rgba(0,0,0,.65);background:#111}.popup-ad-link img{display:block;max-width:100%;width:auto;height:auto;max-height:72vh;object-fit:contain;background:#111}.popup-ad-close{position:absolute;right:-12px;top:-12px;z-index:2;width:36px;height:36px;border:2px solid #fff;border-radius:50%;background:#202020;color:#fff;font:700 25px/30px Arial;cursor:pointer;box-shadow:0 2px 9px rgba(0,0,0,.55)}.popup-ad-close:focus-visible{outline:3px solid #efcd68;outline-offset:2px}.site-footer{margin:18px 0 0;padding:24px 14px 28px;border-top:1px solid #6a531e;background:linear-gradient(180deg,#12100a,#090909);text-align:center;color:#8f8f8f}.site-footer strong{display:block;color:#e6c45e;font-size:17px;margin-bottom:8px}.site-footer p{margin:5px 0;font-size:12px}.site-footer button{margin-top:12px;padding:8px 18px;border:1px solid #65501e;border-radius:7px;background:#1c170c;color:#e4c35e;font:700 13px inherit}.site-footer button:active{transform:translateY(1px)}@media(max-width:650px){.banner-ad{margin:8px 0 11px;border-radius:6px}.popup-ad-overlay{padding:22px 18px}.popup-ad-box{width:min(82vw,360px);max-height:70vh}.popup-ad-link img{max-height:66vh}.popup-ad-close{right:-10px;top:-10px;width:32px;height:32px;font-size:22px;line-height:27px}.site-footer{margin-top:14px;padding:21px 10px 24px}}';
    style.textContent+='.banner-ad{margin-bottom:0;border-radius:8px}.text-ad-grid{display:grid;grid-template-columns:1fr;gap:1px;margin:8px 0 14px;padding:1px;border:1px solid #5a4820;border-radius:8px;overflow:hidden;background:#3b311d;box-shadow:0 2px 8px rgba(0,0,0,.25)}.text-ad-grid a{display:flex;width:100%;min-width:0;min-height:38px;align-items:center;justify-content:center;padding:8px 9px;background:#111;color:#f2cf68;font-size:14px;font-weight:800;line-height:1.4;text-align:center;text-decoration:none;white-space:normal;overflow-wrap:anywhere;word-break:break-word}.text-ad-grid a:hover{background:#211b0d}.text-ad-grid a:focus-visible{outline:2px solid #efcd68;outline-offset:-2px}@media(max-width:650px){.text-ad-grid{grid-template-columns:1fr;margin-top:7px;margin-bottom:11px}.text-ad-grid a{padding:8px 6px;font-size:13px}}';
    document.head.appendChild(style);
  }
  function ensureThreeStyles(){
    if(document.getElementById('threeNumberStyles'))return;
    const style=document.createElement('style');style.id='threeNumberStyles';
    style.textContent='.material-empty{padding:30px 12px;text-align:center;color:#8f8f8f;font-weight:700}.number-value{display:block;width:100%}.number-list-row{display:flex!important;flex-direction:column;align-items:stretch!important;gap:9px!important}.number-list-row .inner-name{display:block;width:100%;font-weight:800}.number-list-row .row-side{width:100%;align-items:stretch!important;gap:8px}.number-list-row .accuracy-badge{align-self:flex-start}.number-record-row{grid-template-columns:minmax(0,1fr) 32px!important;row-gap:9px!important}.number-record-row .period{grid-column:1/-1;grid-row:1}.number-record-row .value{grid-column:1;grid-row:2;width:100%;min-width:0}.number-record-row .ok{grid-column:2;grid-row:2;align-self:center}.three-number-row{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-start;width:100%}.three-ball{position:relative;width:31px;height:31px;display:grid;place-items:center;border-radius:50%;background:#151515!important;border:2px solid #c9a643;color:#f2cf68;font-size:13px;font-style:normal;font-weight:900;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,.35)}.three-ball.matched{background:#d93636!important;border-color:#ff7878;color:#fff;box-shadow:0 0 0 2px rgba(217,54,54,.18)}.number-hit-check{position:absolute;right:-5px;top:-6px;width:15px;height:15px;display:grid;place-items:center;border-radius:50%;background:#f5f5f5;border:1px solid #d93636;color:#d93636;font:900 10px/1 Arial,sans-serif;box-shadow:0 1px 2px rgba(0,0,0,.4)}@media(max-width:430px){.number-list-row{gap:8px!important}.three-number-row{gap:6px}.three-ball{width:28px;height:28px;font-size:12px}.number-hit-check{right:-5px;top:-5px;width:14px;height:14px;font-size:9px}}';
    document.head.appendChild(style);
  }
  function makeAd(position,label){
    const ad=document.createElement('a'); ad.className='banner-ad'; ad.href='#'; ad.dataset.adPosition=position; ad.setAttribute('aria-label',label);
    const image=document.createElement('img'); image.src='ad-placeholder.svg'; image.alt=label; image.loading='lazy'; ad.appendChild(image);
    ad.addEventListener('click',event=>{if(ad.dataset.active!=='1')event.preventDefault();}); return ad;
  }
  function sendAdEvent(position,event){
    const body=new URLSearchParams({position_key:position,event_type:event,device:/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)||innerWidth<760?'mobile':'desktop',page_path:location.pathname});
    if(event==='click'&&navigator.sendBeacon){navigator.sendBeacon('/api/public/ad-event',body);return;}
    fetch('/api/public/ad-event',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),keepalive:true}).catch(()=>{});
  }
  function showPopupAd(item){
    if(!item||!item.image)return;
    const mode=item.displayMode==='always'?'always':'daily';
    const dateKey=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const storageKey='home-popup-seen-'+dateKey;
    try{if(mode==='daily'&&localStorage.getItem(storageKey))return;}catch(e){}
    const delay=Math.max(0,Math.min(10,Number(item.delaySeconds)||0))*1000;
    setTimeout(()=>{
      if(document.querySelector('.popup-ad-overlay'))return;
      const overlay=document.createElement('div');overlay.className='popup-ad-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','广告');
      const box=document.createElement('div');box.className='popup-ad-box';
      const close=document.createElement('button');close.type='button';close.className='popup-ad-close';close.setAttribute('aria-label','关闭广告');close.textContent='×';
      const link=document.createElement('a');link.className='popup-ad-link';
      if(item.link){link.href=item.link;link.target='_blank';link.rel='noopener noreferrer';link.addEventListener('click',()=>sendAdEvent('popup','click'));}else link.addEventListener('click',event=>event.preventDefault());
      const image=document.createElement('img');image.alt='首页弹窗广告';image.addEventListener('load',()=>sendAdEvent('popup','view'),{once:true});image.src=item.image;
      const dismiss=()=>overlay.remove();close.addEventListener('click',dismiss);overlay.addEventListener('click',event=>{if(event.target===overlay)dismiss();});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay.isConnected)dismiss();},{once:true});
      link.appendChild(image);box.append(close,link);overlay.appendChild(box);document.body.appendChild(overlay);close.focus();
      if(mode==='daily')try{localStorage.setItem(storageKey,'1');}catch(e){}
    },delay);
  }
  function loadAds(){
    fetch('/api/public/ads',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(data=>{
      const ads={};(data.data||[]).forEach(item=>{ads[item.position_key]={image:item.image_url,link:item.link_url,displayMode:item.display_mode,delaySeconds:item.delay_seconds};});
      document.querySelectorAll('.banner-ad[data-ad-position]').forEach(ad=>{const item=ads.banner||ads[ad.dataset.adPosition];if(!item)return;const image=ad.querySelector('img');image.addEventListener('load',()=>sendAdEvent('banner','view'),{once:true});image.src=item.image;ad.dataset.active='1';if(item.link){ad.href=item.link;ad.target='_blank';ad.rel='noopener noreferrer';}else ad.removeAttribute('href');
        ad.addEventListener('click',()=>sendAdEvent('banner','click'));
      });
      const file=location.pathname.split('/').pop()||'index.html';if(file==='index.html')showPopupAd(ads.popup);
    }).catch(()=>{});
  }
  function loadTextAds(){
    const lotteryType=currentType(),lotteryNames={1:'香港',5:'澳门',8:'天天'},fullNames={1:'香港六合彩',5:'澳门六合彩',8:'天天六合彩'};
    Promise.all([
      fetch('/api/public/text-ads',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()),
      Promise.resolve({data:[]}),
      fetch('/api/public/lottery-latest?lotteryType='+lotteryType+'&_='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():({data:{}})).catch(()=>({data:{}}))
    ]).then(([payload,contentPayload,lotteryPayload])=>{
      const texts=Array.isArray(payload.texts)?payload.texts:Array.isArray(payload.data)?payload.data:[],domains=Array.isArray(payload.domains)?payload.domains:[];if(!texts.length)return;
      const shuffled=list=>{const values=[...list];for(let index=values.length-1;index>0;index--){const random=new Uint32Array(1);crypto.getRandomValues(random);const target=random[0]%(index+1);[values[index],values[target]]=[values[target],values[index]];}return values;},textPool=shuffled(texts),domainPool=shuffled(domains);
      // “三期必中”会预先生成完整的三期分组，记录期数可能比当前资料期数大 1–2 期。
      // 文字广告必须跟随当期普通资料，不能把该分组的结束期误当成当前期数。
      const current=lotteryPayload?.data||{},officialPeriod=Number(current.nextLotteryNumber||current.nextIntLotteryNumber||0),plausible=value=>lotteryType===5||value<200,periods=(contentPayload.data||[]).filter(item=>item.section_key!=='threeperiod'&&plausible(Number(item.period))).map(item=>Number(item.period)||0).filter(Boolean),fallback=[...document.querySelectorAll('[data-section-key]:not([data-section-key="threeperiod"]) [class*="period"]')].map(node=>Number((node.textContent.match(/\d{1,3}/)||[])[0])||0).filter(plausible),period=officialPeriod||Math.max(0,...periods,...fallback);
      const fill=value=>String(value||'').replaceAll('{期数}',period?String(period):'').replaceAll('{彩种}',fullNames[lotteryType]||'澳门六合彩').replaceAll('{彩种简称}',lotteryNames[lotteryType]||'澳门');
      document.querySelectorAll('.banner-ad[data-ad-position]').forEach((banner,sectionIndex)=>{
        if(banner.nextElementSibling?.classList.contains('text-ad-grid'))banner.nextElementSibling.remove();
        const count=10,grid=document.createElement('div');grid.className='text-ad-grid';grid.dataset.count=String(count);grid.setAttribute('aria-label','文字广告');
        for(let offset=0;offset<count;offset++){
          const item=textPool[(sectionIndex*count+offset)%textPool.length],domain=domainPool.length?domainPool[(sectionIndex*count+offset)%domainPool.length]:null,link=document.createElement('a');link.textContent=fill(item.ad_text);link.style.color='#0b5cad';
          if(domain?.domain_url){link.href=fill(domain.domain_url);link.target='_blank';link.rel='noopener noreferrer';}else link.href='#';grid.appendChild(link);
        }
        banner.after(grid);
      });
    }).catch(()=>{});
  }
  function loadRecommendedSites(){
    const list=document.querySelector('.site-network-list');if(!list)return;
    fetch('/api/public/recommended-sites',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(payload=>{
      const sites=Array.isArray(payload.data)?payload.data:[];if(!sites.length)return;list.textContent='';
      sites.forEach(site=>{const link=document.createElement('a');link.href=site.site_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=site.name;list.appendChild(link);});
    }).catch(()=>{});
  }
  let homeMaterialRequestToken=0;
  function refreshTabbedHomeMaterials(lotteryType){
    const requestToken=++homeMaterialRequestToken;
    const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const valueOf=row=>{let value={};try{value=JSON.parse(row.content_json||'{}');}catch(_){};return value;};
    const rowText=row=>{const value=valueOf(row);if(Array.isArray(value.numbers))return value.numbers.map(item=>String(item).padStart(2,'0')).join(' ');if(Array.isArray(value.fields))return value.fields.join(' · ');if(Array.isArray(value.issues))return (value.pick||row.title||'')+'（'+value.issues.join('、')+'期）';return value.pick||value.zodiac||row.title||'';};
    fetch('/api/public/content?lotteryType='+encodeURIComponent(lotteryType)+'&_='+Date.now(),{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject()).then(payload=>{
      if(requestToken!==homeMaterialRequestToken)return;
      const records=Array.isArray(payload&&payload.data)?payload.data:[];
      const byKey=key=>records.filter(row=>row.section_key===key);
      const latest=key=>{const rows=byKey(key);const period=Math.max(0,...rows.map(row=>Number(row.period)||0));return rows.filter(row=>Number(row.period)===period).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)||Number(a.id)-Number(b.id));};
      const state=row=>row.status==='win'?'准':row.status==='lose'?'错':'待开奖';
      const open=row=>row.result_text&&row.result_text!=='待开奖'?row.result_text:'待开奖';
      const renderFeature=key=>{const section=document.querySelector('[data-section-key="'+key+'"]');const list=section&&section.querySelector('.feature-list,.doublewave-list');const rows=latest(key);if(!list||!rows.length)return;list.innerHTML=rows.map(row=>'<div class="feature-row"><span class="feature-period">'+escapeHtml(row.period)+'期</span><span class="feature-pick">'+escapeHtml(rowText(row))+'</span><span class="feature-open">'+escapeHtml(open(row))+'</span><span class="feature-status '+(row.status==='lose'?'lose':'win')+'">'+state(row)+'</span></div>').join('');};
      const studyRows=latest('study'),study=document.querySelector('[data-section-key="study"] .study-list');if(study&&studyRows.length){study.innerHTML=studyRows.map(row=>{const data=valueOf(row);return '<div class="study-row"><span class="study-period">'+escapeHtml(row.period)+'期</span><span class="study-kind">'+escapeHtml(data.kind||row.title)+'</span><span class="study-pick">'+escapeHtml(data.pick||'')+'</span><span class="study-open">'+escapeHtml(open(row))+'</span></div>';}).join('');}
      const sixRows=latest('sixcode'),six=document.querySelector('[data-section-key="sixcode"] .sixcode-list');if(six&&sixRows.length){six.innerHTML=sixRows.map(row=>{const data=valueOf(row);return '<div class="sixcode-row"><span class="sixcode-label">'+escapeHtml(row.period)+'期'+escapeHtml(data.kind||row.title)+'</span><span class="sixcode-zodiac">'+escapeHtml(data.zodiac||'')+'</span><span class="sixcode-numbers">'+escapeHtml(data.numbers||'')+'</span><span class="sixcode-open">'+escapeHtml(open(row))+'</span></div>';}).join('');}
      ['doublewave','homewild','threehead','idiom','sumparity','threeelements','singledouble'].forEach(renderFeature);
      const nineRows=latest('ninezodiac'),nine=document.querySelector('[data-section-key="ninezodiac"] .feature-list');if(nine&&nineRows.length){nine.innerHTML=nineRows.map(row=>{const data=valueOf(row);return '<div class="nine-row"><span class="nine-period">'+escapeHtml(row.period)+'期</span><span class="nine-kind">'+escapeHtml(data.kind||row.title)+'</span><span class="nine-pick">'+escapeHtml(data.pick||'')+'</span><span class="nine-status">'+state(row)+'</span></div>';}).join('');}
      const loseRows=latest('loseall'),lose=document.querySelector('[data-section-key="loseall"] .feature-list');if(lose&&loseRows.length){lose.innerHTML=loseRows.map(row=>'<div class="loseall-row"><span class="loseall-period">'+escapeHtml(row.period)+'期</span><span class="loseall-pick">'+escapeHtml(rowText(row))+'</span><span class="loseall-open">'+escapeHtml(open(row))+'</span></div>').join('');}
      const thirtyRows=latest('thirty'),thirty=document.getElementById('thirtyList');if(thirty&&thirtyRows.length){const row=thirtyRows[0],data=valueOf(row);thirty.innerHTML='<div class="thirty-wrap"><div class="thirty-meta"><strong>'+escapeHtml(row.period)+'期精选30码</strong><span class="thirty-state">'+escapeHtml(open(row))+'</span></div><div class="thirty-numbers">'+(data.numbers||[]).map(number=>'<span class="thirty-ball">'+escapeHtml(String(number).padStart(2,'0'))+'</span>').join('')+'</div></div>';}
      const killRows=latest('kill'),kill=document.querySelector('[data-section-key="kill"] .feature-list');if(kill&&killRows.length){kill.innerHTML='<div class="kill-head"><span>期数</span><span>杀肖</span><span>杀尾</span><span>杀波</span><span>杀头</span><span>特开</span></div>'+killRows.map(row=>{const fields=valueOf(row).fields||[];return '<div class="kill-row"><span class="kill-period">'+escapeHtml(row.period)+'期</span>'+[0,1,2,3].map(index=>'<span class="kill-pick">'+escapeHtml(fields[index]||'')+'</span>').join('')+'<span class="kill-open">'+escapeHtml(open(row))+'</span></div>';}).join('');}
    }).catch(()=>{});
  }
  let masterBoardRequestToken=0;
  const masterSlogans=['免费公开','独家好料','期期精选','稳定公开','实力推荐','原创资料','长期验证','精准分享','高手推荐','每期更新','精品资料','免费参考','连续公开','热门推荐','今日精选','诚意分享','一手资料','每日更新','重点推荐','稳定资料','实战参考','用心整理','准时公开','精选好料','独门资料','公开验证','走势参考','高手心得','认真筛选','长期分享','精心推荐','王牌资料','倾力奉献','实力公开','持续更新','精选发布','独家推荐','天天好彩','免费分享'];
  function refreshMasterBoard(lotteryType){
    const grid=document.querySelector('#masters .master-grid');if(!grid)return;grid.classList.add('is-pending');
    const masterTitle=document.querySelector('#masters .feature-title');if(masterTitle)masterTitle.textContent='↓↓≌汇集金榜高手⊙独家免费资料≌↓↓';
    const requestToken=++masterBoardRequestToken;
    const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const cleanName=value=>String(value??'').replace(/^(江湖侠客)\d+$/,'$1');
    fetch('/api/public/master-posts?lotteryType='+encodeURIComponent(lotteryType)+'&_='+Date.now(),{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject()).then(payload=>{
      if(requestToken!==masterBoardRequestToken)return;
      const rows=Array.isArray(payload&&payload.data)?payload.data:[];if(!rows.length){grid.classList.remove('is-pending');return;}
      const period=Math.max(...rows.map(row=>Number(row.period)||0));const current=rows.filter(row=>Number(row.period)===period).sort((a,b)=>Number(a.rank_no)-Number(b.rank_no)||Number(a.master_id)-Number(b.master_id));if(!current.length){grid.classList.remove('is-pending');return;}
      grid.innerHTML=current.map(row=>{const rank=Number(row.rank_no)||1,slogan=masterSlogans[(rank-1)%masterSlogans.length];return '<a class="master-card master-line-card" data-master-id="'+escapeHtml(row.master_id)+'" href="master-detail.html?id='+encodeURIComponent(row.master_id)+'&lotteryType='+encodeURIComponent(lotteryType)+'"><span class="master-line"><span class="master-line-period">'+escapeHtml(row.period)+'期:</span><span class="master-line-author">'+escapeHtml(cleanName(row.name)||'高手')+'</span><span class="master-line-category">→【'+escapeHtml(row.specialty||'独家资料')+'】</span><span class="master-line-slogan">←'+escapeHtml(slogan)+'</span></span></a>';}).join('');
      grid.classList.remove('is-pending');fetch('/api/public/member-posts?lotteryType='+encodeURIComponent(lotteryType)+'&_='+Date.now(),{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject()).then(memberPayload=>{if(requestToken!==masterBoardRequestToken)return;const members=Array.isArray(memberPayload&&memberPayload.data)?memberPayload.data:[];if(!members.length)return;grid.querySelectorAll('.member-post-row').forEach(node=>node.remove());members.sort(()=>Math.random()-.5).forEach(item=>{const memberHtml='<a class="member-post-row" href="/member-post.html?id='+encodeURIComponent(item.id)+'&lotteryType='+encodeURIComponent(lotteryType)+'">'+escapeHtml(period)+'期: '+escapeHtml(item.author||'会员资料')+' → '+escapeHtml(item.post_type||'会员贴')+' ←独家资料</a>';const targets=[...grid.querySelectorAll('.master-card')],target=targets[Math.floor(Math.random()*(targets.length+1))];if(target)target.insertAdjacentHTML('beforebegin',memberHtml);else grid.insertAdjacentHTML('beforeend',memberHtml);});}).catch(()=>{});
    }).catch(()=>{if(requestToken===masterBoardRequestToken)grid.classList.remove('is-pending');});
  }  function syncVisiblePeriodNavigation(){
    document.querySelectorAll('[data-section-key]:not([data-section-key="five"])').forEach(section=>{
      const nav=section.querySelector('.study-period-nav,.sixcode-nav,.record-history-nav');
      const content=section.querySelector('.study-list,.sixcode-list,.feature-list,.doublewave-list');
      const match=content&&content.textContent.match(/(\d{1,6})期/); const latest=match?Number(match[1]):0;
      if(!nav||!latest)return;
      const buttons=[...nav.querySelectorAll('button')]; const key=section.dataset.sectionKey;
      if(nav.classList.contains('study-period-nav')) buttons.forEach((button,index)=>{const period=latest-index;button.textContent=period+'期';button.dataset.period=String(period);button.classList.toggle('active',index===0);});
      else if(nav.classList.contains('sixcode-nav')) buttons.forEach((button,index)=>{const endPeriod=latest-index*2-1;button.textContent=(latest-index*2)+'–'+endPeriod+'期';button.dataset.page=(latest-index*2)+'-'+endPeriod;button.classList.toggle('active',index===0);});
      else if(key==='ninezodiac'||key==='thirty') buttons.forEach((button,index)=>{const period=latest-index;button.textContent=period+'期';button.dataset.period=String(period);button.classList.toggle('active',index===0);});
      else buttons.forEach((button,index)=>{const first=latest-index*5,last=first-4;button.textContent=first+'–'+last+'期';button.dataset.view=index===0?'current':'older';button.classList.toggle('active',index===0);});
    });
  }
  function boot() {
    ensureThreeStyles();
    const file = location.pathname.split('/').pop() || 'index.html';
    if (file === 'index.html' || file === '') {
      ensureAdStyles();
      document.querySelectorAll('section.card.section').forEach((section,index)=>{
        if(section.nextElementSibling&&section.nextElementSibling.classList.contains('banner-ad'))return;
        section.after(makeAd('home-'+(index+1),'横幅广告位 '+(index+1)));
      });
      if(!document.querySelector('.site-footer')){
        const footer=document.createElement('footer'); footer.className='site-footer';
        const name=document.createElement('strong'); name.textContent='123六合网 · 123LH.COM';
        const note=document.createElement('p'); note.textContent='打造良心六合，坚持永久免费';
        const copy=document.createElement('p'); copy.textContent='© '+new Date().getFullYear()+' 123六合网';
        const top=document.createElement('button'); top.type='button'; top.textContent='返回顶部'; top.addEventListener('click',()=>scrollTo({top:0,behavior:'smooth'}));
        footer.append(name,note,copy,top); document.body.appendChild(footer);
      }
      track('home');
      loadRecommendedSites();
      renderHomepage();
      setTimeout(syncVisiblePeriodNavigation,800);
      document.querySelectorAll('#lotteryMenu button, .lottery-tab').forEach(button => button.addEventListener('click', () => {
        const selected=Number(button.dataset.lotteryType);
        if(validTypes.includes(selected))localStorage.setItem('lotteryType',String(selected));
        [400,1200].forEach(delay=>setTimeout(()=>{if(currentType()===selected)syncVisiblePeriodNavigation();},delay));
        loadTextAds();
        track('home');
      }));
      loadAds();
      loadTextAds();
      return;
    }
    if(file==='history'||file==='history.html'){track('history');return;}
    const match = file.match(/^([a-z]+)(?:-(\d+))?(?:\.html)?$/);
    if (!match || !sectionKeys.includes(match[1])) return;
    if(isNumberSection(match[1])){
      if(match[2])document.querySelectorAll('.record').forEach(row=>row.classList.add('number-record-row'));
      else document.querySelectorAll('.inner-row').forEach(row=>row.classList.add('number-list-row'));
      document.querySelectorAll('.number-row').forEach(row=>{row.classList.add('three-number-row');const value=row.closest('.inner-value,.value');if(value)value.classList.add('number-value');});
      document.querySelectorAll('.mini-ball').forEach(ball=>{ball.classList.add('three-ball');ball.style.removeProperty('background');});
    }
    const pageTitles={yixiao:'平特一肖',erxiao:'平特二肖',sanxiao:'\u5e73\u7279\u4e09\u8096',liuxiao:'\u5e73\u7279\u516d\u8096',weishu:'平特尾数',sanzhongsan:'三中三',erzhonger:'二中二',chengyu:'成语解肖'};
    if(!match[2]&&pageTitles[match[1]]){const heading=document.querySelector('.inner-title');if(heading)heading.textContent=pageTitles[match[1]];document.title=pageTitles[match[1]]+'－123六合网';}
    ensureAdStyles();
    const list=document.querySelector('.inner-list');
    if(list){const ad=makeAd(match[2]?'detail':'list',match[2]?'内容页广告位':'列表页广告位');match[2]?list.before(ad):document.querySelector('.topbar')?.after(ad);loadAds();}
    track(match[1]);
    match[2] ? renderDetail(match[1]) : renderList(match[1]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

const skyTheme=document.createElement('style');skyTheme.textContent='.banner-ad{border-color:#cfe8ff!important;background:#fff!important}.banner-ad img{background:#fff!important}.text-ad-grid{border-color:#cfe8ff!important;background:#eaf5ff!important;box-shadow:0 2px 8px rgba(35,122,190,.10)!important}.text-ad-grid a{background:#fff!important;color:#0b5cad!important}.text-ad-grid a:hover{background:#eaf5ff!important}.site-footer{border-color:#cfe8ff!important;background:linear-gradient(180deg,#fff,#f7fbff)!important;color:#6b7f93!important}.site-footer strong,.site-footer button{color:#0b5cad!important}.site-footer button{border-color:#8cc9ff!important;background:#fff!important}.accuracy-badge{border-color:#8fd6aa!important;background:#eaf8ef!important;color:#228b52!important}.stats-card{border-color:#cfe8ff!important;background:#fff!important}.stats-label,.stat strong{color:#0b5cad!important}.stat{border-color:#e2f1ff!important}.stat span{color:#6b7f93!important}.three-ball{background:#f7fbff!important;border-color:#8cc9ff!important;color:#0b5cad!important}.three-ball.matched{background:#d93636!important;color:#fff!important}';document.head.appendChild(skyTheme);
})();
(function(){
  const type=()=>Number(localStorage.getItem('lotteryType'))||5,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function renderFormula(){
    const list=document.querySelector('.formula-list');if(!list)return;
    const prediction=value=>Array.isArray(value)?value.join('、'):(value||'本期参考');
    const renderDirectCards=()=>{const cards=[['平特一肖','pingte','one'],['三中三','tema','3'],['八码中特','tema','8'],['十杀码','tema','10'],['十八码','tema','18'],['一肖','zodiac','1'],['三肖','zodiac','3'],['六肖','zodiac','6'],['九肖','zodiac','9'],['二中二','fushi','22'],['三中三连','fushi','33'],['二连肖','fushi','2x'],['三连肖','fushi','3x'],['特码单双','danshuang',''],['特码波色','wave',''],['特码五行','wuxing',''],['家野中特','jiaye',''],['杀码','kill','code'],['杀肖','kill','animal'],['杀尾','kill','tail'],['杀头','kill','head'],['杀波','kill','wave'],['特码大小','size',''],['尾数','tail',''],['头数','head','']];list.innerHTML=cards.map(([label,board,category])=>{const image='https://txgs888.q3665.com/api/formula-recommendations/thumbnail?lotteryType='+type()+'&board='+board+'&category='+category+'&cardName='+encodeURIComponent(label);return '<a class="formula-card" href="https://txgs888.q3665.com/" target="_blank" rel="noopener"><span class="formula-cover"><img src="'+esc(image)+'" alt="'+esc(label)+'"></span><strong class="formula-name">'+esc(label)+'</strong></a>';}).join('');};
    renderDirectCards();
  }
  renderFormula();document.querySelectorAll('#lotteryMenu button,.lottery-tab').forEach(b=>b.addEventListener('click',()=>setTimeout(renderFormula,0)));
})();
