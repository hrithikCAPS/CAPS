# Refresh CAPS Dashboard from HubSpot

Copy the command below and paste it into a new Claude session (with HubSpot connected) to pull fresh data.

---

## Command to paste:

```
Refresh my CAPS RFP Dashboard. Pull all deals from HubSpot and replace the RFP Data rows in my Excel file. Do NOT modify the README, Summary, or Stage Legend sheets — only replace data rows in the "RFP Data" sheet and update the Summary formula ranges to match the new row count.

HUBSPOT QUERY:
- objectType: deals
- pipeline: default (Sales Pipeline / RFX board)
- Filter: closedate >= 2025-10-01
- Filter: dealstage IN [presentationscheduled, 1620129473, 2485737153, closedwon, closedlost, 2203296493, 2766010076]
- Sort: closedate ASCENDING
- Limit: 200 per page, paginate until all results collected
- Properties to pull: dealname, dealstage, amount, closedate, createdate, hs_object_id, rfp_number, agency, service_category__cloned_, submission_mode, hubspot_owner_id, interview_type, interview_date_time, bafo_date, intent_to_awarded_date, tentatively_awarded_date, awarded_date, current_status_of_award, closed_won_reason, reason_of_close_lost, submission_date, delivery_needed

STAGE ID MAPPING (confirmed correct):
- presentationscheduled → Submitted
- 1620129473 → Interview
- 2485737153 → Intent to Award
- closedwon → Closed Won
- closedlost → Closed Lost
- 2203296493 → Terminated
- 2766010076 → RFx Cancelled

OWNER RESOLUTION:
- Use search_owners (limit 100) to get all owners
- Map hubspot_owner_id → owner name

HUBSPOT → EXCEL PROPERTY MAPPING:
- service_category__cloned_ → Service Category
- intent_to_awarded_date → Intent to Award Date
- current_status_of_award → Award Status
- closed_won_reason → Won Reason
- reason_of_close_lost → Lost Reason
- delivery_needed → Delivery Required

AGENCY STATE LOOKUP (via deal-company association — CRITICAL: do NOT search all companies):
- Every deal in HubSpot has an associated company (agency) object. That company object has the "agency_state" property.
- You MUST pull agency states by following deal→company associations, NOT by searching all companies globally.
- Process in batches of 100 deal IDs (collect all deal IDs from RFP + Awards queries first):
  For each batch of up to 100 deal IDs:
    search_crm_objects(
      objectType="companies",
      filterGroups=[{associatedWith: [{objectType: "deals", operator: "IN", objectIdValues: [batch_of_deal_ids]}]}],
      properties=["name", "agency_state"],
      limit=200,
      paginate until done
    )
- This returns ONLY companies actually linked to your deals (not all 1800+ companies in HubSpot).
- Build lookup: company name (normalized, lowercased, stripped) → agency_state value
- Match each deal's "Agency" field (normalized, lowercased, stripped) to the lookup
- Write the matched state to the "Agency State" column (column F, after Agency)
- NOTE: Some companies may have no agency_state set in HubSpot — leave those cells blank
- NOTE: 599 deal IDs → 6 batches of ~100 → returns ~95-100 companies per batch (~570 total unique companies)

INTERVIEW FLAG LOGIC:
- Flag = "Yes" if: interview_type OR interview_date_time OR bafo_date is not empty, OR stage = Interview
- Subcategory: if bafo_date not empty → "BAFO", else if Flag=Yes → "Interview", else blank

RFP DATA COLUMNS (27 columns, this exact order):
S.No., HubSpot ID, RFP Number, Deal Name, Agency, Agency State, Stage, Interview Flag, Interview Subcategory, Bid Closing Date, Submission Date, Amount ($), Service Category, Submission Mode, Owner, Interview Type, Interview Date, BAFO Date, Intent to Award Date, Tentatively Awarded Date, Awarded Date, Award Status, Won Reason, Lost Reason, Created Date, HubSpot Link, Delivery Required

HubSpot Link format: https://app-na2.hubspot.com/contacts/243046792/record/0-3/{hs_object_id}

FORMATTING:
- Dates as YYYY-MM-DD, Amounts as $#,##0
- Keep existing header formatting (bold, navy #1B2A4A fill, white font)
- Preserve freeze panes (A2) and auto-filter (update range)
- Update Summary formula row ranges to match new data count
- Update README "Total Records" and "Last Updated" lines

EXCEL FILE: CAPS_RFP_Dashboard_Dataset.xlsx in the selected folder

AWARDS SHEET (separate HubSpot query — ALL TIME, no date filter):
- Sheet name: "Awards" (positioned after "RFP Data")
- This sheet contains ALL Closed Won and Intent to Award deals regardless of closedate
- Query: objectType=deals, NO closedate filter
- Filter: dealstage IN [closedwon, 2485737153]  (Closed Won + Intent to Award only)
- Sort: closedate ASCENDING
- Limit: 200 per page, paginate until all results collected
- Properties to pull: same as RFP Data query above
- Columns: Identical to RFP Data (all 27 columns, same order)
- Re-number S.No. sequentially starting from 1
- Apply same header formatting (bold, navy #1B2A4A fill, white font)
- Apply auto-filter on full range, freeze pane at A2
- Do NOT touch README, Summary, or Stage Legend sheets
- NOTE: This sheet is NOT a subset of RFP Data — it is an independent query that pulls ALL historical awards

AFTER EXCEL UPDATE:
Run: cd dashboard && python3 refresh-data.py
Then verify: total records, stage breakdown, confirm data.js was regenerated.
```

---

**Important:** The stage IDs above were verified on March 30, 2026 via HubSpot's get_properties API. If stages change in HubSpot, re-verify by running: `get_properties(objectType="deals", propertyNames=["dealstage"])`

**delivery_needed property** (HubSpot name: `delivery_needed`, label: "Delivery Needed") was added on April 3, 2026. Maps to the "Delivery Required" column in both the RFP Data and Awards sheets. The Awards dashboard toggle filters on this column — deals with `delivery_needed = "Yes"` are shown when the toggle is active.
