#!/usr/bin/env python3
import re
import urllib.request
from pathlib import Path

SOURCE_URL = "https://raw.githubusercontent.com/MiscExpFFL/miscellaneous-expenditures/1d3bc12ff0f99da9b9bdde2f4cc24972fc3a5be0/MEFFL_Weekly_Collector_v1.2.4.txt"
VERSION = "1.2.4"
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
src = src.replace("MAKERSFF_Weekly_Collector_v1.2.4.txt", "Makers_Weekly_Collector_v1.2.4.txt")
src = src.replace("makersff-weekly-collector/v2", "makers-weekly-collector/v2")
src = src.replace("`MAKERSFF_${o.league.season}_W", "`MAKERS_${o.league.season}_W")

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

# Make the binding copy Makers-specific and ensure the export metadata is exact.
src = src.replace("This collector must be bound once to the The Makers Yahoo league.", "This collector is restricted to The Makers Yahoo league and must be bound once on that league.")
src = src.replace("name:'The Makers'", "name:'The Makers'")

# Sanity assertions: the generated script must not share Mis.Exp storage/UI IDs.
required = [
    "const SCHEMA='makers-weekly-collector/v2'",
    "const VERSION='1.2.4'",
    "const EXPECTED_LEAGUE_ID='471058'",
    "MAKERSFF:weeklyCollector:boundLeague",
    "Makers_Weekly_Collector.user.js",
    "completedLineups",
    "Score reconciliation",
    "compactTransactions",
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
