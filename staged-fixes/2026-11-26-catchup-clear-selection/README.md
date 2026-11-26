# STAGED: Catch-up grid clears ticks after a multi-row change (26 Nov 2026)

**Status:** staged only. Nothing has been published to Retool and no email has been sent.

## What Brad asked
Email from brad@gehrke.com, 2026-11-26 17:48 UTC, subject "Catch up Screen - changing selected records - clear the check boxes after change is made."
When he changes several records at once, the checkboxes stay ticked afterwards. If he forgets to untick them before his next change, that change also lands on all the previously selected records.

## Diagnosis
In the live `/frontend/pages/samples/SampleCatchup.tsx` (app "WOS26 Create Order", 42ec0f66-…):
- `applyBulk()` calls `resetBulk()`, which clears the bulk-bar fields, but it never clears `sel`.
- `cellPatch()` is the "edit one ticked row and every ticked row follows" path. It doesn't clear `sel` after a write either.
- `sel` is only cleared on reload (`load()`), when you click "Clear selection", or when you untick the header box.

The frontend is the only thing at fault. `bulkUpdateSamples` and `getCatchupSamples` don't need changes, and no SQL changed.

## Fix (see `SampleCatchup.clear-selection.diff`)
- `applyBulk`: `setSel(new Set())` once the write succeeds.
- `cellPatch` and `addNewCustomer` (multi-row path): new helper `clearSelIfUsed(ids)` clears the ticks after a successful write that went out to the ticked rows.
- The ticks are only cleared when the write succeeds. On a failure the grid reloads, which already clears them.
- Writes that never used the ticks are left alone, such as the "N more rows say X — link them too?" toast.
- Known edge case: a per-cell **project** edit only spreads to ticked rows that share the edited row's customer. The fix still clears all the ticks afterwards, including rows that were skipped.

## To apply
1. Apply the diff to `~/Developer/birchAndGran/cambium/App/fixes/SampleCatchup.tsx`.
2. Mirror the same change in `SampleCatchup.md`.
3. Paste into Retool and publish.

This run couldn't reach the local `fixes/` folder because it ran in a cloud container, so it built the diff against the live Retool source. Check that the local file matches the live one before you apply it.

## Draft reply to Brad (not sent)
> Brad,
>
> good catch, that one's on me. once a change goes through on a batch of ticked rows, the boxes will clear on their own now, so the next change only hits what you pick fresh. i'll let you know when it's live.
>
> Josh
