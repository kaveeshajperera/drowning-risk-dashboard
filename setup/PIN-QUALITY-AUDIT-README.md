# Pin Quality Audit — National Drowning Risk Mapping Dashboard

This is an **optional quality-control tool** for the private Google Sheets master. It is **not part of the public website**.

## Purpose

Automatically highlights:
- Coordinates that are blank or outside Sri Lanka;
- Coordinates apparently in a different district (only when the NSDI polygon service is available);
- Multiple differently named records sharing the same pin coordinates;
- Incomplete DS/GN information, generic names and geocoding statuses indicating review is needed.

**A flagged point is not automatically wrong; an unflagged point is NOT automatically correct.** No script can reliably resolve mistranslated Sinhala/Tamil water-body descriptions or tell where a bathing spot lies without local verification.

## How to run

1. Open the **master Google Sheet** that contains your live `Dashboard Data` tab, **not** the public reporting response sheet.
2. Go to **Extensions → Apps Script**.
3. Keep all of your existing geocoding code. Create a separate script file named `PinQualityAudit.gs` using the **+** icon.
4. Copy the contents of `pin-quality-audit.gs` into that new file and save.
5. Select `auditDrowningMapPins` and click **Run**, authorising the required permissions.
6. Return to the master Sheet and open the new **PIN QA** tab. Review **HIGH** flags first, then **MEDIUM**, then **LOW**.

The script does not modify any value in `Dashboard Data`. It rebuilds the PIN QA tab each time. It makes one optional external request for Sri Lankan district boundaries; if unavailable, the report explains that district checks were skipped.

## Safe manual correction procedure

For each suspicious record:
1. Compare with the **original district report** (Sinhala, Tamil or English wording), DS/GN and the actual water body.
2. Consult the corresponding RDHS/MOH, district officer or local informant if needed.
3. Locate the exact water body on satellite imagery, not the general town or village centre.
4. Copy confirmed latitude/longitude to the original record's `latitude` and `longitude` in `Dashboard Data`.
5. Record whether coordinates were **Verified**, **Approximate** or **Unable to verify**, together with the source and reviewer/date. Use separate metadata columns if the sheet has none.
6. Only then treat the new map pin as confirmed. Never auto-update coordinates merely based on a geocoder suggestion.

## Privacy / operational notes

- Keep the master Sheet and QA tab private; it contains quality-review information.
- If the district polygon service is unreachable, district mismatch testing does **not** run; duplicate/missing/vague checks still run.
- Verify administrative boundaries at the time of publication.
- Do not erase the original-language description or source record.
- The public reporting form is a separate workflow and is not modified here.
