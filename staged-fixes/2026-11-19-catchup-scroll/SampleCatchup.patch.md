# STAGED: Catch-up grid can't scroll right (Brad, 19 Nov 2026)

**Status:** staged only. Nothing has been pasted or published in Retool, and no email has been sent.
**Target file:** `/frontend/pages/samples/SampleCatchup.tsx` in WOS26 Create Order (the live published source, read 19 Nov)

## What Brad reported
> "Not able to scroll to the far right side of the screen showing samples catch up."

His screenshot shows the grid card cut off after **Application**, with **Contact** and **Project** out of reach.
The only horizontal scrollbar on screen is the page's own scrollbar, and it's already all the way to the right.

## Cause
The grid wrapper is `overflow-x-auto` with no height limit:

```tsx
<div className={cn('overflow-x-auto rounded-lg border border-border shadow-sm', searchOpen && 'pb-72')}>
```

The table's sideways scroll works, but its scrollbar sits at the **bottom of the table**.
With up to 500 rows loaded, that's thousands of pixels down the page.
Brad would have to scroll to the very last row to find it, so it looks like there's no way to scroll right.
This got worse on 18 Nov when the Supplier column was added, because it pushed Contact and Project past the edge.

## Fix (2 edits)

### Edit 1: give the grid its own height so both scrollbars stay on screen

```diff
-      <div className={cn('overflow-x-auto rounded-lg border border-border shadow-sm', searchOpen && 'pb-72')}>
+      {/* Bounded height (Brad, 19 Nov 2026): with 500 rows the sideways scrollbar
+          sat at the very bottom of the table, so the right-hand columns looked
+          unreachable. The grid now scrolls inside its own box, so both scrollbars
+          stay on screen and the header stays pinned. */}
+      <div className={cn('max-h-[calc(100vh-260px)] min-h-[320px] overflow-auto rounded-lg border border-border shadow-sm', searchOpen && 'pb-72')}>
```

### Edit 2: pin the header row while scrolling (it needs a solid background)

```diff
-          <thead>
-            <tr className="border-b border-border bg-muted/40 text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
+          <thead className="sticky top-0 z-10">
+            <tr className="border-b border-border bg-muted text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
```

## Notes / what to check after you paste
- No backend or SQL change, so `getCatchupSamples.ts` and `bulkUpdateSamples.ts` are untouched and there was no DB query to verify.
- `searchOpen && 'pb-72'` still works: the customer/supplier search results get room inside the scroll box, same as before.
- `260px` is roughly the height of the header, pills, action bar and notice. If the bulk bar is open, the grid gets a bit shorter, which is fine. `min-h-[320px]` stops it from shrinking too far on small laptop screens.
- To check: on a laptop-sized window, open Catch-up → Everything. The sideways scrollbar should show at the bottom of the grid box without scrolling the page. Contact and Project should be reachable, and the header should stay pinned while you scroll down.
- The `.md` preview wrapper on your Mac (`App/fixes/SampleCatchup.md`) wasn't reachable from this run. Apply the same two edits there if you keep it in sync.
