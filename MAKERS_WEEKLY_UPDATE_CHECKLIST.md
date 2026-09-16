# The Makers — Weekly Update Checklist

Use this checklist for every in-season update. The site is intentionally split into a **Tuesday close** and a **Thursday preview**.

## Tuesday close — after MNF

### Collector / validation
- [ ] Run the current Makers collector after MNF is final.
- [ ] 10/10 standings captured.
- [ ] 5/5 completed matchups captured.
- [ ] 10/10 completed lineups captured.
- [ ] 10/10 scoreboard reconciliation passes.
- [ ] 10/10 current rosters captured.
- [ ] 5/5 next-week Yahoo matchup projections captured.
- [ ] 100/100 available-player pool captured.
- [ ] Transactions deduped to the real structured moves.
- [ ] Preserve raw collector JSON until the update is validated.

### Completed-week receipts
- [ ] Final results and standings.
- [ ] PF / PA / streak / FAAB / waiver priority.
- [ ] Game of the Week.
- [ ] Biggest blowout, closest finish, high score, low score and bad beat.
- [ ] All-play standings.
- [ ] Lineup efficiency / optimal-lineup receipts.
- [ ] Makers-vs-Yahoo prediction grading.
- [ ] Weekly headline and full Results Recap.

### Tuesday live dashboards
- [ ] Homepage latest recap.
- [ ] Weekly Write-Ups archive.
- [ ] 2026 War Room.
- [ ] Standings and race tiers.
- [ ] Projected playoff field.
- [ ] Power Rankings / Power Index.
- [ ] Playoff odds.
- [ ] First-round bye odds.
- [ ] Title equity.
- [ ] Toilet / punishment risk.
- [ ] Franchise Stock Market.
- [ ] What Everybody Needs.
- [ ] Waiver recommendations.
- [ ] FAAB and waiver priority.
- [ ] Moves / activity tape.
- [ ] Transaction ROI / activity efficiency.
- [ ] Acquisition receipts.
- [ ] Prediction Ledger.
- [ ] Analytics page.
- [ ] Season Timeline / Weekly Pulse.
- [ ] Every Road to Week 14 with completed-week W/L receipt.
- [ ] Franchise dashboards.
- [ ] Career standings.
- [ ] League Ledger.
- [ ] Record Book audit.
- [ ] H2H matrix and game log.
- [ ] Season History active chapter.

### Tuesday next-week rule
- [ ] Publish current Yahoo projections for the next week.
- [ ] Label them as provisional / Tuesday Yahoo projections.
- [ ] Do **not** publish or lock Makers next-week winner picks yet.
- [ ] Do **not** publish final Makers projected scores yet.

### Tuesday QA / deploy
- [ ] Every JS file passes `node --check`.
- [ ] Every live route renders without a runtime exception.
- [ ] Internal links resolve.
- [ ] Referenced assets resolve.
- [ ] Ten unique active teams/managers exist in standings, power and odds.
- [ ] Completed-week game set covers all ten teams once.
- [ ] Next-week game set covers all ten teams once.
- [ ] Commit to `main`.
- [ ] GitHub Pages `pages build and deployment` completes successfully.

## Thursday preview — after waivers

### Refresh
- [ ] Update rosters after waivers.
- [ ] Update transactions / FAAB / priority.
- [ ] Update player statuses and meaningful injuries.
- [ ] Refresh Yahoo matchup projections.
- [ ] Revisit waiver / team-need notes where the roster changed.

### Publish and lock
- [ ] Full five-game Week preview.
- [ ] Makers winner pick for every matchup.
- [ ] Makers projected score for every matchup.
- [ ] Yahoo winner/projection snapshot for comparison.
- [ ] Game of the Week.
- [ ] Matchup-specific H2H/history notes where useful.
- [ ] Freeze the Thursday prediction receipt before games begin.

### Thursday QA / deploy
- [ ] Tuesday Results Recap remains archived and unchanged.
- [ ] Current week becomes the featured preview.
- [ ] Prediction page shows the locked Thursday receipt.
- [ ] JS / links / assets QA passes.
- [ ] Commit to `main`.
- [ ] GitHub Pages deployment succeeds.

## Permanent league rules / data constraints
- The Makers was founded in **2003**.
- The fully reconstructed modern statistical archive begins in **2022**.
- Billy begins his own franchise history in **2025** and does not inherit El Rubio's history.
- Completed historical receipts are cumulative and should never be silently rewritten during a normal weekly update.
- Tuesday is the results-and-repricing day; Thursday is the preview-and-picks-lock day.
