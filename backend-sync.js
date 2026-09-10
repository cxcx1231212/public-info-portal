(function(){
  'use strict';
  const state={content:new Map(),ready:false};
  let initialByType={};
  const currentLotteryType=()=>[1,5,8].includes(Number(localStorage.getItem('lotteryType')))?Number(localStorage.getItem('lotteryType')):5;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const cleanMasterName=value=>String(value??'').replace(/^(江湖侠客)\d+$/,'$1');
  const parse=value=>{try{const data=JSON.parse(value||'{}');return data&&typeof data==='object'?data:{};}catch{return {};}};
  const statusClass=status=>status==='win'?'win':status==='lose'?'lose':'';
  const statusText=status=>status==='win'?'准':status==='lose'?'错':'待开奖';
  const rangeOf=button=>{const values=(button?.textContent.match(/\d{1,3}/g)||[]).map(Number);return values.length>1?[Math.min(...values),Math.max(...values)]:values.length?[values[0],values[0]]:null;};
  const recordsFor=(key,button)=>{const records=state.content.get(key)||[];const range=rangeOf(button);return range?records.filter(item=>Number(item.period)>=range[0]&&Number(item.period)<=range[1]):records;};
  function latestButton(section,key){
    const records=state.content.get(key)||[],periods=[...new Set(records.map(item=>Number(item.period)||0).filter(Boolean))].sort((a,b)=>b-a);if(!periods.length)return section.querySelector('.active[data-period],.record-history-btn.active,.study-period-btn.active,.sixcode-page-btn.active');
    const selector='.record-history-btn,.study-period-btn,.sixcode-page-btn',existing=[...section.querySelectorAll(selector)],sample=existing[0];if(!sample)return null;
    if(key==='threeperiod'){
      const nav=sample.parentElement,starts=[...new Set(records.map(record=>{const issues=parse(record.content_json).issues;return Array.isArray(issues)?Number(issues[0]):0;}).filter(Boolean))].sort((a,b)=>b-a);
      const groups=[];for(let index=0;index<starts.length;index+=2)groups.push(starts.slice(index,index+2));
      nav.innerHTML=groups.map((group,index)=>{const high=group[0]+2,low=group[group.length-1],label=low+'–'+high+'期';return '<button type="button" class="'+esc(sample.className.replace(/\s*active\b/g,''))+(index===0?' active':'')+'" data-page="'+low+'-'+high+'">'+label+'</button>';}).join('');return nav.querySelector('.active');
    }
    const sampleRange=rangeOf(sample),groupSize=sampleRange?Math.max(1,sampleRange[1]-sampleRange[0]+1):1,nav=sample.parentElement,groups=[];
    for(let index=0;index<periods.length;index+=groupSize)groups.push(periods.slice(index,index+groupSize));
    nav.innerHTML=groups.map((group,index)=>{const high=group[0],low=group[group.length-1],label=high===low?high+'期':high+'–'+low+'期',periodAttr=high===low?' data-period="'+high+'"':' data-page="'+high+'-'+low+'"';return '<button type="button" class="'+esc(sample.className.replace(/\s*active\b/g,''))+(index===0?' active':'')+'"'+periodAttr+'>'+label+'</button>';}).join('');
    return nav.querySelector('.active');
  }
  const pickOf=(record,data)=>data.pick||data.value||data.recommendation||record.title||'';
  const openOf=(record,data)=>data.open||record.result_text||'待开奖';
  const markMatched=(value,open)=>{const text=String(value??''),result=String(open??''),zodiac=result.match(/[鼠牛虎兔龙蛇马羊猴鸡狗猪]/)?.[0]||'',numberMatch=result.match(/(?:开|:|：)[^0-9]*(0?[1-9]|[1-4]\d)/),number=numberMatch?Number(numberMatch[1]):0;if(!zodiac&&!number)return esc(text);let html='',last=0;for(const match of text.matchAll(/\d{1,2}|[鼠牛虎兔龙蛇马羊猴鸡狗猪]/g)){html+=esc(text.slice(last,match.index));const token=match[0],hit=token===zodiac||(number&&/^\d+$/.test(token)&&Number(token)===number);html+=hit?'<em class="matched-value">'+esc(token)+'</em>':esc(token);last=match.index+token.length;}return html+esc(text.slice(last));};

  function renderFeature(list,records,rowClass='feature-row',prefix='feature'){
    list.innerHTML=records.map(record=>{const data=parse(record.content_json),status=record.status||'pending',open=openOf(record,data),state=status==='pending'&&/待开奖|开[:：]?？/.test(open)?'':statusText(status);return '<div class="'+rowClass+'"><span class="'+prefix+'-period">'+esc(record.period)+'期</span><span class="'+prefix+'-pick">'+esc(pickOf(record,data))+'</span><span class="'+prefix+'-open">'+esc(open)+'</span><span class="'+prefix+'-status '+statusClass(status)+'">'+esc(state)+'</span></div>';}).join('');
  }
  function renderSection(section,button){
    const key=section.dataset.sectionKey,records=recordsFor(key,button);if(!records.length)return false;
    const sorted=[...records].sort((a,b)=>Number(b.period)-Number(a.period)||Number(a.sort_order)-Number(b.sort_order)||a.id-b.id);
    let list;
    if(key==='study'){
      list=section.querySelector('.study-list');list.innerHTML=sorted.map(record=>{const data=parse(record.content_json),open=openOf(record,data),pick=record.status==='win'?markMatched(pickOf(record,data),open):esc(pickOf(record,data));return '<div class="study-row"><span class="study-period">'+esc(record.period)+'期</span><span class="study-kind">'+esc(data.kind||record.title)+'</span><span class="study-pick">'+pick+'</span><span class="study-open">'+esc(open)+'</span></div>';}).join('');
    }else if(key==='sixcode'){
      list=section.querySelector('.sixcode-list');const periods=new Map();sorted.forEach(record=>{if(!periods.has(record.period))periods.set(record.period,[]);periods.get(record.period).push(record);});list.innerHTML=[...periods.entries()].map(([period,items],index)=>'<div class="sixcode-period">'+items.map(record=>{const data=parse(record.content_json),open=openOf(record,data),zodiac=data.zodiac||data.pick||'',numbers=data.numbers||'',won=record.status==='win';return '<div class="sixcode-row"><span class="sixcode-label">'+esc(period)+'期'+esc(data.kind||record.title)+'</span><span class="sixcode-zodiac">'+(won?markMatched(zodiac,open):esc(zodiac))+'</span><span class="sixcode-numbers">'+(won?markMatched(numbers,open):esc(numbers))+'</span><span class="sixcode-open">'+esc(open)+'</span></div>';}).join('')+'</div>'+(index<periods.size-1?'<div class="sixcode-slogan">记住: 123LH.COM 赚钱就是这么简单!</div>':'')).join('');
    }else if(key==='doublewave'){
      list=section.querySelector('.doublewave-list');renderFeature(list,sorted,'doublewave-row','doublewave');
    }else if(key==='ninezodiac'){
      list=section.querySelector('.feature-list');list.innerHTML=sorted.map(record=>{const data=parse(record.content_json);return '<div class="nine-row"><span class="nine-period">'+esc(record.period)+'期</span><span class="nine-kind">'+esc(data.kind||record.title)+'</span><span class="nine-pick">'+esc(pickOf(record,data))+'</span><span class="nine-status">'+esc(statusText(record.status))+'</span></div>';}).join('');
    }else if(key==='loseall'){
      list=section.querySelector('.feature-list');list.innerHTML=sorted.map(record=>{const data=parse(record.content_json);return '<div class="loseall-row"><span class="loseall-period">'+esc(record.period)+'期</span><span class="loseall-pick">'+esc(pickOf(record,data))+'</span><span class="loseall-open">'+esc(openOf(record,data))+'</span></div>';}).join('');
    }else if(key==='thirty'){
      list=section.querySelector('#thirtyList');const record=sorted[0],data=parse(record.content_json),numbers=Array.isArray(data.numbers)?data.numbers:[];list.innerHTML='<div class="thirty-wrap"><div class="thirty-meta"><strong>'+esc(record.period)+'期精选30码</strong><span class="thirty-state">'+esc(openOf(record,data))+'</span></div><div class="thirty-numbers">'+numbers.slice(0,30).map(number=>'<span class="thirty-ball'+(String(number).padStart(2,'0')===String(data.hit||'').padStart(2,'0')?' hit':'')+'">'+esc(String(number).padStart(2,'0'))+'</span>').join('')+'</div></div>';
    }else if(key==='kill'){
      list=section.querySelector('.feature-list');list.innerHTML='<div class="kill-head"><span>期数</span><span>杀肖</span><span>杀尾</span><span>杀波</span><span>杀头</span><span>特开</span></div>'+sorted.map(record=>{const data=parse(record.content_json),fields=Array.isArray(data.fields)?data.fields:[];return '<div class="kill-row"><span class="kill-period">'+esc(record.period)+'期</span>'+fields.slice(0,4).map(value=>'<span class="kill-pick">'+esc(value)+'</span>').join('')+'<span class="kill-open">'+esc(openOf(record,data))+'</span></div>';}).join('');
    }else if(key==='threeperiod'){
      list=section.querySelector('.feature-list');list.innerHTML=sorted.map(record=>{const data=parse(record.content_json),issues=Array.isArray(data.issues)?data.issues:[],opens=Array.isArray(data.opens)?data.opens:[];return '<div class="three-period-group"><div class="three-period-issues">'+issues.map(value=>'<span>'+esc(value)+'期</span>').join('')+'</div><div class="three-period-pick">'+esc(pickOf(record,data))+'</div><div class="three-period-opens">'+opens.map(value=>'<span>'+esc(value)+'</span>').join('')+'</div></div>';}).join('');
    }else{
      list=section.querySelector('.feature-list');renderFeature(list,sorted);
    }
    return true;
  }

  let masterRecords=[],masterCurrentPeriod=0,masterRenderSignature='';
  const masterSlogans=['免费公开','独家好料','期期精选','稳定公开','实力推荐','原创资料','长期验证','精准分享','高手推荐','每期更新','精品资料','免费参考','连续公开','热门推荐','今日精选','诚意分享','一手资料','每日更新','重点推荐','稳定资料','实战参考','用心整理','准时公开','精选好料','独门资料','公开验证','走势参考','高手心得','认真筛选','长期分享','精心推荐','王牌资料','倾力奉献','实力公开','持续更新','精选发布','独家推荐','天天好彩','免费分享'];
  function renderMasterPage(){
    const grid=document.querySelector('.master-grid');if(!grid)return;const records=masterRecords.filter(master=>!master.archived);
    grid.innerHTML=records.map(master=>'<div class="master-card master-line-card" data-master-id="'+Number(master.id)+'"><div class="master-line"><span class="master-line-period">'+esc(masterCurrentPeriod)+'期:</span><span class="master-line-author">'+esc(cleanMasterName(master.name))+'</span><span class="master-line-category">→【'+esc(master.specialty)+'】</span><span class="master-line-slogan">←'+esc(masterSlogans[(Number(master.rank_no)-1)%masterSlogans.length])+'</span></div></div>').join('');
  }
  function renderMasters(records){masterRecords=records||[];const signature=currentLotteryType()+'|'+masterCurrentPeriod+'|'+masterRecords.map(item=>[item.id,item.rank_no,item.name,item.specialty,item.archived].join(':')).join('|'),grid=document.querySelector('.master-grid');if(signature===masterRenderSignature&&grid?.querySelector('.master-card'))return;masterRenderSignature=signature;renderMasterPage();}
  function hydrate(records,masters){state.content.clear();masterCurrentPeriod=Math.max(0,...(records||[]).filter(record=>record.section_key!=='threeperiod').map(record=>Number(record.period)||0));(records||[]).forEach(record=>{if(!state.content.has(record.section_key))state.content.set(record.section_key,[]);state.content.get(record.section_key).push(record);});state.ready=true;document.querySelectorAll('[data-section-key]').forEach(section=>{const key=section.dataset.sectionKey;if(state.content.has(key))renderSection(section,latestButton(section,key));});renderMasters(masters||masterRecords);document.body.classList.remove('backend-loading');}
  async function syncKingForecasts(){
    try{
      const response=await fetch('/api/public/king-forecasts?lotteryType='+currentLotteryType(),{cache:'no-store'});if(!response.ok)return;const payload=await response.json(),data=payload.data;if(!data||!data.period||!Array.isArray(data.nine)||!Array.isArray(data.numbers))return;
      if(data.nine.length)state.content.set('ninezodiac',data.nine.map((item,index)=>({id:900001+index,section_key:'ninezodiac',period:item.period,title:item.kind,content_json:JSON.stringify({kind:item.kind,pick:item.pick}),result_text:'',status:item.status||'pending',sort_order:index+1,enabled:1})));
      const thirtyRows=Array.isArray(data.thirty)&&data.thirty.length?data.thirty:[{period:data.period,numbers:data.numbers,status:'pending',hit:'',open:'待开奖'}];
      state.content.set('thirty',thirtyRows.map((item,index)=>{const status=['win','lose'].includes(item.status)?item.status:'pending',open=status==='pending'?'待开奖':(item.open||('开:'+(item.hit||'')+(status==='win'?'准':'错')));return {id:900010+index,section_key:'thirty',period:Number(item.period),title:'精选30码',content_json:JSON.stringify({numbers:item.numbers,open,hit:item.hit||''}),result_text:open,status,sort_order:index,enabled:1};}));
      for(const key of ['ninezodiac','thirty']){if(key==='ninezodiac'&&!data.nine.length)continue;const section=document.querySelector('[data-section-key="'+key+'"]');if(!section)continue;const periods=key==='thirty'?thirtyRows.map(item=>Number(item.period)):[Number(data.period)],nav=section.querySelector('.record-history-nav');if(nav)nav.innerHTML=periods.map((shownPeriod,index)=>'<button type="button" class="record-history-btn'+(index===0?' active':'')+'" data-period="'+shownPeriod+'">'+shownPeriod+'期</button>').join('');renderSection(section,nav?.querySelector('.active'));}
    }catch{}
  }
  async function syncKingThirtyRaw(){
    try{
      const response=await fetch('/api/public/king-thirty-raw?lotteryType='+currentLotteryType()+'&_='+Date.now(),{cache:'no-store'});if(!response.ok)return;const payload=await response.json();
      const arrays=[];function walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){if(node.length)arrays.push(node);node.forEach(walk);return;}Object.values(node).forEach(walk)}walk(payload);
      const records=arrays.map(value=>({value,score:value.reduce((sum,item)=>sum+(item&&typeof item==='object'&&(item.period||item.issue||item.issueNo||item.intPeriod)?10:0),0)+Math.min(value.length,20)})).sort((a,b)=>b.score-a.score)[0]?.value||[];
      function scalars(value){const out=[];function visit(node,path){if(node==null)return;if(typeof node!=='object'){out.push([path,node]);return}if(Array.isArray(node)){node.forEach((item,index)=>visit(item,path+'['+index+']'));return}Object.entries(node).forEach(([key,item])=>visit(item,path?path+'.'+key:key))}visit(value,'');return out}
      const rows=records.map((item,index)=>{const values=scalars(item),periodValue=values.find(([key])=>/(^|\.)(period|issue|issueNo|intPeriod)$/i.test(key))?.[1],period=parseInt(String(item.period||item.issue||item.issueNo||periodValue||0),10)||0,candidateArrays=[];function findArrays(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){const nums=node.map(value=>Number(value?.number??value)).filter(number=>number>=1&&number<=49);if(nums.length>=30)candidateArrays.push(nums);node.forEach(findArrays);return}Object.values(node).forEach(findArrays)}findArrays(item);let numbers=(candidateArrays.sort((a,b)=>b.length-a.length)[0]||[]).slice(0,30);if(numbers.length<30){const source=values.map(([,value])=>typeof value==='string'?value:'').join(' '),matches=source.match(/(?:^|\D)(0?[1-9]|[1-4]\d)(?=\D|$)/g)||[];numbers=matches.map(value=>Number(value.replace(/\D/g,''))).filter(number=>number>=1&&number<=49).slice(0,30)}const raw=values.filter(([key,value])=>/status|state|check|verify|result|hit|核对|结果/i.test(key)||/[准错]|win|lose|hit|miss|命中|未中/i.test(String(value))).map(([,value])=>String(value)).join('|').toLowerCase();let status=raw.includes('准')||raw.includes('命中')||/(^|\|)(win|hit|中)(\||$)/.test(raw)?'win':raw.includes('错')||raw.includes('未中')||/(^|\|)(lose|miss)(\||$)/.test(raw)?'lose':'pending',hit='';for(const [key,value] of values){if(!/hit|result|special|open|lottery|开奖|特码/i.test(key)&&!/[\u5f00准错]/.test(String(value)))continue;const match=String(value).match(/(?:^|\D)(0?[1-9]|[1-4]\d)(?=\D|$)/);if(match){hit=String(Number(match[1])).padStart(2,'0');break}}if(hit&&status==='pending')status=numbers.includes(Number(hit))?'win':'lose';const open=status==='pending'?'待开奖':'开:'+hit+(status==='win'?'准':'错');return {id:910000+index,section_key:'thirty',period,title:'精选30码',content_json:JSON.stringify({numbers,hit,open}),result_text:open,status,sort_order:index,enabled:1}}).filter(row=>row.period&&parse(row.content_json).numbers.length===30).slice(0,5);if(!rows.length)return;
      state.content.set('thirty',rows);const section=document.querySelector('[data-section-key="thirty"]'),nav=section?.querySelector('.record-history-nav');if(nav)nav.innerHTML=rows.map((row,index)=>'<button type="button" class="record-history-btn'+(index===0?' active':'')+'" data-period="'+row.period+'">'+row.period+'期</button>').join('');if(section)renderSection(section,nav?.querySelector('.active'));
    }catch{}
  }
  async function syncRecommendedSites(){try{const response=await fetch('/api/public/recommended-sites?_='+Date.now(),{cache:'no-store'}),payload=await response.json();if(!response.ok||!payload.success||!Array.isArray(payload.data))return;const list=document.querySelector('.site-network-list');if(!list)return;list.innerHTML=payload.data.map(item=>'<a href="'+esc(item.site_url||'#')+'" target="_blank" rel="noopener">'+esc(item.name||'推荐网站')+'</a>').join('');}catch{}}

  function memberHost(){return document.querySelector('.master-grid')?.closest('.section')||null;}
  function renderMemberPosts(records){const grid=document.querySelector('.master-grid');if(!grid)return;grid.querySelectorAll('.member-post-row').forEach(node=>node.remove());[...(records||[])].sort(()=>Math.random()-.5).forEach(item=>{const title=(masterCurrentPeriod||'最新')+'期: '+item.author+' → '+item.post_type+' ←独家资料',html='<a class="member-post-row" href="/member-post.html?id='+Number(item.id)+'&lotteryType='+currentLotteryType()+'">'+esc(title)+'</a>',targets=[...grid.querySelectorAll('.master-card')],target=targets[Math.floor(Math.random()*(targets.length+1))];if(target)target.insertAdjacentHTML('beforebegin',html);else grid.insertAdjacentHTML('beforeend',html);});}
  const memberPostSignatures=new Map();async function syncMemberPosts(){try{const type=currentLotteryType(),response=await fetch('/api/public/member-posts?lotteryType='+type+'&_='+Date.now(),{cache:'no-store'}),payload=await response.json(),records=payload.data||[],signature=records.map(item=>[item.id,item.author,item.post_type,item.current_data,item.enabled].join(':')).join('|'),grid=document.querySelector('.master-grid');if(!response.ok||!payload.success||!grid)return;if(memberPostSignatures.get(type)===signature&&grid.querySelector('.member-post-row'))return;memberPostSignatures.set(type,signature);renderMemberPosts(records)}catch{}}
  if(!document.getElementById('memberPostStyles')){const style=document.createElement('style');style.id='memberPostStyles';style.textContent='.member-post-list{margin:0 0 6px;padding:0 10px}.member-post-row{display:flex;align-items:center;justify-content:center;min-height:49px;padding:11px 8px;color:#f2ca63;text-align:center;text-decoration:none;border:1px solid #55401f;border-radius:9px;background:linear-gradient(145deg,#11100d,#080909);font-size:16px;font-weight:900;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.member-post-row:hover{border-color:#c08d25;background:#13110c}@media(max-width:520px){.member-post-list{padding:0 4px}.member-post-row{min-height:44px;padding:10px 4px;font-size:14px}}';document.head.appendChild(style)}

  document.addEventListener('click',event=>{
    const button=event.target.closest('.record-history-btn,.study-period-btn,.sixcode-page-btn');if(!button||!state.ready)return;
    const section=button.closest('[data-section-key]');if(!section||!state.content.has(section.dataset.sectionKey))return;
    if(renderSection(section,button)){event.preventDefault();event.stopImmediatePropagation();section.querySelectorAll('.record-history-btn,.study-period-btn,.sixcode-page-btn').forEach(item=>item.classList.toggle('active',item===button));}
  },true);

  let syncToken=0;
  async function syncAll(showLoading=false){
    const token=++syncToken,type=currentLotteryType();if(showLoading){state.ready=false;document.body.classList.add('backend-loading');}
    try{
      const [content,masters]=await Promise.all([
        fetch('/api/public/content?lotteryType='+type+'&_='+Date.now(),{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject()),
        fetch('/api/public/masters?lotteryType='+type+'&_='+Date.now(),{cache:'no-store'}).then(response=>response.ok?response.json():{success:false,data:[]}).catch(()=>({success:false,data:[]}))
      ]);
      if(token!==syncToken||type!==currentLotteryType())return;
      initialByType[type]=content.data||[];hydrate(content.data||[],masters.data||[]);
      await syncMemberPosts();await Promise.all([syncKingForecasts(),syncKingThirtyRaw(),syncRecommendedSites()]);
      if(token===syncToken)document.body.classList.remove('backend-loading');
    }catch{if(token===syncToken){document.body.classList.remove('backend-loading');document.querySelectorAll('[data-section-key]').forEach(section=>{if(!section.querySelector('.backend-load-error')){const note=document.createElement('div');note.className='backend-load-error';note.textContent='资料加载失败，请刷新重试';section.appendChild(note);}});}}
  }
  try{const initial=JSON.parse(document.getElementById('initialBackendData')?.textContent||'{}');initialByType=initial.contentByType||{};const first=initialByType[currentLotteryType()]||initialByType[String(currentLotteryType())];if(Array.isArray(first)&&first.length)hydrate(first,initial.masters||[]);}catch{}
  document.querySelectorAll('#lotteryMenu button,.lottery-tab').forEach(button=>button.addEventListener('click',()=>setTimeout(()=>{const type=currentLotteryType(),cached=initialByType[type]||initialByType[String(type)];if(Array.isArray(cached)&&cached.length)hydrate(cached,masterRecords);else syncAll(false);},0)));
  window.addEventListener('pageshow',event=>{
    if(!event.persisted)return;
    const type=currentLotteryType(),cached=initialByType[type]||initialByType[String(type)];
    if(state.ready&&state.content.size){document.body.classList.remove('backend-loading');document.querySelectorAll('[data-section-key]').forEach(section=>{const key=section.dataset.sectionKey;if(state.content.has(key))renderSection(section,section.querySelector('.active')||latestButton(section,key));});renderMasterPage();}
    else if(Array.isArray(cached)&&cached.length)hydrate(cached,masterRecords);
    else syncAll(true);
  });
  syncAll(!state.ready);
  setInterval(syncAll,60000);
})();
