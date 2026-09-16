// ==UserScript==
// @name         Makers Weekly Collector — Tuesday + Thursday
// @namespace    https://github.com/TheMakersFFL/the-makers/
// @version      1.2.5
// @description  Collect Yahoo Fantasy league data twice a week for The Makers, with verified matchup scores, clean lineups, projections, transactions and waiver data.
// @match        https://football.fantasysports.yahoo.com/f1/*
// @match        https://football.fantasysports.yahoo.com/*/f1/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_setClipboard
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/TheMakersFFL/the-makers/main/Makers_Weekly_Collector.user.js
// @downloadURL  https://raw.githubusercontent.com/TheMakersFFL/the-makers/main/Makers_Weekly_Collector.user.js
// ==/UserScript==

(function(){
  'use strict';

  const SCHEMA='makers-weekly-collector/v2';
  const VERSION='1.2.5';
  const EXPECTED_LEAGUE_ID='471058';
  const KNOWN_TEAMS={
    'The Eviscerators':'Andrew',
    'The Moose Knuckles':'Jim',
    'TDs In Your Face':'Nick',
    'The Mustache riders':'TomD',
    'Criterus':'Chris',
    'Kareem all over your Hunt':'Billy',
    'Pump and Go':'Tommy',
    'The A Gap':'Adam',
    'Predacious Fungi':'Max',
    'Revenge of the period bloods':'Nate'
  };
  const TEAM_ALIASES={
    'Eviscerators':'The Eviscerators',
    'TDs IN YO FACE':'TDs In Your Face',
    'TDs IN YOUR FACE':'TDs In Your Face',
    'Dem TDs':'TDs In Your Face',
    'The Mustache Riders':'The Mustache riders',
    'Revenge of the Period Bloods':'Revenge of the period bloods',
    'Playing Waddle pays the Price':'Kareem all over your Hunt'
  };
  const KNOWN_TEAM_IDS_2026={
    'The Moose Knuckles':1,
    'TDs In Your Face':2,
    'Predacious Fungi':3,
    'Criterus':4,
    'The Mustache riders':5,
    'Revenge of the period bloods':6,
    'The Eviscerators':7,
    'The A Gap':8,
    'Pump and Go':9,
    'Kareem all over your Hunt':10
  };
  const TEAM_SEARCH=[...Object.keys(KNOWN_TEAMS).map(t=>[t,t]),...Object.entries(TEAM_ALIASES)];
  const POS=['QB','RB','WR','TE','K','DEF'];
  const AVAILABLE_LIMITS={QB:15,RB:25,WR:25,TE:15,K:10,DEF:10};
  const STARTER_SLOTS=new Set(['QB','RB','WR','TE','W/R/T','W/R','R/W/T','FLEX','K','DEF','D/ST']);
  const BENCH_SLOTS=new Set(['BN','BENCH','IR','IR+','NA']);

  const clean=v=>String(v??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9+/.:-]+/g,' ').trim();
  const num=v=>{const s=String(v??'').replace(/[$,% ,]/g,'').replace(/^−/,'-');const n=Number(s);return Number.isFinite(n)?n:null};
  const now=()=>new Date().toISOString();
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uniq=a=>[...new Set((a||[]).filter(Boolean))];

  function context(){
    const p=location.pathname;
    const archived=p.match(/\/(\d{4})\/f1\/(\d+)/);
    const current=p.match(/\/f1\/(\d+)/);
    const leagueId=archived?.[2]||current?.[1]||'';
    let season=archived?Number(archived[1]):new Date().getFullYear();
    if(!archived){
      const seasonMatch=(document.body?.innerText||'').slice(0,12000).match(/\b(20\d{2})\s+Season\b/i);
      if(seasonMatch)season=Number(seasonMatch[1]);
    }
    const base=leagueId?(archived?`${location.origin}/${season}/f1/${leagueId}`:`${location.origin}/f1/${leagueId}`):'';
    return {season,leagueId,base};
  }
  const CTX=context();
  if(!CTX.base||!CTX.leagueId)return;
  if(String(CTX.leagueId)!==EXPECTED_LEAGUE_ID)return;

  const BIND_KEY='MAKERSFF:weeklyCollector:boundLeague';
  const scope=()=>`${CTX.season}:${CTX.leagueId}`;
  const boundScope=()=>String(GM_getValue(BIND_KEY,'')||'');
  const isBoundHere=()=>boundScope()===scope();
  const bindHere=()=>{GM_setValue(BIND_KEY,scope());location.reload()};
  const unbind=()=>{GM_deleteValue(BIND_KEY);location.reload()};
  const key=s=>`MAKERSFF:${CTX.season}:${CTX.leagueId}:${s}`;

  function initialState(){return {mode:'post-mnf',targetWeek:2,captures:[],data:{},teamMap:[],updatedAt:null}}
  let state=GM_getValue(key('state'),initialState());
  if(!state||typeof state!=='object')state=initialState();
  state.captures=Array.isArray(state.captures)?state.captures:[];
  state.data=state.data&&typeof state.data==='object'?state.data:{};
  state.teamMap=Array.isArray(state.teamMap)?state.teamMap:[];
  if(!state.targetWeek)state.targetWeek=2;
  const storedVersion=String(GM_getValue(key('collectorVersion'),'')||'');
  if(storedVersion!==VERSION){
    state={...initialState(),mode:state.mode||'post-mnf',targetWeek:state.targetWeek||2,teamMap:state.teamMap||[]};
    GM_setValue(key('collectorVersion'),VERSION);
    GM_setValue(key('state'),state);
  }
  const saveState=()=>{state.updatedAt=now();GM_setValue(key('state'),state);render()};

  function textOf(el){return clean(el?.innerText||el?.textContent||'')}
  function findKnownTeams(text){
    const n=norm(text),hits=TEAM_SEARCH.map(([label,canonical])=>({canonical,i:n.indexOf(norm(label))})).filter(x=>x.i>=0).sort((a,b)=>a.i-b.i);
    const seen=new Set(),out=[];for(const x of hits){if(!seen.has(x.canonical)){seen.add(x.canonical);out.push(x.canonical)}}return out;
  }
  const managerForTeam=team=>KNOWN_TEAMS[team]||'';

  function detectKind(url=location.href,root=document){
    const u=new URL(url,location.href),p=u.pathname.toLowerCase().replace(/\/+$/,''),basePath=new URL(CTX.base).pathname.toLowerCase().replace(/\/+$/,'');
    if(p===basePath)return 'league';
    if(/\/transactions(?:\/|$)/.test(p))return 'transactions';
    if(/\/standings(?:\/|$)/.test(p))return 'standings';
    if(/\/players(?:\/|$)/.test(p))return 'players';
    if(new RegExp(`/f1/${CTX.leagueId}/\\d+(?:/|$)`).test(p))return 'roster';
    const body=textOf(root.body||root).slice(0,12000).toLowerCase();
    if(body.includes('available players'))return 'players';
    if(body.includes('matchup')||body.includes('matchups')||body.includes('scoreboard'))return 'matchups';
    if(body.includes('league standings'))return 'standings';
    if(body.includes('recent transactions'))return 'transactions';
    return 'league';
  }

  function pageRows(root=document){
    const out=[];root.querySelectorAll('tr,li,article').forEach(el=>{const t=textOf(el);if(t&&t.length<2200)out.push(t)});return uniq(out).slice(0,2200);
  }
  function capture(root,url,title,kind){
    const raw=textOf(root.body||root);return {kind,url,title:clean(title),capturedAt:now(),text:raw.slice(0,220000),rows:pageRows(root)};
  }

  function discoverTeamMap(root=document){
    const found=[];
    root.querySelectorAll('a[href]').forEach(a=>{
      let u;try{u=new URL(a.href,location.href)}catch{return}
      const m=u.pathname.match(new RegExp(`/f1/${CTX.leagueId}/(\\d+)(?:/|$)`));if(!m)return;
      const id=Number(m[1]);if(!(id>=1&&id<=30))return;
      const teams=findKnownTeams(`${textOf(a)} ${textOf(a.closest('tr,li,article,div')||a)}`);
      for(const team of teams)found.push({yahooTeamId:id,team,manager:managerForTeam(team),url:`${CTX.base}/${id}`});
    });
    const by={};for(const x of found)by[x.team]=x;return Object.values(by);
  }
  function mergeTeamMap(a=[],b=[]){const by={};for(const x of [...a,...b])if(x.team)by[x.team]=x;return Object.values(by)}

  function bestHeaders(table,cellCount=0){
    const rows=[...table.querySelectorAll('thead tr')].map((tr,idx)=>({idx,headers:[...tr.children].map(th=>norm(textOf(th)))})).filter(x=>x.headers.length);
    if(!rows.length){
      const first=[...table.querySelectorAll('tr')].find(tr=>tr.querySelector('th'));
      if(first)rows.push({idx:0,headers:[...first.children].map(th=>norm(textOf(th)))})
    }
    if(!rows.length)return [];
    rows.sort((a,b)=>Math.abs(a.headers.length-cellCount)-Math.abs(b.headers.length-cellCount)||b.idx-a.idx);
    return rows[0].headers;
  }
  function tableRows(root=document){
    const out=[];
    root.querySelectorAll('table').forEach(table=>{
      [...table.querySelectorAll('tbody tr')].forEach(tr=>{
        const cellEls=[...tr.children],cells=cellEls.map(td=>textOf(td));if(!cells.length)return;
        let headers=bestHeaders(table,cells.length);
        const labels=cellEls.map(td=>norm(td.getAttribute('data-label')||td.getAttribute('aria-label')||''));
        if(labels.some(Boolean))headers=labels.map((x,i)=>x||headers[i]||'');
        out.push({table,headers,cells,cellEls,row:tr,text:textOf(tr)});
      });
    });
    return out;
  }
  function hix(headers,variants){
    for(const v of variants){const nv=norm(v);let i=headers.findIndex(h=>h===nv);if(i>=0)return i;i=headers.findIndex(h=>h.includes(nv));if(i>=0)return i}return -1;
  }

  function parseStandings(root=document){
    const out=[];
    for(const r of tableRows(root)){
      if(!r.headers.some(x=>/team|manager/.test(x)))continue;
      if(!r.headers.some(x=>x==='w'||x==='w-l-t'||x==='w-l'||x.includes('points for')||x==='pf'))continue;
      const teams=findKnownTeams(r.text);if(teams.length!==1)continue;
      const team=teams[0],h=r.headers,c=r.cells;
      const iRank=hix(h,['rank','#']),iRec=hix(h,['w-l-t','w-l','record']),iW=hix(h,['wins','w']),iL=hix(h,['losses','l']),iPF=hix(h,['points for','pf']),iPA=hix(h,['points against','pa']),iStreak=hix(h,['streak']),iBudget=hix(h,['waiver budget','waiver bdgt','faab','budget']),iWaiver=hix(h,['waiver']);
      let w=iW>=0?num(c[iW]):null,l=iL>=0?num(c[iL]):null,record=iRec>=0?c[iRec]:'';
      if((w==null||l==null)&&record){const m=record.match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);if(m){w=+m[1];l=+m[2]}}
      out.push({rank:iRank>=0?num(c[iRank]):null,team,manager:managerForTeam(team),record:record||`${w??0}-${l??0}`,w:w??0,l:l??0,pf:iPF>=0?num(c[iPF]):null,pa:iPA>=0?num(c[iPA]):null,streak:iStreak>=0?c[iStreak]:'',faab:iBudget>=0?num(c[iBudget]):null,waiverPriority:iWaiver>=0?num(c[iWaiver]):null,sourceText:r.text});
    }
    const by={};for(const x of out)if(x.team&&!by[x.team])by[x.team]=x;
    if(Object.keys(by).length<10){
      const candidates=[...root.querySelectorAll('tr,[role="row"],li,article,div')]
        .map(el=>({el,text:textOf(el)}))
        .filter(x=>x.text&&x.text.length<650&&findKnownTeams(x.text).length===1&&/\b\d+\s*-\s*\d+(?:\s*-\s*\d+)?\b/.test(x.text))
        .sort((a,b)=>a.text.length-b.text.length);
      for(const x of candidates){
        const team=findKnownTeams(x.text)[0];if(by[team])continue;
        const rm=x.text.match(/\b(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?\b/);if(!rm)continue;
        const after=x.text.slice((rm.index||0)+rm[0].length);
        const vals=[...after.matchAll(/(?:^|\s)(\d{1,4}(?:\.\d{1,2})?)(?=\s|$)/g)].map(m=>Number(m[1]));
        const rankMatch=x.text.match(/^\s*(\d{1,2})\b/),budget=x.text.match(/\$(\d{1,3})\b/),streak=x.text.match(/\b([WL]-?\d+)\b/i);
        by[team]={rank:rankMatch?Number(rankMatch[1]):null,team,manager:managerForTeam(team),record:rm[0],w:Number(rm[1]),l:Number(rm[2]),pf:vals[0]??null,pa:vals[1]??null,streak:streak?streak[1]:'',faab:budget?Number(budget[1]):null,waiverPriority:null,sourceText:x.text};
        if(Object.keys(by).length>=10)break;
      }
    }
    return Object.values(by);
  }

  function scoreTokens(text){
    const s=String(text||'').replace(/−|–|—/g,'-');
    const decimals=[...s.matchAll(/(?<![\w.])-?\d{1,3}\.\d{1,2}(?![\w.])/g)].map(m=>Number(m[0])).filter(n=>Number.isFinite(n)&&Math.abs(n)<250);
    if(decimals.length>=2)return decimals;
    return [...s.matchAll(/(?<![\w.])(-?\d{1,3}(?:\.\d{1,2})?)(?![\w.])/g)].map(m=>+m[1]).filter(n=>Number.isFinite(n)&&Math.abs(n)<250);
  }
  function parseMatchups(root=document,week=state.targetWeek,forceFinal=false){
    const pageFinal=Boolean(forceFinal),raw=[];
    root.querySelectorAll('tr,[role="row"],li,article,section,div').forEach(el=>{
      const t=textOf(el);if(!t||t.length>1800)return;
      const teams=findKnownTeams(t);if(teams.length!==2)return;
      const hasVs=/(?:^|\s)vs\.?\s|\bversus\b/i.test(t);
      const scoreEls=[...el.querySelectorAll('[class*="score" i],[data-tst*="score" i],[class*="projection" i],[data-tst*="projection" i]')];
      const nums=scoreTokens(t),teamLinks=[...el.querySelectorAll('a[href]')].filter(a=>{try{return new RegExp(`/f1/${CTX.leagueId}/\\d+(?:/|$)`).test(new URL(a.href,location.href).pathname)}catch{return false}}).length;
      if(!hasVs&&!pageFinal)return;if(nums.length<2&&scoreEls.length<2)return;
      const rowFinal=/\bfinal\b|completed|closed/i.test(t),quality=(hasVs?1000:0)+(nums.length>=4?360:nums.length>=2?180:0)+(scoreEls.length>=4?180:scoreEls.length>=2?90:0)+(teamLinks>=2?120:0)+(rowFinal?80:0)-Math.min(160,t.length/8);
      raw.push({el,text:t,teams,hasVs,quality});
    });

    function chooseBest(candidates){
      const byPair=new Map();
      for(const c of candidates){const k=[...c.teams].sort().join('|'),prev=byPair.get(k);if(!prev||c.quality>prev.quality)byPair.set(k,c)}
      const pairMap=byPair,teams=Object.keys(KNOWN_TEAMS),memo=new Map();
      function solve(remaining){
        if(remaining.length<2)return {items:[],score:0};
        const key=remaining.join('||');if(memo.has(key))return memo.get(key);
        const a=remaining[0];let best=solve(remaining.slice(1));best={items:[...best.items],score:best.score};
        for(let i=1;i<remaining.length;i++){
          const b=remaining[i],pk=[a,b].sort().join('|'),cand=pairMap.get(pk);if(!cand)continue;
          const next=remaining.filter((_,idx)=>idx!==0&&idx!==i),res=solve(next),items=[cand,...res.items],score=cand.quality+res.score;
          if(items.length>best.items.length||(items.length===best.items.length&&score>best.score))best={items,score};
        }
        memo.set(key,best);return best;
      }
      return solve(teams).items.slice(0,5);
    }

    let chosen=chooseBest(raw.filter(c=>c.hasVs));if(chosen.length<5)chosen=chooseBest(raw);
    const out=[];
    for(const c of chosen){
      const [a,b]=c.teams,textNums=scoreTokens(c.text),semanticNums=[...c.el.querySelectorAll('[class*="score" i],[data-tst*="score" i],[class*="projection" i],[data-tst*="projection" i]')].map(x=>num(textOf(x))).filter(x=>x!=null&&Math.abs(x)<250);
      const nums=textNums.length>=4?textNums:(semanticNums.length>=2?semanticNums:textNums),rowFinal=/\bfinal\b|completed|closed/i.test(c.text),isFinal=pageFinal||rowFinal;
      let scoreA=null,scoreB=null,projA=null,projB=null,status='SCHEDULED';
      if(nums.length>=4){
        if(isFinal){scoreA=nums[0];projA=nums[1];scoreB=nums[2];projB=nums[3];status='FINAL'}
        else{const aNow=nums[0],bNow=nums[2];projA=nums[1];projB=nums[3];if((aNow||0)!==0||(bNow||0)!==0){scoreA=aNow;scoreB=bNow;status='LIVE'}}
      }else if(nums.length>=2){
        if(isFinal){scoreA=nums[0];scoreB=nums[1];status='FINAL'}else{projA=nums[0];projB=nums[1]}
      }
      out.push({week:Number(week)||1,teamA:a,teamB:b,scoreA,scoreB,projA,projB,status,final:status==='FINAL',sourceText:c.text});
    }
    return out;
  }

  function splitPlayerNameStatus(v){
    let name=clean(v).replace(/^[^\p{L}\p{N}.'’\-]+/u,'').replace(/Video Forecast.*$/i,'').replace(/No new player Notes?.*$/i,'').replace(/New Player Note.*$/i,'').replace(/Player Note.*$/i,'').replace(/New$/,'').trim();
    let status='';const sm=name.match(/(?:IR-R|PUP-R|NFI-R|IR\+|IR|PUP|NFI|SUSP|OUT|CEL|NA|O|Q|D)$/);if(sm){status=sm[0];name=name.slice(0,-sm[0].length).trim()}return {name,status};
  }
  function slotFromText(v=''){
    const s=clean(v).toUpperCase().replace(/^[^A-Z]+/,'');
    const m=s.match(/^(W\/R\/T|R\/W\/T|W\/R|FLEX|D\/ST|DEF|QB|RB|WR|TE|K|BN|BENCH|IR\+?|NA)/);
    return m?m[1]:'';
  }
  function inferPlayerPos(text=''){
    const hits=String(text).toUpperCase().match(/\b(QB|RB|WR|TE|K|DEF|D\/ST)\b/g)||[];return hits.find(x=>x!=='D/ST')||hits[0]||'';
  }
  function inferNflTeam(text=''){
    const m=String(text).match(/\b([A-Za-z]{2,3})\s*-\s*(?:QB|RB|WR|TE|K|DEF|D\/ST)\b/i);return m?m[1].toUpperCase():'';
  }
  function inferOpponent(text=''){
    const m=String(text).match(/(?:\bvs\.?|@)\s+([A-Za-z]{2,3})\b/i);return m?m[1].toUpperCase():'';
  }
  function looksLikePlayerRow(r){
    if(findKnownTeams(r.text).length)return false;
    const t=norm(r.text);if(!t||t.length<8||t.length>1200)return false;
    return /\b[A-Za-z]{2,3}\s*-\s*(?:QB|RB|WR|TE|K|DEF|D\/ST)\b/i.test(r.text);
  }
  function pickName(r){
    const anchors=[...r.row.querySelectorAll('a[href]')].map(a=>textOf(a)).filter(x=>x&&x.length>=2&&x.length<90&&!findKnownTeams(x).length);
    const plausible=anchors.find(x=>/\p{L}/u.test(x)&&!/video|forecast|note|watch|add|drop|research|matchup/i.test(x));
    if(plausible)return splitPlayerNameStatus(plausible);
    const iPlayer=hix(r.headers,['player','players','offense','kickers','defense/special teams']);if(iPlayer>=0&&r.cells[iPlayer])return splitPlayerNameStatus(r.cells[iPlayer].split('\n')[0]);
    const lines=String(r.text).split(/\n+/).map(clean).filter(Boolean);
    for(let i=1;i<lines.length;i++)if(/^([A-Za-z]{2,3})\s*-\s*(?:QB|RB|WR|TE|K|DEF|D\/ST)$/i.test(lines[i]))return splitPlayerNameStatus(lines[i-1]);
    const m=r.text.match(/^(.{2,100}?)(?=\s+[A-Za-z]{2,3}\s*-\s*(?:QB|RB|WR|TE|K|DEF|D\/ST)\b)/i);return splitPlayerNameStatus(m?m[1]:r.cells[0]||'');
  }
  function numericAt(r,index){return index>=0?num(r.cells[index]):null}
  function inferRowStatus(name,text,base=''){
    if(base)return base;const escaped=String(name||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(!escaped)return '';
    const m=String(text).match(new RegExp(`${escaped}\\s*(IR-R|PUP-R|NFI-R|IR\\+|IR|PUP|NFI|SUSP|OUT|CEL|NA|O|Q|D)(?=Video|Player|New|No|\\s|$)`,'i'));
    return m?m[1].toUpperCase():'';
  }
  function parseRosterMetrics(text=''){
    const compact=String(text).replace(/\s+/g,'').replace(/−|–|—/g,'-');
    const m=compact.match(/(1[0-8]|[1-9])(-?\d{1,3}\.\d{1,2}|-)(-?\d{1,3}\.\d{1,2})(\d{1,3})%(\d{1,3})%/);
    if(!m)return null;
    const actual=m[2]==='-'?null:Number(m[2]);
    return {bye:Number(m[1]),points:Number.isFinite(actual)?actual:null,projected:Number(m[3]),startPct:Number(m[4]),rosteredPct:Number(m[5])};
  }
  function validPlayerName(name=''){
    const n=clean(name).toUpperCase();if(!n||n.length<2)return false;
    return !['QB','RB','WR','TE','K','DEF','D/ST','BN','BENCH','IR','IR+','NA','W/R/T','W/R','R/W/T','FLEX','Q/WR/RB/TE','WR/RB/TE'].includes(n);
  }
  function parseRoster(root=document,title=document.title,url=location.href,opts={}){
    const full=`${title} ${textOf(root.body||root).slice(0,5000)}`;
    const teams=findKnownTeams(full),team=opts.team||teams[0]||'';if(!team)return null;
    const week=Number(opts.week)||Number(new URL(url,location.href).searchParams.get('week'))||null,players=[];
    for(const r of tableRows(root)){
      if(!looksLikePlayerRow(r))continue;
      const picked=pickName(r),name=picked.name;if(!validPlayerName(name))continue;
      const h=r.headers,c=r.cells,pos=inferPlayerPos(r.text),nflTeam=inferNflTeam(r.text);if(!pos||!nflTeam)continue;
      let slot=slotFromText(r.text);if(!slot){const iSlot=hix(h,['pos','slot','position']);if(iSlot>=0)slot=slotFromText(c[iSlot])}
      if(!slot)slot=pos;
      const iPts=hix(h,['fan pts','fpts','fantasy points','pts','points']),iProj=hix(h,['proj pts','projected','proj']),iOpp=hix(h,['opp','opponent']),iStart=hix(h,['% start','start %','start']),iRos=hix(h,['% ros','rostered','% rostered']),iBye=hix(h,['bye']);
      const metrics=parseRosterMetrics(r.text);
      let points=metrics?.points??numericAt(r,iPts),projected=metrics?.projected??numericAt(r,iProj);
      if(points!=null&&Math.abs(points)>80&&metrics?.points!=null)points=metrics.points;
      const started=STARTER_SLOTS.has(slot),bench=BENCH_SLOTS.has(slot),status=inferRowStatus(name,r.text,picked.status),opponent=iOpp>=0?clean(c[iOpp]):inferOpponent(r.text);
      players.push({name,pos,nflTeam,slot,status,started,bench,points,projected,bye:metrics?.bye??numericAt(r,iBye),startPct:metrics?.startPct??numericAt(r,iStart),rosteredPct:metrics?.rosteredPct??numericAt(r,iRos),opponent,sourceText:r.text});
    }
    const by={};
    for(const p of players){
      const k=p.name.toLowerCase(),score=(p.slot?5:0)+(p.points!=null?4:0)+(p.projected!=null?3:0)+(p.nflTeam?2:0)+(p.status?1:0),prev=by[k];
      if(!prev||score>prev._quality)by[k]={...p,_quality:score};
    }
    const arr=Object.values(by).map(({_quality,...p})=>p).filter(p=>validPlayerName(p.name)).slice(0,20);
    const starters=arr.filter(p=>p.started===true),benchers=arr.filter(p=>p.bench===true);
    const sum=(xs,key)=>Number(xs.filter(p=>p[key]!=null).reduce((s,p)=>s+Number(p[key]||0),0).toFixed(2));
    return {week,team,manager:managerForTeam(team),url,players:arr,rosterCount:arr.length,starterCount:starters.length,benchCount:benchers.length,starterPoints:sum(starters,'points'),benchPoints:sum(benchers,'points'),starterProjectedPoints:sum(starters,'projected'),benchProjectedPoints:sum(benchers,'projected'),scoredStarterCount:starters.filter(p=>p.points!=null).length,projectedStarterCount:starters.filter(p=>p.projected!=null).length,source:'yahoo-team-page'};
  }

  function transactionPlayers(text=''){
    const lines=String(text).split(/\n+/).map(clean).filter(Boolean),out=[];
    for(let i=1;i<lines.length;i++){
      const m=lines[i].match(/^([A-Za-z]{2,3})\s*-\s*(QB|RB|WR|TE|K|DEF|D\/ST)$/i);if(!m)continue;
      const name=splitPlayerNameStatus(lines[i-1]).name,action=lines[i+1]||'';if(!validPlayerName(name))continue;
      out.push({name,nflTeam:m[1].toUpperCase(),pos:m[2].toUpperCase(),action});
    }
    return out;
  }
  function parseTransactions(root=document){
    const out=[];
    for(const r of tableRows(root)){
      if(!/free agent|waiver|to waivers|trade|add|drop/i.test(r.text))continue;
      const teams=findKnownTeams(r.text),team=teams[0]||'',players=transactionPlayers(r.text),added=players.filter(p=>!/to waivers|drop/i.test(p.action)),dropped=players.filter(p=>/to waivers|drop/i.test(p.action));
      const time=r.text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{1,2}:\d{2}\s*(?:am|pm)\b/i)?.[0]||'';
      const bid=r.text.match(/\$(\d+)\s+Waiver/i),isTrade=/\btrade\b/i.test(r.text),hasWaiver=players.some(p=>/waiver/i.test(p.action)&&!/to waivers/i.test(p.action));
      const type=isTrade?'TRADE':hasWaiver?'WAIVER':'ADD_DROP';
      out.push({team,manager:team?managerForTeam(team):'',type,timestamp:time,faabSpent:bid?Number(bid[1]):null,added,dropped,players,text:r.text});
    }
    const by={};for(const x of out){const k=[x.team,x.timestamp,x.type,(x.added||[]).map(p=>p.name).join(','),(x.dropped||[]).map(p=>p.name).join(','),x.faabSpent??''].join('|');if(!by[k])by[k]=x}return Object.values(by).slice(0,120);
  }
  function parseFaab(root=document){
    const out=[];for(const s of parseStandings(root)){if(s.faab!=null||s.waiverPriority!=null)out.push({team:s.team,manager:s.manager,remaining:s.faab,priority:s.waiverPriority})}return out;
  }
  function parseAvailableMetrics(text=''){
    const marker=String(text).match(/(?:W|FA|Waivers?)\s*\([^)]*\)/i);if(!marker)return null;
    const tail=String(text).slice((marker.index||0)+marker[0].length).replace(/\s+/g,'').replace(/−|–|—/g,'-');
    const m=tail.match(/^([0-9])(1[0-8]|[1-9])(-?\d{1,3}\.\d{1,2})/);if(!m)return null;
    return {gamesPlayed:Number(m[1]),bye:Number(m[2]),projected:Number(m[3])};
  }
  function parseAvailable(root=document){
    const out=[];
    for(const r of tableRows(root)){
      if(!looksLikePlayerRow(r))continue;const picked=pickName(r),name=picked.name;if(!validPlayerName(name))continue;
      const pos=inferPlayerPos(r.text),nflTeam=inferNflTeam(r.text);if(!POS.includes(pos)||!nflTeam)continue;
      const h=r.headers,iFan=hix(h,['fan pts','proj pts','projected','projection']),iPre=hix(h,['pre-season','preseason']),iActual=hix(h,['actual','actual rank']),iRos=hix(h,['% ros','% rostered','rostered']),iBye=hix(h,['bye']),metrics=parseAvailableMetrics(r.text);
      let projected=numericAt(r,iFan);if(metrics?.projected!=null)projected=metrics.projected;
      const rosteredPct=numericAt(r,iRos),status=inferRowStatus(name,r.text,picked.status),bye=metrics?.bye??numericAt(r,iBye);
      out.push({name,pos,nflTeam,status,opponent:inferOpponent(r.text),gamesPlayed:metrics?.gamesPlayed??null,bye,projected,weekProjection:projected,preseasonRank:numericAt(r,iPre),actualRank:numericAt(r,iActual),seasonRank:numericAt(r,iActual),rosteredPct,sourceText:r.text});
    }

  // v1.2.2: Yahoo renders the same transaction in multiple row layouts. Parse
  // only leaf transaction rows with one timestamp, normalize inline/separate
  // player metadata, and dedupe by the actual move rather than DOM text.
  function transactionPlayers(text=''){
    const actionRe=/(?:\$\d+\s+Waiver|Free Agent|To Waivers|Waiver|Added|Add|Dropped|Drop)/i;
    const statusRe='IR-R|PUP-R|NFI-R|IR\\+|IR|PUP|NFI|SUSP|OUT|CEL|NA|O|Q|D';
    const rawLines=String(text).split(/\n+/).map(clean).filter(Boolean).map(x=>x.replace(/^[^\p{L}\p{N}$]+/u,'').trim()).filter(Boolean);
    const out=[];
    const add=(name,nflTeam,pos,action,status='')=>{
      name=splitPlayerNameStatus(name).name.trim();action=clean(action);status=clean(status).toUpperCase();
      if(!validPlayerName(name)||!nflTeam||!pos||!actionRe.test(action))return;
      if(findKnownTeams(name).length)return;
      out.push({name,nflTeam:String(nflTeam).toUpperCase(),pos:String(pos).toUpperCase(),status,action});
    };
    for(let i=0;i<rawLines.length;i++){
      const line=rawLines[i];
      let m=line.match(new RegExp(`^(.+?)\\s+([A-Za-z]{2,3})\\s*-\\s*(QB|RB|WR|TE|K|DEF|D\\/ST)(?:\\s+(${statusRe}))?(?:\\s+(.+))?$`,'i'));
      if(m){
        let action=m[5]||'';
        if(!actionRe.test(action)){
          for(let j=i+1;j<Math.min(rawLines.length,i+4);j++){if(actionRe.test(rawLines[j])){action=rawLines[j];break}}
        }
        add(m[1],m[2],m[3],action,m[4]||'');
        continue;
      }
      m=line.match(new RegExp(`^([A-Za-z]{2,3})\\s*-\\s*(QB|RB|WR|TE|K|DEF|D\\/ST)(?:\\s+(${statusRe}))?(?:\\s+(.+))?$`,'i'));
      if(m&&i>0){
        let action=m[4]||'';
        if(!actionRe.test(action)){
          for(let j=i+1;j<Math.min(rawLines.length,i+4);j++){if(actionRe.test(rawLines[j])){action=rawLines[j];break}}
        }
        add(rawLines[i-1],m[1],m[2],action,m[3]||'');
      }
    }
    // Fallback for Yahoo rows collapsed into one line.
    const flat=rawLines.join(' '),re=new RegExp(`([A-Za-z0-9.'’&\\- ]{2,70}?)\\s+([A-Za-z]{2,3})\\s*-\\s*(QB|RB|WR|TE|K|DEF|D\\/ST)(?:\\s+(${statusRe}))?\\s+(\\$\\d+\\s+Waiver|Free Agent|To Waivers|Waiver|Added|Add|Dropped|Drop)`,'gi');
    for(const m of flat.matchAll(re))add(m[1].replace(/.*(?:Free Agent|To Waivers|Waiver|Added|Add|Dropped|Drop)\s+/i,''),m[2],m[3],m[5],m[4]||'');
    const by={};for(const p of out){const k=[p.name.toLowerCase(),p.nflTeam,p.pos,norm(p.action)].join('|');if(!by[k])by[k]=p}return Object.values(by);
  }
  function parseTransactions(root=document){
    const out=[],timeRe=/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{1,2}:\d{2}\s*(?:am|pm)\b/ig;
    for(const r of tableRows(root)){
      if(!/free agent|waiver|to waivers|trade|add|drop/i.test(r.text))continue;
      const times=[...String(r.text).matchAll(timeRe)].map(m=>m[0]);
      // Parent/wrapper rows can contain multiple transactions. Child rows are
      // parsed separately, so ignore wrappers instead of exporting duplicates.
      if(times.length!==1)continue;
      const teams=findKnownTeams(r.text);if(teams.length!==1)continue;
      const team=teams[0],players=transactionPlayers(r.text),isTrade=/\btrade\b/i.test(r.text);
      if(!players.length&&!isTrade)continue;
      const added=players.filter(p=>/free agent|(?<!to\s)waiver|\badd(?:ed)?\b/i.test(p.action)&&!/to waivers/i.test(p.action));
      const dropped=players.filter(p=>/to waivers|\bdrop(?:ped)?\b/i.test(p.action));
      const bid=r.text.match(/\$(\d+)\s+Waiver/i),hasWaiver=added.some(p=>/waiver/i.test(p.action));
      const type=isTrade?'TRADE':hasWaiver?'WAIVER':'ADD_DROP';
      out.push({team,manager:managerForTeam(team),type,timestamp:times[0],faabSpent:bid?Number(bid[1]):null,added,dropped,players,text:r.text});
    }
    const by={};
    for(const x of out){
      const moveSig=(x.players||[]).map(p=>`${p.name.toLowerCase()}:${norm(p.action)}`).sort().join(',');
      const k=[x.team,x.timestamp,moveSig].join('|');
      const quality=(x.players||[]).length*10+(x.added||[]).length+(x.dropped||[]).length+(x.faabSpent!=null?2:0);
      if(!by[k]||quality>by[k]._quality)by[k]={...x,_quality:quality};
    }
    return Object.values(by).map(({_quality,...x})=>x).slice(0,120);
  }
    const by={};for(const p of out){const k=`${p.name}|${p.pos}`;if(!by[k])by[k]=p}return Object.values(by);
  }


  function transactionPlayersV125(text=''){
    const actionRe=/(?:\$\d+\s+Waiver|Free Agent|To Waivers|From Waivers|Waiver(?: Claim)?|Added|Add|Dropped|Drop|Waived)/i;
    const statusRe='IR-R|PUP-R|NFI-R|IR\\+|IR|PUP|NFI|SUSP|OUT|CEL|NA|O|Q|D';
    const rawLines=String(text).split(/\n+/).map(clean).filter(Boolean).map(x=>x.replace(/^[^\p{L}\p{N}$]+/u,'').trim()).filter(Boolean),out=[];
    const add=(name,nflTeam,pos,action,status='')=>{
      name=splitPlayerNameStatus(name).name.trim();action=clean(action);status=clean(status).toUpperCase();
      if(!validPlayerName(name)||!nflTeam||!pos||!actionRe.test(action)||findKnownTeams(name).length)return;
      out.push({name,nflTeam:String(nflTeam).toUpperCase(),pos:String(pos).toUpperCase(),status,action});
    };
    const nextAction=i=>{for(let j=i+1;j<Math.min(rawLines.length,i+4);j++){if(actionRe.test(rawLines[j]))return rawLines[j]}return ''};
    for(let i=0;i<rawLines.length;i++){
      const line=rawLines[i];
      let m=line.match(new RegExp(`^(.+?)\\s+([A-Za-z]{2,3})\\s*-\\s*(QB|RB|WR|TE|K|DEF|D\\/ST)(?:\\s+(${statusRe}))?(?:\\s+(.+))?$`,'i'));
      if(m){add(m[1],m[2],m[3],actionRe.test(m[5]||'')?(m[5]||''):nextAction(i),m[4]||'');continue}
      m=line.match(new RegExp(`^([A-Za-z]{2,3})\\s*-\\s*(QB|RB|WR|TE|K|DEF|D\\/ST)(?:\\s+(${statusRe}))?(?:\\s+(.+))?$`,'i'));
      if(m&&i>0)add(rawLines[i-1],m[1],m[2],actionRe.test(m[4]||'')?(m[4]||''):nextAction(i),m[3]||'');
    }
    const flat=rawLines.join(' '),re=new RegExp(`([A-Za-z0-9.'’&\\- ]{2,70}?)\\s+([A-Za-z]{2,3})\\s*-\\s*(QB|RB|WR|TE|K|DEF|D\\/ST)(?:\\s+(${statusRe}))?\\s+(\\$\\d+\\s+Waiver|Free Agent|To Waivers|From Waivers|Waiver(?: Claim)?|Added|Add|Dropped|Drop|Waived)`,'gi');
    for(const m of flat.matchAll(re))add(m[1].replace(/.*(?:Free Agent|To Waivers|From Waivers|Waiver(?: Claim)?|Added|Add|Dropped|Drop|Waived)\s+/i,''),m[2],m[3],m[5],m[4]||'');
    const by={};for(const p of out){const k=[p.name.toLowerCase(),p.nflTeam,p.pos,norm(p.action)].join('|');if(!by[k])by[k]=p}return Object.values(by);
  }

  function parseTransactionsV125(root=document){
    const out=[],timeRe=/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{1,2}:\d{2}\s*(?:am|pm)\b/ig;
    for(const r of tableRows(root)){
      if(!/free agent|waiver|to waivers|trade|add|drop/i.test(r.text))continue;
      const times=[...String(r.text).matchAll(timeRe)].map(m=>m[0]);
      if(times.length!==1)continue;
      const teams=findKnownTeams(r.text);if(teams.length!==1)continue;
      const team=teams[0],players=transactionPlayersV125(r.text),isTrade=/\btrade(?:d)?\b/i.test(r.text);
      if(!players.length&&!isTrade)continue;
      const dropped=players.filter(p=>/to waivers|\bdrop(?:ped)?\b|\bwaived\b/i.test(p.action));
      const added=players.filter(p=>!dropped.includes(p)&&/free agent|from waivers|(?<!to\s)waiver|\badd(?:ed)?\b/i.test(p.action));
      const bid=r.text.match(/\$(\d+)\s*(?:FAAB|Waiver)/i),hasWaiver=added.some(p=>/waiver/i.test(p.action));
      const type=isTrade?'TRADE':hasWaiver?'WAIVER':'ADD_DROP';
      out.push({team,manager:managerForTeam(team),type,timestamp:times[0],faabSpent:bid?Number(bid[1]):null,added,dropped,players,text:r.text});
    }
    const by={};
    for(const x of out){
      const moveSig=(x.players||[]).map(p=>`${p.name.toLowerCase()}:${norm(p.action)}`).sort().join(','),k=[x.team,x.timestamp,moveSig].join('|');
      const quality=(x.players||[]).length*10+(x.added||[]).length+(x.dropped||[]).length+(x.faabSpent!=null?2:0);
      if(!by[k]||quality>by[k]._quality)by[k]={...x,_quality:quality};
    }
    return Object.values(by).map(({_quality,...x})=>x).slice(0,120);
  }

  function compactTransactionsV125(arr=[]){
    const groups={};
    for(const x of arr||[]){if(!x)continue;const g=`${x.team||''}|${x.timestamp||''}`;(groups[g]||(groups[g]=[])).push(x)}
    const out=[];
    for(const items of Object.values(groups)){
      const structured=items.filter(x=>(x.players||[]).length||(x.added||[]).length||(x.dropped||[]).length||x.type==='TRADE'),source=structured.length?structured:items,by={};
      for(const x of source){
        const players=(x.players||[]).map(p=>`${String(p.name||'').toLowerCase()}:${norm(p.action||'')}`).sort().join(','),sig=players||norm(x.text||''),k=[x.team||'',x.timestamp||'',x.type||'',sig,x.faabSpent??''].join('|');
        const quality=(x.players||[]).length*10+(x.added||[]).length+(x.dropped||[]).length+(x.faabSpent!=null?2:0);
        if(!by[k]||quality>(by[k]._quality||0))by[k]={...x,_quality:quality};
      }
      out.push(...Object.values(by).map(({_quality,...x})=>x));
    }
    return out;
  }

  function mergeKeyed(oldArr,newArr,keyFn){const by={};for(const x of [...(oldArr||[]),...(newArr||[])]){const k=keyFn(x);if(k)by[k]=x}return Object.values(by)}
  function transactionIdentity(x={}){return [x.team||'',x.timestamp||'',x.type||'',(x.added||[]).map(p=>p.name).join(','),(x.dropped||[]).map(p=>p.name).join(','),x.faabSpent??''].join('|')||norm(x.text||'')}
  function mergeData(old={},patch={}){
    const o={...old};
    if(Array.isArray(patch.standings)&&patch.standings.length)o.standings=patch.standings;
    if(Array.isArray(patch.matchups)&&patch.matchups.length)o.matchups=mergeKeyed(old.matchups,patch.matchups,x=>`${x.week}|${[x.teamA,x.teamB].sort().join('|')}`);
    if(Array.isArray(patch.matchupProjections)&&patch.matchupProjections.length)o.matchupProjections=mergeKeyed(old.matchupProjections,patch.matchupProjections,x=>`${x.week}|${[x.teamA,x.teamB].sort().join('|')}`);
    if(Array.isArray(patch.rosters)&&patch.rosters.length)o.rosters=mergeKeyed(old.rosters,patch.rosters,x=>x.team);
    if(Array.isArray(patch.completedLineups)&&patch.completedLineups.length)o.completedLineups=mergeKeyed(old.completedLineups,patch.completedLineups,x=>`${x.week}|${x.team}`);
    if(Array.isArray(patch.transactions)&&patch.transactions.length)o.transactions=compactTransactionsV125(mergeKeyed(old.transactions,patch.transactions,transactionIdentity));else if(Array.isArray(old.transactions))o.transactions=compactTransactionsV125(old.transactions);
    if(Array.isArray(patch.faab)&&patch.faab.length)o.faab=mergeKeyed(old.faab,patch.faab,x=>x.team);
    if(Array.isArray(patch.availablePlayers)&&patch.availablePlayers.length)o.availablePlayers=mergeKeyed(old.availablePlayers,patch.availablePlayers,x=>`${x.name}|${x.pos}`);
    return o;
  }

  function parseRoot(root,url,title,kind,opts={}){
    const patch={};let wk=Number(opts.week)||Number(new URL(url,location.href).searchParams.get('week'))||state.targetWeek||1;
    if(kind==='standings'||kind==='league'){patch.standings=parseStandings(root);patch.faab=parseFaab(root)}
    if(kind==='matchups'||kind==='league'){
      const ms=parseMatchups(root,wk,Boolean(opts.forceFinal));patch.matchups=ms;patch.matchupProjections=ms.filter(x=>x.projA!=null&&x.projB!=null);
    }
    if(kind==='roster'){const r=parseRoster(root,title,url,{week:wk,team:opts.team});patch.rosters=r?[r]:[]}
    if(kind==='completed-roster'){const r=parseRoster(root,title,url,{week:wk,team:opts.team});patch.completedLineups=r?[r]:[]}
    if(kind==='transactions'||kind==='league')patch.transactions=parseTransactionsV125(root);
    if(kind==='players')patch.availablePlayers=parseAvailable(root);
    const tm=discoverTeamMap(root);if(tm.length)state.teamMap=mergeTeamMap(state.teamMap,tm);
    return patch;
  }

  async function fetchDoc(url){const r=await fetch(url,{credentials:'include',cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const html=await r.text();return {doc:new DOMParser().parseFromString(html,'text/html'),url,title:url}}
  async function collectUrl(url,kind=null,opts={}){
    const {doc}=await fetchDoc(url);const k=kind||detectKind(url,doc),title=doc.title||url,c=capture(doc,url,title,k);
    state.captures=[...state.captures.filter(x=>x.url!==url),c].slice(-80);
    state.data=mergeData(state.data,parseRoot(doc,url,title,k,opts));saveState();return k;
  }

  function teamFromTeamPage(doc){
    const titleHits=findKnownTeams(doc.title||'');if(titleHits.length===1)return titleHits[0];
    const selectors='h1,h2,h3,[data-tst*="team-name" i],[class*="team-name" i]';
    for(const el of doc.querySelectorAll(selectors)){const hits=findKnownTeams(textOf(el));if(hits.length===1)return hits[0]}
    const bodyHits=findKnownTeams(textOf(doc.body||doc).slice(0,5000));return bodyHits[0]||'';
  }
  async function ensureCompleteTeamMap(){
    const byTeam={};
    if(Number(CTX.season)===2026){for(const [team,yahooTeamId] of Object.entries(KNOWN_TEAM_IDS_2026))byTeam[team]={yahooTeamId,team,manager:managerForTeam(team),url:`${CTX.base}/${yahooTeamId}`};}
    for(const x of state.teamMap||[])if(x&&x.team&&x.yahooTeamId)byTeam[x.team]=x;
    if(Object.keys(byTeam).length>=10)return Object.values(byTeam);
    const usedIds=new Set(Object.values(byTeam).map(x=>Number(x.yahooTeamId)).filter(Boolean));
    for(let id=1;id<=30&&Object.keys(byTeam).length<10;id++){
      if(usedIds.has(id))continue;const url=`${CTX.base}/${id}`;
      try{const {doc}=await fetchDoc(url),team=teamFromTeamPage(doc);if(team&&!byTeam[team]){byTeam[team]={yahooTeamId:id,team,manager:managerForTeam(team),url};usedIds.add(id)}}catch(e){}
      await sleep(70);
    }
    state.teamMap=Object.values(byTeam);saveState();return state.teamMap;
  }

  function playerUrl(pos,start=0){
    const u=new URL(`${CTX.base}/players`);u.searchParams.set('status','A');u.searchParams.set('pos',pos);u.searchParams.set('sort','AR');u.searchParams.set('s',String(start));return u.toString();
  }
  async function collectAvailablePool(){
    const all=[];let pages=0;
    for(const pos of POS){
      const need=AVAILABLE_LIMITS[pos],collected=[];
      for(let start=0;start<100&&collected.length<need;start+=25){
        const u=playerUrl(pos,start),{doc}=await fetchDoc(u),c=capture(doc,u,doc.title||u,'players');state.captures=[...state.captures.filter(x=>x.url!==u),c].slice(-80);
        const parsed=parseAvailable(doc).filter(p=>p.pos===pos);collected.push(...parsed);pages++;await sleep(140)
      }
      all.push(...collected.slice(0,need));
    }
    state.data.availablePlayers=mergeKeyed([],all,x=>`${x.name}|${x.pos}`);saveState();return pages;
  }

  let busy=false,busyLabel='';
  function setBusy(v,label=''){busy=v;busyLabel=label;render()}
  async function autoCollect(){
    setBusy(true,'COLLECTING…');
    const target=Number(state.targetWeek)||1,completed=Math.max(0,target-1);let ok=0,fail=0;
    try{
      const liveKind=detectKind(location.href,document),livePatch=parseRoot(document,location.href,document.title,liveKind,{week:target});state.data=mergeData(state.data,livePatch);
      const liveMap=discoverTeamMap(document);if(liveMap.length)state.teamMap=mergeTeamMap(state.teamMap,liveMap);
      const liveCapture=capture(document,location.href,document.title,liveKind);state.captures=[...state.captures.filter(x=>x.url!==location.href),liveCapture].slice(-80);saveState();ok++;
    }catch(e){console.warn('MAKERSFF live-page capture',e);fail++}
    const urls=[
      [CTX.base,'league',{week:target}],
      ...(state.mode==='post-mnf'&&completed>=1?[[`${CTX.base}?week=${completed}`,'matchups',{week:completed,forceFinal:true}]]:[]),
      [`${CTX.base}?week=${target}`,'matchups',{week:target,forceFinal:false}],
      [`${CTX.base}/standings`,'standings',{}],
      [`${CTX.base}/transactions`,'transactions',{}]
    ];
    for(const [u,k,o] of urls){try{await collectUrl(u,k,o);ok++}catch(e){console.warn('MAKERSFF collector',u,e);fail++}await sleep(220)}
    let map=[];try{map=await ensureCompleteTeamMap();ok+=map.length}catch(e){console.warn('MAKERSFF team map discovery',e);fail++;map=state.teamMap||[]}
    try{ok+=await collectAvailablePool()}catch(e){console.warn('MAKERSFF available players',e);fail++}
    for(const x of map){
      try{await collectUrl(x.url||`${CTX.base}/${x.yahooTeamId}`,'roster',{week:target,team:x.team});ok++}catch(e){console.warn('MAKERSFF current roster',x,e);fail++}await sleep(160);
    }
    if(state.mode==='post-mnf'&&completed>=1){
      for(const x of map){
        const base=x.url||`${CTX.base}/${x.yahooTeamId}`,u=new URL(base);u.searchParams.set('week',String(completed));
        try{await collectUrl(u.toString(),'completed-roster',{week:completed,team:x.team});ok++}catch(e){console.warn('MAKERSFF completed lineup',x,e);fail++}await sleep(180);
      }
    }
    setBusy(false);toast(`Auto collect: ${ok} pages${fail?`, ${fail} failed`:''}`);render();
  }

  function sanitizeData(d={}){
    const copy=JSON.parse(JSON.stringify(d));

  // v1.2.4: collapse Yahoo duplicate transaction wrappers after every merge.
  // Yahoo can expose both a compact row with no parsed players and a richer row
  // for the exact same team/timestamp. Keep the richer structured row(s).
  function compactTransactions(arr=[]){
    const groups={};
    for(const x of arr||[]){
      if(!x)continue;
      const g=`${x.team||''}|${x.timestamp||''}`;
      (groups[g]||(groups[g]=[])).push(x);
    }
    const out=[];
    for(const items of Object.values(groups)){
      const structured=items.filter(x=>(x.players||[]).length||(x.added||[]).length||(x.dropped||[]).length||x.type==='TRADE');
      const source=structured.length?structured:items;
      const by={};
      for(const x of source){
        const players=(x.players||[]).map(p=>`${String(p.name||'').toLowerCase()}:${norm(p.action||'')}`).sort().join(',');
        const sig=players||norm(x.text||'');
        const k=[x.team||'',x.timestamp||'',x.type||'',sig,x.faabSpent??''].join('|');
        const quality=(x.players||[]).length*10+(x.added||[]).length+(x.dropped||[]).length+(x.faabSpent!=null?2:0);
        if(!by[k]||quality>(by[k]._quality||0))by[k]={...x,_quality:quality};
      }
      out.push(...Object.values(by).map(({_quality,...x})=>x));
    }
    return out;
  }

  function mergeData(old={},patch={}){
    const o={...old};
    if(Array.isArray(patch.standings)&&patch.standings.length)o.standings=patch.standings;
    if(Array.isArray(patch.matchups)&&patch.matchups.length)o.matchups=mergeKeyed(old.matchups,patch.matchups,x=>`${x.week}|${[x.teamA,x.teamB].sort().join('|')}`);
    if(Array.isArray(patch.matchupProjections)&&patch.matchupProjections.length)o.matchupProjections=mergeKeyed(old.matchupProjections,patch.matchupProjections,x=>`${x.week}|${[x.teamA,x.teamB].sort().join('|')}`);
    if(Array.isArray(patch.rosters)&&patch.rosters.length)o.rosters=mergeKeyed(old.rosters,patch.rosters,x=>x.team);
    if(Array.isArray(patch.completedLineups)&&patch.completedLineups.length)o.completedLineups=mergeKeyed(old.completedLineups,patch.completedLineups,x=>`${x.week}|${x.team}`);
    if(Array.isArray(patch.transactions)&&patch.transactions.length){
      const merged=mergeKeyed(old.transactions,patch.transactions,transactionIdentity);
      o.transactions=compactTransactions(merged);
    }else if(Array.isArray(old.transactions)){
      o.transactions=compactTransactions(old.transactions);
    }
    if(Array.isArray(patch.faab)&&patch.faab.length)o.faab=mergeKeyed(old.faab,patch.faab,x=>x.team);
    if(Array.isArray(patch.availablePlayers)&&patch.availablePlayers.length)o.availablePlayers=mergeKeyed(old.availablePlayers,patch.availablePlayers,x=>`${x.name}|${x.pos}`);
    return o;
  }
    for(const k of ['rosters','completedLineups'])if(Array.isArray(copy[k]))for(const r of copy[k])if(Array.isArray(r.players))for(const p of r.players)delete p.sourceText;
    for(const k of ['standings','matchups','matchupProjections','availablePlayers'])if(Array.isArray(copy[k]))for(const x of copy[k])delete x.sourceText;
    return copy;
  }
  function uniqueTeamsInMatchups(ms=[]){const s=new Set();for(const m of ms){if(m.teamA)s.add(m.teamA);if(m.teamB)s.add(m.teamB)}return s.size}
  function teamScoreFromMatchups(ms=[],team=''){
    for(const m of ms){if(m.teamA===team)return m.scoreA;if(m.teamB===team)return m.scoreB}return null;
  }
  function teamProjectionFromMatchups(ms=[],team=''){
    for(const m of ms){if(m.teamA===team)return m.projA;if(m.teamB===team)return m.projB}return null;
  }
  function realRosterShape(r={}){
    const ps=r.players||[],real=ps.filter(p=>validPlayerName(p.name)),starters=real.filter(p=>p.started===true),bench=real.filter(p=>p.bench===true);
    return {players:real.length,starters:starters.length,bench:bench.length,scoredStarters:starters.filter(p=>p.points!=null).length,projectedStarters:starters.filter(p=>p.projected!=null).length};
  }
  function validation(d=state.data||{}){
    const target=Number(state.targetWeek)||1,completed=Math.max(0,target-1),st=d.standings||[],rosters=(d.rosters||[]).filter(x=>Number(x.week)===target),tx=d.transactions||[],avail=d.availablePlayers||[],lineups=(d.completedLineups||[]).filter(x=>Number(x.week)===completed),allMatchups=d.matchups||[],finals=allMatchups.filter(x=>Number(x.week)===completed&&x.final),upcoming=allMatchups.filter(x=>Number(x.week)===target),upcomingScheduled=upcoming.filter(x=>!x.final),upcomingProjected=upcoming.filter(x=>x.projA!=null&&x.projB!=null);
    const availCounts=Object.fromEntries(POS.map(p=>[p,avail.filter(x=>x.pos===p).length])),availOk=POS.every(p=>availCounts[p]>=(AVAILABLE_LIMITS[p]||0));
    const availProjectionCount=avail.filter(p=>p.projected!=null).length,availRosteredCount=avail.filter(p=>p.rosteredPct!=null).length;
    const finalTeams=uniqueTeamsInMatchups(finals),upcomingTeams=uniqueTeamsInMatchups(upcomingScheduled),finalsOk=completed===0||(finals.length===5&&finalTeams===10),upcomingOk=upcomingScheduled.length===5&&upcomingTeams===10&&upcomingProjected.length===5;

    let lineupPlayers=0,scoredPlayers=0,slottedPlayers=0,starterScores=0,lineupShapeOk=completed===0,scoreReconciled=0;
    if(completed>=1){
      lineupShapeOk=lineups.length===10;
      for(const l of lineups){
        const sh=realRosterShape(l);lineupPlayers+=sh.players;scoredPlayers+=(l.players||[]).filter(p=>p.points!=null&&validPlayerName(p.name)).length;slottedPlayers+=(l.players||[]).filter(p=>p.slot&&p.started!=null&&validPlayerName(p.name)).length;starterScores+=sh.scoredStarters;
        if(sh.players<14||sh.players>18||sh.starters!==9||sh.scoredStarters!==9)lineupShapeOk=false;
        const official=teamScoreFromMatchups(finals,l.team);if(official!=null&&Math.abs(Number(l.starterPoints)-Number(official))<=0.03)scoreReconciled++;
      }
      if(scoreReconciled!==10)lineupShapeOk=false;
    }

    let currentShapeOk=rosters.length===10,currentProjectedTeams=0,currentProjectionReconciled=0;
    for(const r of rosters){
      const sh=realRosterShape(r);if(sh.players<14||sh.players>18||sh.starters!==9)currentShapeOk=false;if(sh.projectedStarters>=8)currentProjectedTeams++;
      const official=teamProjectionFromMatchups(upcoming,r.team);if(official!=null&&r.starterProjectedPoints!=null&&Math.abs(Number(r.starterProjectedPoints)-Number(official))<=1.0)currentProjectionReconciled++;
    }
    const currentProjectionOk=currentProjectedTeams===10&&upcomingOk;
    const structuredTx=tx.filter(x=>x.type&&x.timestamp&&((x.added||[]).length||(x.dropped||[]).length||x.type==='TRADE')).length;
    const freeAgentDetail=POS.map(p=>`${p} ${availCounts[p]}/${AVAILABLE_LIMITS[p]}`).join(' · ');

    const checks=state.mode==='post-mnf'?
      [
        ['Standings',st.length===10,`${st.length}/10 teams`],
        ['Completed matchups',finalsOk,completed===0?'Preseason':`${finals.length}/5 games · ${finalTeams}/10 teams`],
        ['Completed lineups',lineupShapeOk,completed===0?'Preseason':`${lineups.length}/10 teams · ${lineupPlayers} real players · ${starterScores}/90 starter scores`],
        ['Score reconciliation',completed===0||scoreReconciled===10,completed===0?'Preseason':`${scoreReconciled}/10 team totals match Yahoo`],
        ['Current rosters',currentShapeOk,`${rosters.length}/10 teams · ${currentProjectedTeams}/10 with starter projections`],
        ['Upcoming matchups',upcomingOk,`${upcomingScheduled.length}/5 scheduled · ${upcomingProjected.length}/5 projected`],
        ['Available players',availOk&&availProjectionCount>=Math.min(90,avail.length),`${freeAgentDetail} · ${availProjectionCount}/${avail.length} projections`],
        ['Transactions',tx.length===0||structuredTx===tx.length,`${structuredTx}/${tx.length} structured`]
      ]:
      [
        ['Transactions',tx.length>0&&structuredTx===tx.length,`${structuredTx}/${tx.length} structured`],
        ['Current rosters',currentShapeOk,`${rosters.length}/10 teams · ${currentProjectedTeams}/10 with starter projections`],
        ['Upcoming matchups',upcomingOk,`${upcomingScheduled.length}/5 scheduled · ${upcomingProjected.length}/5 projected`],
        ['Available players',availOk&&availProjectionCount>=Math.min(90,avail.length),`${freeAgentDetail} · ${availProjectionCount}/${avail.length} projections`]
      ];
    return {ok:checks.every(x=>x[1]),checks:Object.fromEntries(checks.map(([name,ok,detail])=>[name,{ok,detail}])),counts:{standings:st.length,finals:finals.length,finalTeams,completedLineups:lineups.length,lineupPlayers,scoredPlayers,slottedPlayers,starterScores,scoreReconciled,rosters:rosters.length,currentProjectedTeams,currentProjectionReconciled,upcoming:upcomingScheduled.length,upcomingProjected:upcomingProjected.length,transactions:tx.length,structuredTransactions:structuredTx,available:avail.length,availableProjected:availProjectionCount,availableRostered:availRosteredCount,captures:state.captures.length}};
  }

  function makeDelta(){
    if(state.mode!=='post-waivers')return null;
    const prev=GM_getValue(key(`snapshot:${state.targetWeek}:post-mnf`),null);if(!prev)return {available:false};
    const before=Object.fromEntries((prev.data?.rosters||[]).map(r=>[r.team,new Set((r.players||[]).map(p=>p.name))]));
    const moves=[];for(const r of state.data.rosters||[]){const b=before[r.team]||new Set(),a=new Set((r.players||[]).map(p=>p.name));const adds=[...a].filter(x=>!b.has(x)),drops=[...b].filter(x=>!a.has(x));if(adds.length||drops.length)moves.push({team:r.team,manager:r.manager,adds,drops})}return {available:true,moves};
  }
  function buildExport(){const d=sanitizeData(state.data||{}),v=validation(state.data||{}),target=Number(state.targetWeek)||1,completed=Math.max(0,target-1);return {schema:SCHEMA,collectorVersion:VERSION,league:{season:CTX.season,leagueId:CTX.leagueId,name:'The Makers'},mode:state.mode,targetWeek:target,completedWeek:completed,capturedAt:now(),validation:v,teamMap:state.teamMap||[],data:d,delta:makeDelta(),captures:state.captures||[]}}
  function browserDownload(name,text){const blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function downloadJson(){const o=buildExport();GM_setValue(key(`snapshot:${o.targetWeek}:${o.mode}`),o);const mode=o.mode==='post-mnf'?'POST_MNF':'POST_WAIVERS',name=`MAKERS_${o.league.season}_W${String(o.targetWeek).padStart(2,'0')}_${mode}.json`,text=JSON.stringify(o,null,2);try{GM_download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(text),name,saveAs:true})}catch{browserDownload(name,text)}}
  function copyJson(){GM_setClipboard(JSON.stringify(buildExport(),null,2),'text');toast('JSON copied')}
  function resetCycle(){if(!confirm('Clear the current collector workspace? Saved Tuesday/Thursday snapshots stay available for comparison.'))return;state={mode:state.mode,targetWeek:state.targetWeek,captures:[],data:{},teamMap:state.teamMap||[],updatedAt:null};saveState()}
  function setMode(mode){if(state.mode===mode)return;state.mode=mode;state.captures=[];state.data={};state.updatedAt=null;saveState()}
  function setWeek(v){state.targetWeek=Math.max(1,Math.min(17,Number(v)||1));saveState()}
  function captureCurrent(){const kind=detectKind(location.href,document),c=capture(document,location.href,document.title,kind);state.captures=[...state.captures.filter(x=>x.url!==location.href),c].slice(-80);state.data=mergeData(state.data,parseRoot(document,location.href,document.title,kind,{week:state.targetWeek}));saveState();toast('Current page captured')}

  function toast(msg){let t=document.getElementById('makersff-toast');if(!t){t=document.createElement('div');t.id='makersff-toast';document.body.appendChild(t)}t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)}
  GM_addStyle(`
    #makersff-panel{position:fixed;right:20px;bottom:20px;width:338px;z-index:2147483646;background:#17090b;color:#fff;border:2px solid #b4122f;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.32);font:13px/1.35 Arial,sans-serif;overflow:hidden}
    #makersff-panel *{box-sizing:border-box}#makersff-panel header{padding:14px 16px 10px;text-align:center}#makersff-panel header h3{margin:0;font-size:14px;letter-spacing:.03em}#makersff-panel header small{opacity:.65}.makersff-body{padding:0 12px 12px}.makersff-modes{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:7px 0}.makersff-modes button,.makersff-actions button{border:1px solid rgba(255,255,255,.18);background:#2a1719;color:#fff;border-radius:9px;padding:9px 8px;font-weight:800;cursor:pointer}.makersff-modes button.on{background:#b4122f}.makersff-actions{display:grid;gap:7px;margin-top:10px}.makersff-actions .primary{background:#d9ad32;color:#17110a;border-color:#d9ad32}.makersff-week{display:flex;gap:8px;align-items:center;margin:9px 0}.makersff-week input{width:56px;padding:7px;border-radius:7px;border:0}.makersff-detail{font-size:11px;opacity:.7}.makersff-note{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:10px;margin:9px 0}.makersff-check{display:grid;grid-template-columns:18px 1fr auto;gap:5px;align-items:center;padding:4px 2px}.makersff-ok{color:#6dde81}.makersff-no{color:#e9a6af}.makersff-mini{display:flex;justify-content:space-between;opacity:.62;font-size:11px;margin-top:9px}#makersff-toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,15px);opacity:0;z-index:2147483647;background:#111;color:#fff;padding:10px 14px;border-radius:8px;transition:.2s}#makersff-toast.show{opacity:1;transform:translate(-50%,0)}
  `);

  function render(){
    let panel=document.getElementById('makersff-panel');if(!panel){panel=document.createElement('aside');panel.id='makersff-panel';document.body.appendChild(panel)}
    if(!isBoundHere()){
      const bound=boundScope();panel.innerHTML=`<header><h3>MAKERS WEEKLY COLLECTOR</h3><small>v${VERSION} · ${CTX.season} · detected league ${esc(CTX.leagueId)}</small></header><div class="makersff-body"><div class="makersff-note">This collector is restricted to The Makers Yahoo league and must be bound once on that league.${bound?`<br><br>Currently bound to <b>${esc(bound)}</b>.`:''}</div><div class="makersff-actions"><button id="makersff-bind" class="primary">USE COLLECTOR ON THIS LEAGUE</button></div></div>`;panel.querySelector('#makersff-bind').onclick=bindHere;return;
    }
    const v=validation(),checks=Object.entries(v.checks).map(([n,x])=>`<div class="makersff-check"><span class="${x.ok?'makersff-ok':'makersff-no'}">${x.ok?'✓':'○'}</span><b>${esc(n)}</b><span class="makersff-detail">${esc(x.detail)}</span></div>`).join('');
    const note=state.mode==='post-mnf'?'Run after MNF is final. Auto Collect now captures final team scores plus every completed-week lineup, starter/bench designation, and player actual/projection values when Yahoo exposes them.':'Run Thursday after waivers clear. It compares against Tuesday and captures post-waiver rosters, transactions, free agents and Week preview data.';
    panel.innerHTML=`<header><h3>MAKERS WEEKLY COLLECTOR</h3><small>v${VERSION} · ${CTX.season} · league ${esc(CTX.leagueId)}</small></header><div class="makersff-body"><div class="makersff-modes"><button data-mode="post-mnf" class="${state.mode==='post-mnf'?'on':''}" ${busy?'disabled':''}>POST-MNF</button><button data-mode="post-waivers" class="${state.mode==='post-waivers'?'on':''}" ${busy?'disabled':''}>POST-WAIVERS</button></div><div class="makersff-week"><label>Upcoming week</label><input id="makersff-week" type="number" min="1" max="17" value="${state.targetWeek||1}" ${busy?'disabled':''}><span class="makersff-detail">${state.mode==='post-mnf'?`recaps W${Math.max(0,(state.targetWeek||1)-1)}`:'preview target'}</span></div><div class="makersff-note">${esc(note)}</div>${checks}<div class="makersff-actions"><button id="makersff-auto" class="primary" ${busy?'disabled':''}>${busy?esc(busyLabel||'WORKING…'):'AUTO COLLECT LEAGUE'}</button><button id="makersff-current" ${busy?'disabled':''}>CAPTURE THIS PAGE</button><button id="makersff-export" ${busy?'disabled':''}>EXPORT JSON${v.ok?' ✓':''}</button><button id="makersff-copy" ${busy?'disabled':''}>COPY JSON TO CLIPBOARD</button><button id="makersff-reset" ${busy?'disabled':''}>CLEAR WORKSPACE</button><button id="makersff-unbind" ${busy?'disabled':''}>UNBIND LEAGUE</button></div><div class="makersff-mini"><span>${v.counts.captures} page captures</span><span>${state.updatedAt?new Date(state.updatedAt).toLocaleTimeString():'not started'}</span></div></div>`;
    panel.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));panel.querySelector('#makersff-week').onchange=e=>setWeek(e.target.value);panel.querySelector('#makersff-auto').onclick=autoCollect;panel.querySelector('#makersff-current').onclick=captureCurrent;panel.querySelector('#makersff-export').onclick=downloadJson;panel.querySelector('#makersff-copy').onclick=copyJson;panel.querySelector('#makersff-reset').onclick=resetCycle;panel.querySelector('#makersff-unbind').onclick=unbind;
  }

  render();
})();
