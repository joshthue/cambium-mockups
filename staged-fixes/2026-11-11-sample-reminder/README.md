# STAGED — sample follow-up loses its reminder (Brad, 2026-11-11)

Not published. Paste `SampleDetailPage.tsx` over `/frontend/pages/samples/SampleDetailPage.tsx`
in the WOS26 Create Order Retool app (or apply `SampleDetailPage.fix.diff`), check it, then publish.

**Brad:** "I went into update this. I added a note but, I could not set another reminder."
(reply to the 2026-11-11 "2 sample follow-ups due" email; sample 13215 GetWell Gathered / FG10122)

**Cause:** the full sample page's composer (Logged a call / Note / Email) calls
`setSampleFollowupState` `log_touch` with `next_followup_date: null` hard-coded, and has no date
field. `log_touch` overwrites `next_followup_date`, so every note wipes the reminder.
DB confirms: 13215 note saved 15:57 UTC, `next_followup_date` now NULL.

**Fix (frontend only):**
- Call / Note composer gets a "Next follow-up" date picker (presets 1 wk / 2 wks / 1 mo, "No reminder").
  It starts on the current date if that's still ahead, otherwise today + 14.
- Email button keeps a still-ahead date and drops a past-due one.
- Backend `setSampleFollowupState.ts` is unchanged.

Not type-checked here (no Retool build in this session).
