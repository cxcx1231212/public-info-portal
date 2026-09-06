(function () {
  'use strict';
  const validTypes = [1, 5, 8];
  const sectionKeys = ['history','yixiao','erxiao','sanxiao','liuxiao','tema','weishu','sanzhongsan','erzhonger','chengyu'];
  const currentType = () => {
    const value = Number(localStorage.getItem('lotteryType'));
    return validTypes.includes(value) ? value : 1;
  };
  const splitValues = value => String(value || '').trim().split(/[\s,，、·・]+/).filter(Boolean);
  const api = section => fetch('api/data.php?lotteryType=' + currentType() + '&section=' + encodeURIComponent(section) + '&limit=500', {cache:'no-store'}).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(data => data && data.success ? data : Promise.reject(new Error('Invalid response')));
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
  function updateHomepageSection(section, data) {
    const link = document.querySelector('.section .more[href="' + section + '.html"]');
    const panel = link && link.closest('.section');
    if (!panel) return;
    const latest = latestByName(data.records);
    const countNode = panel.querySelector('.section-title .count');
    if (countNode && (countNode.textContent.includes('统计中') || /共\d+份资料/.test(countNode.textContent))) countNode.textContent = '（共' + latest.size + '份资料）';
    if (!data.records.length) return;
    const available = [...latest.values()].sort((a,b)=>{const sa=data.stats[a.source_name]||{accuracy:0,hits:0};const sb=data.stats[b.source_name]||{accuracy:0,hits:0};return sb.accuracy-sa.accuracy||sb.hits-sa.hits||a.source_name.localeCompare(b.source_name,'zh-CN');});
    const used = new Set();
    panel.querySelectorAll('.material,.six-row,.tail,.combo-card').forEach(card => {
      const nameNode = card.querySelector('.name,strong');
      let record = nameNode && latest.get(nameNode.textContent.trim());
      if (record) used.add(record.source_name);
      if (!record) record = available.find(item => !used.has(item.source_name));
      if (!record) return;
      used.add(record.source_name);
      const detailUrl=section+'-1.html?source='+encodeURIComponent(record.source_name);
      card.style.cursor='pointer';card.setAttribute('role','link');card.tabIndex=0;card.setAttribute('aria-label','查看 '+record.source_name+' 往期记录');
      card.onclick=event=>{if(event.target.closest('a,button'))return;location.href=detailUrl;};
      card.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();location.href=detailUrl;}};
      if (nameNode) nameNode.textContent = record.source_name;
      const plain = card.querySelector('.pick,.value');
      const combo = card.querySelector('.combo-nums');
      if (combo) {
        setTokens(combo, record.content, 'combo-num');
        const chip = card.querySelector('.chip');
        if (chip) chip.textContent = '共' + splitValues(record.content).length + '码';
      } else if (plain && card.classList.contains('six-row')) {
        setTokens(plain, record.content, '');
      } else if (plain) {
        plain.textContent = record.content;
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
  function renderHomepage() {
    sectionKeys.forEach(section => api(section).then(data => section === 'tema' ? updateFive(data) : updateHomepageSection(section, data)).catch(() => {}));
  }
  function renderList(section) {
    api(section).then(data => {
      const latest = latestByName(data.records);
      if (!latest.size) return;
      const list = document.querySelector('.inner-list'); list.textContent = '';
      const ordered=[...latest.entries()].sort(([nameA],[nameB])=>{const a=data.stats[nameA]||{accuracy:0,hits:0};const b=data.stats[nameB]||{accuracy:0,hits:0};return b.accuracy-a.accuracy||b.hits-a.hits||nameA.localeCompare(nameB,'zh-CN');});
      ordered.forEach(([name,record]) => {
        const row=document.createElement('a'); row.className='inner-row has-stats'; row.href=section+'-1.html?source='+encodeURIComponent(name);
        const nameNode=document.createElement('span'); nameNode.className='inner-name'; nameNode.textContent=name;
        const side=document.createElement('span'); side.className='row-side';
        const value=document.createElement('span'); value.className='inner-value'; value.textContent=record.content;
        const badge=document.createElement('span'); badge.className='accuracy-badge'; const stat=data.stats[name]||{accuracy:0,hits:0,settled:0}; badge.textContent=stat.settled+'期中'+stat.hits+'期';
        side.append(value,badge); row.append(nameNode,side); list.appendChild(row);
      });
    }).catch(() => {});
  }
  function renderDetail(section) {
    const params = new URLSearchParams(location.search);
    const source = params.get('source') || (document.querySelector('.inner-title') || {}).textContent || '';
    const title = document.querySelector('.inner-title'); if (title && params.get('source')) title.textContent = source;
    api(section).then(data => {
      const records = data.records.filter(r => r.source_name === source.trim());
      if (!records.length) return;
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
      records.forEach(record => {
        const row=document.createElement('div'); row.className='record';
        const period=document.createElement('span'); period.className='period'; period.textContent='第'+record.period+'期';
        const value=document.createElement('span'); value.className='value'; value.textContent=record.content;
        const result=document.createElement('span'); result.className='ok'+(record.hit_status==='miss'?' miss':''); result.textContent=record.hit_status==='hit'?'✓':record.hit_status==='miss'?'×':'待';
        row.append(period,value,result); list.appendChild(row);
      });
    }).catch(() => {});
  }
  function ensureAdStyles(){
    if(document.getElementById('bannerAdStyles'))return;
    const style=document.createElement('style'); style.id='bannerAdStyles';
    style.textContent='.banner-ad{display:block;width:100%;margin:10px 0 14px;border:1px solid #453a20;border-radius:8px;overflow:hidden;background:#151515;line-height:0}.banner-ad img{display:block;width:100%;height:auto;aspect-ratio:7.5/1;object-fit:cover}.banner-ad:focus-visible{outline:2px solid #efcd68;outline-offset:2px}.site-footer{margin:18px 0 0;padding:24px 14px 28px;border-top:1px solid #6a531e;background:linear-gradient(180deg,#12100a,#090909);text-align:center;color:#8f8f8f}.site-footer strong{display:block;color:#e6c45e;font-size:17px;margin-bottom:8px}.site-footer p{margin:5px 0;font-size:12px}.site-footer button{margin-top:12px;padding:8px 18px;border:1px solid #65501e;border-radius:7px;background:#1c170c;color:#e4c35e;font:700 13px inherit}.site-footer button:active{transform:translateY(1px)}@media(max-width:650px){.banner-ad{margin:8px 0 11px;border-radius:6px}.site-footer{margin-top:14px;padding:21px 10px 24px}}';
    document.head.appendChild(style);
  }
  function makeAd(position,label){
    const ad=document.createElement('a'); ad.className='banner-ad'; ad.href='#'; ad.dataset.adPosition=position; ad.setAttribute('aria-label',label);
    const image=document.createElement('img'); image.src='ad-placeholder.svg'; image.alt=label; image.loading='lazy'; ad.appendChild(image);
    ad.addEventListener('click',event=>{if(ad.dataset.active!=='1')event.preventDefault();}); return ad;
  }
  function loadAds(){
    fetch('api/ads.php',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(data=>{
      document.querySelectorAll('.banner-ad[data-ad-position]').forEach(ad=>{const item=data.ads&&data.ads[ad.dataset.adPosition];if(!item)return;ad.querySelector('img').src=item.image;ad.dataset.active='1';if(item.link){ad.href=item.link;ad.target='_blank';ad.rel='noopener noreferrer';}else ad.removeAttribute('href');
        const send=event=>{const body=new URLSearchParams({position_key:ad.dataset.adPosition,event_type:event,device:/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)||innerWidth<760?'mobile':'desktop',page_path:location.pathname});if(event==='click'&&navigator.sendBeacon){navigator.sendBeacon('api/track-ad.php',body);return;}fetch('api/track-ad.php',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),keepalive:true}).catch(()=>{});};
        ad.addEventListener('click',()=>send('click'));
      });
    }).catch(()=>{});
  }
  function boot() {
    const file = location.pathname.split('/').pop() || 'index.html';
    if (file === 'index.html' || file === '') {
      ensureAdStyles();
      document.querySelectorAll('section.card.section').forEach((section,index)=>{
        if(section.nextElementSibling&&section.nextElementSibling.classList.contains('banner-ad'))return;
        section.after(makeAd('home-'+(index+1),'横幅广告位 '+(index+1)));
      });
      if(!document.querySelector('.site-footer')){
        const footer=document.createElement('footer'); footer.className='site-footer';
        const name=document.createElement('strong'); name.textContent='平特一肖资料站';
        const note=document.createElement('p'); note.textContent='资料仅供参考，请理性浏览';
        const copy=document.createElement('p'); copy.textContent='© '+new Date().getFullYear()+' 平特资料站';
        const top=document.createElement('button'); top.type='button'; top.textContent='返回顶部'; top.addEventListener('click',()=>scrollTo({top:0,behavior:'smooth'}));
        footer.append(name,note,copy,top); document.body.appendChild(footer);
      }
      track('home');
      renderHomepage();
      document.querySelectorAll('#lotteryMenu button').forEach(button => button.addEventListener('click', () => setTimeout(()=>{renderHomepage();track('home');}, 0)));
      loadAds();
      return;
    }
    const match = file.match(/^([a-z]+)(?:-(\d+))?(?:\.html)?$/);
    if (!match || !sectionKeys.includes(match[1])) return;
    ensureAdStyles();
    const list=document.querySelector('.inner-list');
    if(list){const ad=makeAd(match[2]?'detail':'list',match[2]?'内容页广告位':'列表页广告位');match[2]?list.before(ad):document.querySelector('.topbar')?.after(ad);loadAds();}
    track(match[1]);
    match[2] ? renderDetail(match[1]) : renderList(match[1]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
