# STAGED: Catch-up grid, clear the ticks after a multi-row change

**Status:** staged only. Not pasted, not published.
**Request:** Brad Nelson, 26 Nov 2026 11:48 MT: *"Please have the check boxes clear after the change is made. If a person (me) forgets to uncheck the boxes and moves forward to another change, all the previously selected records change."*
**Target file:** `SampleCatchup.tsx` (Retool path `/frontend/pages/samples/SampleCatchup.tsx`, app "WOS26 Create Order"). I diffed against the **live published** version, read-only on 27 Nov, because `~/Developer/birchAndGran/cambium/App/fixes/` wasn't reachable from this cloud run. Copy these edits into `fixes/SampleCatchup.tsx` and its `SampleCatchup.md` wrapper too.

## What's going on

The grid has two ways to write to several rows at once:

1. **Bulk bar + Apply button.** Pick values, then click **Apply**. `applyBulk()` calls `resetBulk()`, which clears the dropdowns but leaves `sel` (the ticks) alone.
2. **Editing a cell on a ticked row.** There's no button here. The dropdown saves as soon as it changes, and `targetIds()` spreads that value to *every* ticked row. `sel` isn't cleared afterward either.

So after either path the rows stay ticked. Brad's next cell edit on one of those rows silently rewrites all of them. That's the bug.

To answer Josh's own question in the thread: **both exist.** The bulk bar has an Apply button. Per-cell edits submit themselves on change.

## The fix

After a successful multi-row write, untick the rows that were just written. The toast gets a **Re-select** action, so anyone who wanted to set a second attribute on the same set can tick them all again in one click. That keeps Josh's "change several attributes on several rows" workflow. The bulk bar still sets several fields in one Apply as before.

A failed save leaves the ticks alone, since `applyPatch` returns `undefined` on error.

### Edit 1: add a helper and use it in `cellPatch`

Replace:

```tsx
  const cellPatch = (
    r: Row,
    patch: Parameters<typeof applyPatch>[1],
    optimistic: (x: Row) => Row,
    ids: number[] = targetIds(r)
  ) => {
    void applyPatch(ids, patch, optimistic).then((res) => {
      if (res && ids.length > 1) toast.success(`Updated ${res.updated} samples`)
    })
  }
```

with:

```tsx
  // Brad, 26 Nov 2026: after a multi-row change, untick those rows so the NEXT
  // edit doesn't silently rewrite them again. The toast offers "Re-select" to
  // tick the same rows back for a second change.
  const clearAfterMulti = (ids: number[], message: string) => {
    setSel((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n })
    toast.success(message, {
      description: 'Ticks cleared.',
      action: { label: 'Re-select', onClick: () => setSel(new Set(ids)) },
    })
  }
  const cellPatch = (
    r: Row,
    patch: Parameters<typeof applyPatch>[1],
    optimistic: (x: Row) => Row,
    ids: number[] = targetIds(r)
  ) => {
    void applyPatch(ids, patch, optimistic).then((res) => {
      if (res && ids.length > 1) clearAfterMulti(ids, `Updated ${res.updated} samples`)
    })
  }
```

### Edit 2: `addNewCustomer`, the multi-row branch

Replace:

```tsx
      if (ids.length > 1) { toast.success(`Updated ${res.updated} samples`); return }
```

with:

```tsx
      if (ids.length > 1) { clearAfterMulti(ids, `Updated ${res.updated} samples`); return }
```

### Edit 3: `applyBulk`, after Apply succeeds

Replace:

```tsx
      toast.success(`Set ${parts} on ${res.updated} sample${res.updated === 1 ? '' : 's'}`)
    }
    resetBulk()
```

with:

```tsx
      clearAfterMulti(ids, `Set ${parts} on ${res.updated} sample${res.updated === 1 ? '' : 's'}`)
    }
    resetBulk()
```

(`clearAfterMulti` is declared above `applyBulk` in the component, so the reference works.)

### Optional: header comment

Under the existing "Per-cell edits write immediately; multi-row edits go through the bulk bar." line, add:

```tsx
// After any multi-row write the ticks clear, with a Re-select action on the
// toast (Brad, 26 Nov 2026).
```

## Not touched

- `bulkUpdateSamples.ts` and `getCatchupSamples.ts`. This is frontend-only, so no SQL changed and none needed checking.
- Database: no queries were run.
