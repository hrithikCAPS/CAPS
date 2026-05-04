# CAPS RFP Dashboard — Complete Handover Guide

> **For AI agents and human maintainers alike.**  
> This document explains everything about the dashboard: what it shows, how it is built, how data flows through it, and exactly what to do every day to keep it current. Read this top to bottom before touching anything.

---

## 1. What Is This Dashboard?

The CAPS RFP Dashboard is a browser-based analytics tool that tracks CAPS's public-sector RFP (Request for Proposal) pipeline. It pulls live deal data from HubSpot, stores it in an Excel file, converts it to JavaScript, and serves it across several HTML pages — all without a backend server.

**It answers questions like:**
- How many bids have we submitted since October 2025?
- What is our win rate, and how has it trended month-over-month?
- Which states and service categories perform best?
- Which deals are awaiting a result right now?
- Where are our awarded contracts geographically?

---

## 2. File Structure

```
CAPS UPDATE DASHBOARD/
├── CAPS_RFP_Dashboard_Dataset.xlsx     ← Master Excel data file (source of truth)
├── DASHBOARD_README.md                 ← This file
│
└── dashboard/
    ├── PULL_FROM_HUBSPOT.md            ← HubSpot query reference (keep updated)
    ├── refresh-data.py                 ← Script: Excel → data.js
    │
    ├── index.html                      ← Landing page (hero stats)
    ├── rfp-overview.html               ← RFP Overview dashboard
    ├── interviews.html                 ← Interview & BAFO tracker
    ├── awards.html                     ← All-time awards dashboard
    ├── state-analysis.html             ← Geographic breakdown by US state
    ├── target-states.html              ← Deep-dive: 8 target states with regional maps
    ├── california-regions.html         ← California-only regional breakdown
    ├── pipeline.html                   ← Pipeline / predictions page
    ├── predictions.html                ← Delivery forecast page
    │
    ├── js/
    │   ├── data.js                     ← AUTO-GENERATED. Do not edit manually.
    │   └── dashboard-common.js         ← Shared helpers: data loading, formatting
    │
    ├── styles/
    │   └── dashboard.css               ← All shared CSS
    │
    └── data/
        └── CAPS_RFP_Dashboard_Dataset.xlsx  ← Copy of master Excel (for serving)
```

**Separately (in the AI session working directory, NOT committed):**
```
/sessions/.../
├── update_excel_v2.py          ← Script: HubSpot JSON → Excel update
├── rfp_deals_all.json          ← Freshly pulled RFP deals (temp)
├── awards_deals_all.json       ← Freshly pulled Awards deals (temp)
├── companies_state_lookup.json ← Company name → agency_state map (temp)
└── deal_id_batches.json        ← Batch IDs for company lookups (temp)
```

---

## 3. Data Flow (End to End)

```
HubSpot CRM
    │
    │  search_crm_objects() API calls (MCP tool)
    ▼
rfp_deals_all.json + awards_deals_all.json + companies_state_lookup.json
    │
    │  python3 update_excel_v2.py
    ▼
CAPS_RFP_Dashboard_Dataset.xlsx  (sheets: README, Summary, Stage Legend, RFP Data, Awards)
    │
    │  python3 dashboard/refresh-data.py
    ▼
dashboard/js/data.js  (window.CAPS_EMBEDDED_DATA + window.CAPS_AWARDS_DATA)
    │
    │  Browser loads HTML pages
    ▼
Dashboard pages read data.js via dashboard-common.js → CAPS.loadData()
```

---

## 4. The Excel File — Sheet by Sheet

### Sheet: RFP Data
The main dataset. Contains all RFP deals with `closedate >= 2025-10-01` in the relevant stages. **Rebuilt from scratch on every update.**

**27 columns (exact order):**
S.No. | HubSpot ID | RFP Number | Deal Name | Agency | Agency State | Stage | Interview Flag | Interview Subcategory | Bid Closing Date | Submission Date | Amount ($) | Service Category | Submission Mode | Owner | Interview Type | Interview Date | BAFO Date | Intent to Award Date | Tentatively Awarded Date | Awarded Date | Award Status | Won Reason | Lost Reason | Created Date | HubSpot Link | Delivery Required

### Sheet: Awards
All-time Closed Won + Intent to Award deals — **no date filter**. Independent of RFP Data. Same 27 columns. Rebuilt on every update.

### Sheet: README
Auto-updated by scripts. Contains `Last Updated:` timestamp and `Total Records:` count (based on submission date, not raw row count).

### Sheet: Summary
Contains COUNTIF/SUMIF formulas referencing RFP Data rows. Formula ranges are auto-updated by `update_excel_v2.py` when row count changes.

### Sheet: Stage Legend
Static reference table for stage definitions. Never touched by scripts.

---

## 5. HubSpot Deal Stages (Verified March 30, 2026)

| HubSpot Internal ID | Human Label |
|---|---|
| `presentationscheduled` | Submitted |
| `1620129473` | Interview |
| `2485737153` | Intent to Award |
| `closedwon` | Closed Won |
| `closedlost` | Closed Lost |
| `2203296493` | Terminated |
| `2766010076` | RFx Cancelled |

> If stages ever change, re-verify by calling `get_properties(objectType="deals", propertyNames=["dealstage"])` via the HubSpot MCP tool.

---

## 6. The Daily Update Process (Step by Step)

This is what you (or an AI) must do every day to keep the dashboard current. The full process takes about 10–15 minutes of AI time.

### Step 1 — Pull RFP Deals from HubSpot

Call `search_crm_objects` with:
- `objectType: "deals"`
- Filter: `closedate >= 2025-10-01`
- Filter: `dealstage IN [presentationscheduled, 1620129473, 2485737153, closedwon, closedlost, 2203296493, 2766010076]`
- Sort: `closedate ASCENDING`
- Limit: 200 per page
- Properties: `dealname, dealstage, amount, closedate, createdate, hs_object_id, rfp_number, agency, service_category__cloned_, submission_mode, hubspot_owner_id, interview_type, interview_date_time, bafo_date, intent_to_awarded_date, tentatively_awarded_date, awarded_date, current_status_of_award, closed_won_reason, reason_of_close_lost, submission_date, delivery_needed`

**Paginate:** Check `total` in first response. If total > 200, re-call with `offset=200`, then `offset=400`, etc. until all pages collected. Deduplicate by `hs_object_id`. Save as `rfp_deals_all.json`.

### Step 2 — Pull Awards Deals from HubSpot

Call `search_crm_objects` with:
- `objectType: "deals"`
- Filter: `dealstage IN [closedwon, 2485737153]` — **NO date filter**
- Same properties as above
- Sort: `closedate ASCENDING`, Limit: 200/page

All-time awards typically fit in one page (~82 records as of April 2026). Save as `awards_deals_all.json`.

### Step 3 — Pull Agency States via Company Associations

This step maps each deal's agency to a US state. **Do NOT search all companies globally** — there are 1800+ companies in HubSpot. Instead, query only companies linked to your specific deals.

#### Step 3a (Bulk pre-pass) — Companies by deal-batch

Collect all unique deal IDs from both `rfp_deals_all.json` and `awards_deals_all.json`. Split into batches of 100 IDs. For each batch:

```
search_crm_objects(
  objectType="companies",
  filterGroups=[{associatedWith: [{objectType: "deals", operator: "IN", objectIdValues: [batch]}]}],
  properties=["name", "agency_state"],
  limit=200
)
```

Run all batches in **parallel** (7–8 batches typically). Combine results, deduplicate by company name (normalized), save as `companies_state_lookup.json`. This is a **fuzzy** lookup — it relies on the deal's `agency` text matching the company's `name`.

#### Step 3b (Per-deal precise pass) — REQUIRED for correctness

The bulk pre-pass above produces a name-keyed lookup; the deal→company association is lost. The deal's `agency` text often does **not** match the company's `name` (whitespace, parenthetical suffixes, abbreviations, complete mismatch). With name-only matching, we lose ~40% of state coverage.

**Fix: query each deal's direct company association individually.** This builds a `deal_id → {company, state}` map that is the canonical source of truth:

```
# For each deal_id (run in parallel batches via subagents):
search_crm_objects(
  objectType="companies",
  filterGroups=[{associatedWith: [{objectType: "deals", operator: "EQUAL", objectIdValues: [deal_id]}]}],
  properties=["name", "agency_state"],
  limit=5
)
# Take results[0].properties.{name, agency_state}
```

Save as `deal_state_lookup.json`: `{"<deal_id>": {"company": "...", "state": "..."}, ...}`.

Strategy:
- For a fresh full pull: query **all 700+ deals** this way (split into ~6 chunks of ~120 deals across parallel subagents).
- For an incremental refresh after the bulk pass: read `deals_missing_state.json` (written by `update_excel_v2.py` on the last run) and query only those deals.

The `update_excel_v2.py` script reads `deal_state_lookup.json` as its **primary** state source and falls back to `companies_state_lookup.json` only when a deal has no entry in the per-deal map.

### Step 4 — Run `update_excel_v2.py`

```bash
cd /sessions/[session-id]
python3 update_excel_v2.py
```

This script:
- Reads `rfp_deals_all.json`, `awards_deals_all.json`, `companies_state_lookup.json`
- Builds owner_map from hardcoded 58-owner list
- Builds company→state lookup with STATE_OVERRIDES for HubSpot blanks
- Writes all 27 columns to "RFP Data" and "Awards" sheets in the Excel file
- Updates README sheet timestamp and record count
- Updates Summary sheet formula row ranges
- Prints verification counts: total rows, submissions Oct 2025+, Deals Awarded

### Step 5 — Run `refresh-data.py`

```bash
cd /sessions/[session-id]/mnt/CAPS\ UPDATE\ DASHBOARD/dashboard
python3 refresh-data.py
```

This script:
- Reads the Excel file
- Parses "RFP Data" and "Awards" sheets
- Writes `js/data.js` with `window.CAPS_EMBEDDED_DATA` and `window.CAPS_AWARDS_DATA`
- Copies Excel to `dashboard/data/` directory
- Updates "Last Updated" timestamp in Excel README sheet
- Prints verification: submission count, deals awarded, target state bid counts

**Verify the output shows sensible numbers.** If anything looks wrong, investigate before considering the update complete.

---

## 7. KPI Definitions (Critical — Read Carefully)

**All RFP Overview KPIs are scoped to submission date ≥ October 2025**, not bid closing date. This is because the HubSpot query uses `closedate` as the primary filter (since `submission_date` is a custom field and cannot be filtered server-side), but dashboard metrics use `submission_date` as the primary date.

| KPI | Definition | Formula |
|---|---|---|
| **Total Submissions** | Deals with `submission_date >= Oct 2025` | count of subData |
| **Results Awaiting** | Submitted or Interview stage, `submission_date >= Oct 2025` | Submitted + Interview count |
| **Win Rate** | Decided deals that were won | (Closed Won + Intent to Award) ÷ (CW + IA + Closed Lost) |
| **Interview Shortlists** | Deals where Interview Flag = Yes, `submission_date >= Oct 2025` | count |
| **Deals Awarded** | `submission_date >= Oct 2025`, stage = Closed Won OR Intent to Award | count |

**Why Closed Won + Intent to Award for Win Rate?** Intent to Award is a near-certain win (typically 95%+ convert). Including it gives a more accurate picture of current performance than waiting for the final Closed Won update.

**Why NOT use `awardedDate` field for Deals Awarded?** The `awarded_date` field in HubSpot is not reliably filled in for all Closed Won deals. Using stage is more accurate.

**Interview Flag Logic:**
- Flag = "Yes" if `interview_type` OR `interview_date_time` OR `bafo_date` is non-empty, OR `stage = Interview`
- Subcategory = "BAFO" if `bafo_date` is set; otherwise "Interview"

---

## 8. Agency State Lookup — How It Works

The dashboard shows which US state each deal belongs to. This comes from the "Agency State" column in the Excel, which is populated by `update_excel_v2.py` using a **5-tier** lookup (in order of reliability):

**Tier 1 (PRIMARY): Direct deal→company association**
For each deal, the per-deal pull (Step 3b above) records the company explicitly linked to that deal in HubSpot's association graph, along with the company's `agency_state`. This bypasses all name-matching uncertainty. Stored in `deal_state_lookup.json`.

**Tier 2: DEAL_ID_STATE_OVERRIDES (hardcoded by deal id)**
For deals where HubSpot's `agency` text is blank AND no company is linked.

**Tier 3: Exact normalized name match**
Normalize both the deal's `agency` field and each company name (lowercase, strip all non-alphanumeric). Match deal agency → company name → `agency_state` from HubSpot. Used only as a fallback if Tier 1 didn't find a state.

**Tier 4: Prefix fallback**
If exact match fails, find the longest company key that the deal's normalized agency key *starts with*. This handles cases where HubSpot stores a company name with an acronym suffix, e.g., `"New Mexico Finance Authority ("NMFA")"` vs `"New Mexico Finance Authority"`.

**Tier 5: STATE_OVERRIDES (hardcoded)**
For companies where `agency_state` is blank in HubSpot or the deal's `agency` text field is empty:
- `Minnesota Judicial Branch` → Minnesota
- `Shasta Regional Transportation Agency` → California
- `The Administrative Office of the Courts (AOC)` → Maryland
- `U.S. Consumer Product Safety Commission (CPSC)` → DC
- `Idaho National Laboratory` → Idaho
- `Champaign County Regional Planning Commission` → Illinois
- `San Bernardino City Unified School District` → California
- `University of Michigan` → Michigan

**Tier 4: DEAL_ID_STATE_OVERRIDES**
For deals where the `agency` text field in HubSpot is completely blank (no text entered) but a company IS linked via HubSpot's association graph:
- Deal `127482750660` ("ON-CALL IT QUALITY ASSURANCE…") → Metropolitan Water District of Southern California, California

> If you find new deals with blank agency fields, query the company association directly:
> `search_crm_objects(objectType="companies", filterGroups=[{associatedWith: [{objectType: "deals", operator: "EQUAL", objectIdValues: [deal_id]}]}], properties=["name", "agency_state"])`
> Then add the deal ID to `DEAL_ID_STATE_OVERRIDES` in `update_excel_v2.py`.

---

## 9. Dashboard Pages — What Each Shows

### `index.html` — Landing Page
- Hero stats: Total RFPs (submission date Oct 2025+), Active Pipeline (Submitted + Interview + IA), Deals Awarded (CW + IA), last updated date
- Navigation cards to all other pages

### `rfp-overview.html` — RFP Overview
The main analytics dashboard. All data filtered to `submission_date >= Oct 2025`.
- **5 KPI cards:** Total Submissions, Results Awaiting, Win Rate, Interview Shortlists, Deals Awarded
- **Monthly submission trend** bar chart
- **Interview and BAFO by month** stacked bar chart
- **Awards & Losses by month** grouped bar chart
- **Stage donut** (RFPs by current stage)
- **Pipeline value by stage** (dollar amounts per stage)
- **Monthly conversion funnel** (submissions → interviews → awards)
- **Intent to Award table** (sortable, with HubSpot links)
- Filters: Year, Service Category

### `interviews.html` — Interview Tracker
- Deals that reached Interview or BAFO stage
- Interview conversion rate, BAFO conversion rate
- Timeline of upcoming interviews
- Interview-to-award outcomes by category

### `awards.html` — Awards Dashboard
- **All-time** Closed Won + Intent to Award deals (no date filter — this is independent of the Oct 2025 scope)
- Map of awarded deals by US state
- Filterable table with amounts, dates, categories
- "Delivery Required" toggle (filters on the `delivery_needed = "Yes"` field)

### `state-analysis.html` — State Analysis
- Geographic US map (color-coded by bid count or win count)
- State leaderboard table (all states with bids, sortable)
- **Target states** (CA, NY, TX, FL, VA, OR, SC, IL) highlighted in yellow with ★ star — these are clickable and drill into state-level charts
- **Non-target states** are shown at 70% opacity and are not clickable
- Per-state KPIs when a state is selected: total bids, pipeline value, IA count, wins, win rate
- Monthly submission trend and award trend charts for the selected state
- Service category breakdown for the selected state

### `target-states.html` — Target States Deep Dive
The most detailed page. Shows regional breakdown for 8 target states.

**8 Target States:** California, New York, Texas, Florida, Virginia, Oregon, South Carolina, **Illinois**

For each target state, there are 3 geographic regions with:
- Regional scorecards (bids, wins, IA, win rate per region)
- County-level choropleth map
- Awards location pins (Closed Won + IA by county)
- State leaderboard (all-time awards table for the selected state)
- State filter dropdown (only shows the 8 target states)

**Regional breakdown per state:**
- **California:** Bay Area / NorCal / SoCal
- **New York:** NYC Metro / Hudson Valley / Upstate NY
- **Texas:** DFW / North TX / Houston / Gulf Coast / Central / South / West TX
- **Florida:** South FL / Central FL / North FL
- **Virginia:** Northern VA / Hampton Roads / Central / Western VA
- **Oregon:** Portland Metro / Willamette Valley / Coastal / Eastern / Southern OR
- **South Carolina:** Upstate / Midlands / Coastal / Lowcountry
- **Illinois:** Chicago Metro / Northern Illinois / Central / Southern Illinois

### `california-regions.html` — California Regions
Dedicated deep-dive into California's Bay Area / NorCal / SoCal breakdown with county map, agency listings, and category analysis.

### `pipeline.html` — Pipeline
Active pipeline value and stage progression.

### `predictions.html` — Delivery Forecast
Capacity planning view based on active IA pipeline and rolling award rates.

---

## 10. The `update_excel_v2.py` Script

Located in the AI session working directory (not in the dashboard folder). Run it after every HubSpot pull.

**Key functions:**
- `normalize(s)` — lowercases and strips all non-alphanumeric characters for fuzzy matching
- `get_state(agency_name)` — 3-tier state lookup (exact → prefix fallback → returns "")
- `make_row(idx, props)` — builds the 27-column tuple for a single deal
- `interview_flag(props, stage_label)` — returns (flag, subcategory) tuple
- `write_sheet(ws, deals)` — clears and rewrites an Excel sheet with all deals
- `fmt_date(val)` — formats ISO dates as YYYY-MM-DD
- `fmt_amount(val)` — converts to float for Excel's `$#,##0` format

**Important constants to know:**
- `stage_map` — maps HubSpot internal stage IDs to human labels
- `STATE_OVERRIDES` — hardcoded company→state for blanks in HubSpot
- `DEAL_ID_STATE_OVERRIDES` — hardcoded deal_id→(agency, state) for blank agency fields
- `OCT_2025 = "2025-10"` — used for submission-date counts in output

---

## 11. The `refresh-data.py` Script

Located in `dashboard/`. Run it after `update_excel_v2.py`.

**What it outputs in `data.js`:**
```javascript
window.CAPS_EMBEDDED_DATA = { lastUpdated: "...", records: [...] }
window.CAPS_AWARDS_DATA = [...]
```

Each record in `records` has keys matching Excel column headers (e.g., `"Deal Name"`, `"Stage"`, `"Submission Date"`). `dashboard-common.js` maps these to camelCase properties like `dealName`, `stage`, `submissionDate`.

**Verification output to watch:**
```
Submissions Oct 2025+: 602   ← should match rfp-overview.html KPI
Deals Awarded (CW + IA): 27  ← should match Deals Awarded KPI
```

---

## 12. `dashboard-common.js` — Shared Logic

All pages load this file. Key things it does:
- **`CAPS.loadData()`** — loads `window.CAPS_EMBEDDED_DATA`, parses all date strings into JS `Date` objects, parses amounts into numbers
- **`CAPS.formatCurrency(n)`** — formats as "$1.2M" or "$450K" etc.
- **`CAPS.formatPercent(n)`** — formats as "34.5%"
- **`CAPS.metricCard(title, value, subtitle, color, tooltip)`** — renders a KPI card
- **`CAPS.renderHeader(pageName)`** — renders the shared nav header with active page highlighted
- **Property mapping from Excel columns to JS:**
  - `"Deal Name"` → `d.dealName`
  - `"Stage"` → `d.stage`
  - `"Submission Date"` → `d.submissionDate` (parsed as `Date` object)
  - `"Bid Closing Date"` → `d.bidClosingDate` (parsed as `Date` object)
  - `"Agency State"` → `d.agencyState`
  - `"Interview Flag"` → `d.interviewFlag`
  - `"Amount ($)"` → `d.amount` (number or null)
  - `"HubSpot Link"` → `d.hubspotLink`
  - `"Delivery Required"` → `d.deliveryRequired`

---

## 13. Date Handling — Critical

**All dates are stored as `YYYY-MM-DD` strings in Excel and `Date` objects in JS.**

**Critical rule — always use UTC methods:** HubSpot stores timestamps in UTC (e.g., `"2025-10-01T00:00:00Z"`). JavaScript's local-time methods (`getMonth()`, `getFullYear()`) can shift dates by one day for users in US timezones. **Always use `getUTCMonth()`, `getUTCFullYear()`, `getUTCDate()`** when extracting date components for filtering or charting.

The `getSubMonth(d)` function in `rfp-overview.html` (and `subMonthUTC()` in other pages) correctly uses UTC methods. Do not change these back to local-time methods.

---

## 14. Target States Configuration

The target states system is defined in `target-states.html`:

**`TARGET_STATES` array** — the 8 states shown in the state dropdown filter.

**`TARGET_STATE_SET`** — Set used in the leaderboard table to apply yellow highlight and ★ star. Must match `TARGET_STATES`.

**`STATE_CONFIG`** — per-state regional breakdown config. Contains:
- `stateFips` — 2-digit FIPS code for county map rendering
- `regions` — array of 3 region names
- `countyMap` — FIPS code → region mapping for the county choropleth
- `agencyMap` — normalized agency name → region (for placing award pins)
- `keywords` — category keyword hints per region
- `methodology` — human-readable description of how regions are defined

**To add a new target state:**
1. Add `{ key: 'StateName' }` to `TARGET_STATES`
2. Add `'StateName'` to `TARGET_STATE_SET`
3. Add a full entry to `STATE_CONFIG` with the state's FIPS code, 3 regions, county map, and agency map
4. Add the state name to `TARGET_STATES` in `refresh-data.py`
5. Update the description text in the page subtitle

---

## 15. Known Issues & Edge Cases

### Deals with blank `agency` field
Some deals have no text in the `agency` property but DO have a company linked in HubSpot. These won't match the company lookup. Fix: query the company association for that specific deal ID and add it to `DEAL_ID_STATE_OVERRIDES` in `update_excel_v2.py`.
- Currently handled: deal `127482750660` ("ON-CALL IT QUALITY ASSURANCE…") → Metropolitan Water District of Southern California, California.

### Companies with blank `agency_state` in HubSpot
Some companies exist in HubSpot but their `agency_state` field is never filled in. These are in `STATE_OVERRIDES` in `update_excel_v2.py`. If a new deal shows no state and you know the correct state, add it there.

### New Mexico Finance Authority "(NMFA)"
The deal stores this agency as `"New Mexico Finance Authority ("NMFA")"` with curly-quote suffix. The prefix fallback in `get_state()` handles this automatically — no action needed.

### Minnesota Judicial Branch
`agency_state` is blank in HubSpot. Handled via `STATE_OVERRIDES`. State = Minnesota.

### `service_category__cloned_` — multiple categories
Some deals have multiple service categories separated by semicolons (e.g., `"Managed Services (MSP);Consulting"`). The dashboard splits these on `;` in all charts and filters.

### HubSpot pagination
The API returns max 200 records per page. With 662+ deals, you need 4 pages (offsets 0, 200, 400, 600). Always check the `total` field on the first response and calculate how many pages are needed.

---

## 16. How Company State Lookup Works in State Analysis / Target States Pages

Both `state-analysis.html` and `target-states.html` use `d.agencyState` (from the Excel "Agency State" column) to map deals to states. The `normStateName()` function normalizes common variations:
- `"CA"` → `"California"`
- `"TX"` → `"Texas"`
- `"Illinois "` (trailing space) → `"Illinois"`
- `"Missourie"` (typo) → `"Missouri"`
- `"Washington DC"` → `"Washington, D.C."`

---

## 17. Daily Update — Token-Efficient Recipe (use this every day)

This is the **canonical daily refresh procedure**. It uses ~6 small MCP calls (well under 10% of session token budget) instead of the full 24-page RFP re-pull.

### Strategy
- **RFP sheet (~700 deals):** check NEW added + REMOVED + STAGE EVENTS only. Do NOT diff fields on existing deals.
- **Awards sheet (~84 deals):** check NEW added + REMOVED only.
- **Stage events** (Interview, BAFO, Intent to Award, Awarded): one MCP call with OR'd date filters catches every deal that moved into one of these stages today. Updates each affected deal's full properties (since its stage + dates may have just changed). Critical for keeping the Interview KPI fresh.
- **Once every 10 days:** do a full Awards field-level diff (cheap, 3 small calls + diff) to catch amount/intent-date edits on existing won/IA deals.
- **Once every 10 days:** also do a full RFP field-level diff (more expensive — use parallel subagents pulling 30 records each).

### Daily Steps (low-token)

**Step 1 — Find NEW RFP deals**
Pull deals with `createdate >= <last_snapshot_max_createdate>`. Inline at limit=30. Usually returns 0–5 records.

```
search_crm_objects(
  objectType="deals",
  filterGroups=[{filters:[
    {propertyName:"createdate", operator:"GTE", value:"<YYYY-MM-DD>"},
    {propertyName:"closedate",  operator:"GTE", value:"2025-10-01"},
    {propertyName:"dealstage",  operator:"IN",  values:[<7 stage IDs>]}
  ]}],
  properties:[<full 22 properties>],
  sorts:[{propertyName:"createdate", direction:"DESCENDING"}],
  limit:30, offset:0)
```

**Step 2 — Find NEW Awards**
Pull deals with `createdate >= snapshot_date` filtered to `closedwon` + `2485737153`. Usually 0–2 records.

**Step 2b — Stage-event check (catches Interview / BAFO / IA / Awarded transitions, including backdated entries)**

The naive filter `interview_date_time >= today` MISSES deals where the user backdates the interview record (e.g. logs an interview that happened last week). The fix: also pull every active-stage deal that was actually edited today (after the morning automation, which only touches closed-stage deals). Single MCP call:

```
search_crm_objects(
  objectType="deals",
  filterGroups=[
    # Group 1: ANY active-stage deal modified after morning automation today
    {filters:[
      {propertyName:"hs_lastmodifieddate", operator:"GTE", value:"<today>T08:00:00Z"},
      {propertyName:"dealstage", operator:"IN",
        values:["presentationscheduled","1620129473","2485737153"]},
    ]},
    # Groups 2-5: future-dated stage events (catch advance scheduling)
    {filters:[{propertyName:"interview_date_time",   operator:"GTE", value:"<snapshot_date>"}]},
    {filters:[{propertyName:"bafo_date",             operator:"GTE", value:"<snapshot_date>"}]},
    {filters:[{propertyName:"intent_to_awarded_date",operator:"GTE", value:"<snapshot_date>"}]},
    {filters:[{propertyName:"awarded_date",          operator:"GTE", value:"<snapshot_date>"}]},
  ],
  properties=[<full 22>], limit=30)
```

`<today>T08:00:00Z` = 4 AM EDT, after HubSpot's nightly automation. Result is usually 5–15 deals.

For each returned deal, OVERWRITE its row in `rfp_deals_all.json` (and `awards_deals_all.json` if it's now in CW/IA stage). This keeps the Interview / BAFO / Awards counts accurate — without this step, a deal that moved Submitted → Interview today (or had a backdated interview added) would still show as Submitted in the dashboard.

**Real example caught by this filter:** Scott County's "Information Technology Service Desk Managed Services" was moved from Submitted to Interview on 2026-05-04 with `interview_date_time = 2026-04-23` (backdated). The naive filter missed it; the active-stage `hs_lastmodifieddate` filter catches it.

**Step 3 — Detect REMOVED deals (RFP + Awards combined)**
Get total counts: `search_crm_objects(... limit=1)` for RFP filter and Awards filter. Compare to snapshot counts.
- If `current_total >= snapshot_total + new_count`, no removals (skip the rest of this step).
- If `current_total < snapshot_total + new_count`, removals happened. Pull only the smaller side's full ID list (Awards ~84 fits in 3 limit=30 calls; RFP requires limit=80 IDs-only over ~9 pages → use a subagent for that branch).

**Step 4 — State lookup for new deals**
For any new deal IDs, query their company association directly:
```
search_crm_objects(
  objectType="companies",
  filterGroups=[{associatedWith:[{objectType:"deals", operator:"EQUAL", objectIdValues:[<deal_id>]}]}],
  properties:["name","agency_state"], limit:5)
```
Add to `deal_state_lookup.json`.

**Step 5 — Merge & run scripts**
1. Merge new deals into `rfp_deals_all.json` / `awards_deals_all.json`. Drop any IDs identified as removed.
2. `python3 update_excel_v2.py` — verify "Total RFP rows" matches HubSpot's current count (within ±2 if removal detection skipped).
3. `cd dashboard && python3 refresh-data.py` — verify "Submissions Oct 2025+" looks right and "Last updated" is in ET.

### 10-Day Deep Check (run ~weekly)

For a thorough field-level reconciliation:
1. Re-pull all Awards (3 pages × limit=30) inline. Diff every field of every record against `awards_deals_all.json`.
2. Re-pull all RFP via 3 parallel subagents (each handles 8 pages × limit=30 = 240 records). Combine via EXPLICIT file list (`['rfp_fresh_p00.json',...]` — never use `glob('*page*')` because zero-padded vs unpadded filenames sort weirdly and stale files shadow fresh ones — see §17b below).
3. Diff fields: amount, intent_to_awarded_date, awarded_date, dealstage, closedate, submission_date, agency, rfp_number, service_category, submission_mode, interview_type/date, bafo_date, current_status_of_award, won/lost reasons, delivery_needed.
4. Apply changes; re-run scripts.

**Why the 10-day cadence?** Daily diffs would be expensive. Stage transitions and new deals are caught daily. Only "silent edits" to amount or dates on existing won/IA deals slip through, and those are rarer — a weekly catch-up is sufficient for executive dashboards.

### Output verification thresholds

`update_excel_v2.py` prints these — they tell you if the run was healthy:
- "Total RFP rows" — should match HubSpot's current RFP-stage count (±2 acceptable for incremental).
- "Total Awards rows" — should match HubSpot's exact count.
- "Deals with missing state" — should stay ≤20. If higher, Step 4 missed deals — re-run state lookup for ones in `deals_missing_state.json`.

---

## 17b. Pipeline Gotchas (lessons learned)

### Stale page-files shadowing fresh data
When pulling deals across pages, **DO NOT** use `glob('*_page*.json')` to combine, because filenames like `awards_page_001.json` (zero-padded with underscore) sort AFTER `awards_page1.json` (no underscore) in ASCII. If both exist from different runs, the older one silently overwrites the newer one in any `dict[id] = record` loop, and amount/date fields can revert to stale values.

**Fix:** When combining JSON page files, use an EXPLICIT file list (`['awards_page1.json','awards_page2.json','awards_page3.json']`), or stamp page files with a UTC timestamp in the filename and pick the newest set. After every full re-pull, also delete prior `*_page_*.json` files OR ensure the new pull uses the same filename convention so old files are overwritten in-place.

### Incremental refresh by `hs_lastmodifieddate` is unreliable
HubSpot has nightly automation that touches **every closed deal** at ~midnight EDT. Filtering by `hs_lastmodifieddate >= yesterday` returns the entire dataset. Filtering by `>= today after 4am EDT` misses real edits made yesterday (because the automation overwrites the modified date).

**The only reliable way to detect any-field changes** is a full re-pull plus field-level diff against the prior snapshot. For the small Awards set (~84 deals) this is cheap. For the full RFP set (~700 deals) it's more expensive but still doable in a few subagent calls.

### Amount-only edits are invisible to event-date filters
Filters like `intent_to_awarded_date >= yesterday` or `awarded_date >= yesterday` will catch stage-event changes but NOT field-only edits to existing deals (e.g., a $ amount added to a deal that's been Closed Won for months). Always pair event-date filters with a full re-pull of stage-stable categories (Awards = closedwon + IA) for diff.

---

## 18. HubSpot Connection

The dashboard uses the HubSpot MCP tool (tool ID: `mcp__8535b106-a4fd-450e-a64d-532e773e754a`) connected to HubSpot portal `243046792`. The tools used are:
- `search_crm_objects` — to query deals and companies
- `search_owners` — to get the owner ID→name map (if needed)

The HubSpot MCP tool must be loaded before use. If it returns `InputValidationError`, run `ToolSearch` with `select:mcp__8535b106-a4fd-450e-a64d-532e773e754a__search_crm_objects` first to load the schema.

---

## 19. Folder & Workspace

The workspace folder on the user's computer is:
`CAPS UPDATE DASHBOARD/`

The dashboard lives inside `CAPS UPDATE DASHBOARD/dashboard/`.

The Python scripts (`update_excel_v2.py`) and temporary JSON files live in the **AI session working directory** (`/sessions/[session-id]/`). These files persist between requests in the same session but may be cleared when a new session starts. If they are missing, the full HubSpot pull must be re-run.

---

## 20. Summary of All Decisions Made During Development

| Decision | What Was Chosen | Why |
|---|---|---|
| Primary date for KPIs | Submission date (not bid closing date) | Submission date reflects when we actually submitted the bid, making it the true activity metric |
| Date filtering method | UTC methods (`getUTCFullYear` etc.) | HubSpot timestamps are UTC; local JS methods shift midnight UTC dates by one day in US timezones |
| Win Rate formula | (CW + Intent to Award) ÷ (CW + IA + Lost) | IA is a near-certain win, including it gives a more current/accurate picture |
| Deals Awarded field | Stage = CW or IA (not `awarded_date`) | `awarded_date` is not reliably filled in HubSpot for all won deals |
| Agency state lookup | Company association batches of 100 | Global company search returns 1800+ companies; this is targeted and fast |
| Prefix fallback in state lookup | Match longest company key that deal key starts with | Handles agencies stored with extra suffixes like "(NMFA)" in deal text |
| Target states | CA, NY, TX, FL, VA, OR, SC, IL (8 states) | Business priority; these states have the most bid activity and strategic focus |
| Regional breakdown | 3 regions per target state | Balances granularity vs complexity |
| HubSpot query date filter | `closedate >= 2025-10-01` | `submission_date` is a custom property, not filterable server-side |
| Awards sheet scope | All-time (no date filter) | Awards need historical context; the company's entire track record matters |

---

*Last updated: April 27, 2026*  
*Dashboard built by: Hrithik (hrithik.s@consultadd.com)*
