#!/usr/bin/env python3
import re
import urllib.request
from pathlib import Path

SOURCE_URL = "https://raw.githubusercontent.com/MiscExpFFL/miscellaneous-expenditures/1d3bc12ff0f99da9b9bdde2f4cc24972fc3a5be0/MEFFL_Weekly_Collector_v1.2.4.txt"
VERSION = "1.2.5"
EXPECTED_LEAGUE_ID = "471058"

KNOWN_TEAMS = {
    "The Eviscerators": "Andrew",
    "The Moose Knuckles": "Jim",
    "TDs In Your Face": "Nick",
    "The Mustache riders": "TomD",
    "Criterus": "Chris",
    "Kareem all over your Hunt": "Billy",
    "Pump and Go": "Tommy",
    "The A Gap": "Adam",
    "Predacious Fungi": "Max",
    "Revenge of the period bloods": "Nate",
}

TEAM_ALIASES = {
    "Eviscerators": "The Eviscerators",
    "TDs IN YO FACE": "TDs In Your Face",
    "TDs IN YOUR FACE": "TDs In Your Face",
    "Dem TDs": "TDs In Your Face",
    "The Mustache Riders": "The Mustache riders",
    "Revenge of the Period Bloods": "Revenge of the period bloods",
    "Playing Waddle pays the Price": "Kareem all over your Hunt",
}

KNOWN_TEAM_IDS_2026 = {
    "The Moose Knuckles": 1,
    "TDs In Your Face": 2,
    "Predacious Fungi": 3,
    "Criterus": 4,
    "The Mustache riders": 5,
    "Revenge of the period bloods": 6,
    "The Eviscerators": 7,
    "The A Gap": 8,
    "Pump and Go": 9,
    "Kareem all over your Hunt": 10,
}


def js_object(obj):
    lines = ["{"]
    items = list(obj.items())
    for i, (k, v) in enumerate(items):
        comma = "," if i < len(items) - 1 else ""
        if isinstance(v, str):
            lines.append(f"    {k!r}:{v!r}{comma}")
        else:
            lines.append(f"    {k!r}:{v}{comma}")
    lines.append("  }")
    return "\n".join(lines)


with urllib.request.urlopen(SOURCE_URL, timeout=30) as response:
    src = response.read().decode("utf-8")

# Keep the proven Mis.Exp v1.2.4 parsing/validation engine, but isolate every
# user-script/storage/UI identifier so both collectors can be installed safely.
src = src.replace("MEFFL", "MAKERSFF").replace("meffl", "makersff")
src = src.replace("MAKERSFF Weekly Collector — Tuesday + Thursday", "Makers Weekly Collector — Tuesday + Thursday")
src = src.replace("MAKERSFF WEEKLY COLLECTOR", "MAKERS WEEKLY COLLECTOR")
src = src.replace("https://www.miscellaneousexpenditures.com/", "https://github.com/MiscExpFFL/the-makers/")
src = src.replace("Miscellaneous Expenditures", "The Makers")
src = src.replace("MiscExpFFL/miscellaneous-expenditures", "MiscExpFFL/the-makers")
src = src.replace("MAKERSFF_Weekly_Collector.user.js", "Makers_Weekly_Collector.user.js")
src = src.replace("makersff-weekly-collector/v2", "makers-weekly-collector/v2")
src = src.replace("`MAKERSFF_${o.league.season}_W", "`MAKERS_${o.league.season}_W")
src = src.replace("// @version      1.2.4", f"// @version      {VERSION}", 1)
src = src.replace("const VERSION='1.2.4'", f"const VERSION='{VERSION}'", 1)

team_block = (
    f"  const EXPECTED_LEAGUE_ID='{EXPECTED_LEAGUE_ID}';\n"
    f"  const KNOWN_TEAMS={js_object(KNOWN_TEAMS)};\n"
    f"  const TEAM_ALIASES={js_object(TEAM_ALIASES)};\n"
    f"  const KNOWN_TEAM_IDS_2026={js_object(KNOWN_TEAM_IDS_2026)};\n"
)

src, n = re.subn(
    r"  const KNOWN_TEAMS=\{.*?\n  \};\n  const TEAM_ALIASES=.*?;\n",
    team_block,
    src,
    count=1,
    flags=re.S,
)
if n != 1:
    raise RuntimeError("Could not replace the source league team map")

# Hard-stop on every Yahoo league except the 2026 Makers league. This is in
# addition to the collector's existing per-league binding and known-team guards.
needle = "  const CTX=context();\n  if(!CTX.base||!CTX.leagueId)return;"
replacement = needle + "\n  if(String(CTX.leagueId)!==EXPECTED_LEAGUE_ID)return;"
if needle not in src:
    raise RuntimeError("Could not add Makers league-id guard")
src = src.replace(needle, replacement, 1)

# Seed the current-season team map with the accepted Yahoo team IDs. Freshly
# discovered links still replace these entries if Yahoo changes its markup.
needle = "  async function ensureCompleteTeamMap(){\n    const byTeam={};for(const x of state.teamMap||[])if(x&&x.team&&x.yahooTeamId)byTeam[x.team]=x;"
replacement = "  async function ensureCompleteTeamMap(){\n    const byTeam={};\n    if(Number(CTX.season)===2026){for(const [team,yahooTeamId] of Object.entries(KNOWN_TEAM_IDS_2026))byTeam[team]={yahooTeamId,team,manager:managerForTeam(team),url:`${CTX.base}/${yahooTeamId}`};}\n    for(const x of state.teamMap||[])if(x&&x.team&&x.yahooTeamId)byTeam[x.team]=x;"
if needle not in src:
    raise RuntimeError("Could not seed the Makers Yahoo team-id fallback")
src = src.replace(needle, replacement, 1)

# v1.2.5: The source v1.2.4 carried the strong transaction parser inside a
# local parseAvailable scope, so normal league collection could still use the
# older parser and retain Yahoo wrapper rows. Add a global hardened parser and
# route transaction collection through it explicitly.
transaction_upgrade = r'''
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
'''

needle = "  function mergeKeyed(oldArr,newArr,keyFn){const by={};for(const x of [...(oldArr||[]),...(newArr||[])]){const k=keyFn(x);if(k)by[k]=x}return Object.values(by)}\n"
if needle not in src:
    raise RuntimeError("Could not locate merge helper for transaction upgrade")
src = src.replace(needle, transaction_upgrade + "\n" + needle, 1)

old_merge = "    if(Array.isArray(patch.transactions)&&patch.transactions.length)o.transactions=mergeKeyed(old.transactions,patch.transactions,transactionIdentity);"
new_merge = "    if(Array.isArray(patch.transactions)&&patch.transactions.length)o.transactions=compactTransactionsV125(mergeKeyed(old.transactions,patch.transactions,transactionIdentity));else if(Array.isArray(old.transactions))o.transactions=compactTransactionsV125(old.transactions);"
if old_merge not in src:
    raise RuntimeError("Could not replace transaction merge behavior")
src = src.replace(old_merge, new_merge, 1)

old_parse = "    if(kind==='transactions'||kind==='league')patch.transactions=parseTransactions(root);"
new_parse = "    if(kind==='transactions'||kind==='league')patch.transactions=parseTransactionsV125(root);"
if old_parse not in src:
    raise RuntimeError("Could not route transaction parsing through v1.2.5 parser")
src = src.replace(old_parse, new_parse, 1)

# Make the binding copy Makers-specific.
src = src.replace("This collector must be bound once to the The Makers Yahoo league.", "This collector is restricted to The Makers Yahoo league and must be bound once on that league.")

# Sanity assertions: the generated script must not share Mis.Exp storage/UI IDs.
required = [
    "const SCHEMA='makers-weekly-collector/v2'",
    "const VERSION='1.2.5'",
    "const EXPECTED_LEAGUE_ID='471058'",
    "Playing Waddle pays the Price",
    "MAKERSFF:weeklyCollector:boundLeague",
    "Makers_Weekly_Collector.user.js",
    "completedLineups",
    "Score reconciliation",
    "parseTransactionsV125",
    "compactTransactionsV125",
]
for token in required:
    if token not in src:
        raise RuntimeError(f"Generated collector missing required token: {token}")
for forbidden in ["MEFFL:weeklyCollector", "id='meffl-", 'id="meffl-', "Miscellaneous Expenditures"]:
    if forbidden in src:
        raise RuntimeError(f"Generated collector still contains cross-league identifier: {forbidden}")

Path("Makers_Weekly_Collector.user.js").write_text(src, encoding="utf-8")
Path(f"Makers_Weekly_Collector_v{VERSION}.txt").write_text(src, encoding="utf-8")
print(f"Built Makers collector v{VERSION}: {len(src):,} bytes")
