import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, BellRing, CheckCircle2, ExternalLink, FlaskConical, Loader2, Mail,
  Pencil, Phone, Trash2, UserPlus,
} from 'lucide-react'
import { Button } from '../../lib/shadcn/button'
import { Input } from '../../lib/shadcn/input'
import { Textarea } from '../../lib/shadcn/textarea'
import { Label } from '../../lib/shadcn/label'
import { NativeSelect } from '../../lib/shadcn/native-select'
import { cn } from '../../lib/shadcn/utils'
import { Checkbox } from '../../lib/shadcn/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../lib/shadcn/dialog'
import { CompanySearch } from '../../components/CompanySearch'
import { useActiveUser } from '../../lib/currentUser'
import { resolveRepName } from '../../lib/repNames'
import { fmtDateTime } from '../../components/OrderHistoryTimeline'
import { SAMPLE_STATUSES, STATUS_STYLES, fmtDate } from './shared'
import { SampleItemsTab } from './SampleItemsTab'
import { SampleProjectLink } from './SampleProjectLink'
import { SampleDeliverySection } from './SampleDeliverySection'
import {
  useGetSampleDetail, useUpdateSampleStatus, useUpdateSampleFields, useSearchCustomers,
} from '../../hooks/backend/orders'
import {
  useGetSampleFollowupDetail, useSetSampleFollowupState, useGetSampleConversion,
  useGetSampleCategories, useAddSampleContact, useGetSameNameSampleCount, useDeleteSampleFollowup,
} from '../../hooks/backend/samples'
import type { CompanyMatch, SelectedCompany } from '../orderTypes'
import type { JourneyConversionResult } from '../../components/JourneyTab'

// Full-screen sample detail PAGE (route /samples/:id). Lays out the agreed
// redesign mockup (sample-detail-confirmed.html): a two-column page — left is
// the record (status banner, facts, activity, items, delivery), right rail is
// the Sample Payoff hero, the customer contact, and an at-a-glance strip.
// Reuses the same backend hooks + the self-contained editor components the
// detail MODAL uses, so edits here and in the modal are identical. The modal
// still exists for a quick peek; this page is the deep view.

const FALLBACK_USER_ID = 7730
const ADD_CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type SampleDetailHeader = {
  sample_id: number
  customer_id: number | null
  supplier_id: number | null
  status: string | null
  sample_date: string | null
  requested_arrival_date: string | null
  sent_at: string | null
  delivered_at: string | null
  won_at: string | null
  lost_at: string | null
  decided_by: string | null
  ship_method: string | null
  project: string | null
  project_id: number | null
  project_name: string | null
  project_application: string | null
  launch_timing: string | null
  est_revenue: string | null
  est_commission: string | null
  delivery_carrier: string | null
  delivery_tracking: string | null
  delivery_doc_url: string | null
  delivery_noted_at: string | null
  notes: string | null
  sample_category_id: number | null
  sample_category_name: string | null
  application: string | null
  converted_order_id: number | null
  created_at: string | null
  customer_name: string | null
  customer_contact_name: string | null
  contact_email: string | null
  contact_first_name: string | null
  item_desc: string | null
  supplier_name: string | null
  supplier_code: string | null
  supplier_contact_name: string | null
  rep_name: string | null
  ship_to_address: string | null
  created_by_name: string | null
  tags: string[]
}
type SampleDetailItem = {
  sample_item_id: number
  supplier_item_id: number | null
  supplier_item_spec: string | null
  supplier_item_desc: string | null
  quantity: string | null
  notes: string | null
  est_annual_volume: string | null
  volume_unit: string | null
  est_price: string | null
}
type SampleDetail = { header: SampleDetailHeader | null; items: SampleDetailItem[] }

type FollowupTimelineItem = {
  followup_id: number
  status: string | null
  note: string | null
  user_name: string | null
  updated_at: string | null
}
type FollowupState = {
  status: string
  next_followup_date: string | null
  snooze_until: string | null
  outcome_reason: string | null
  converted_order_id: number | null
  last_touch_at: string | null
  updated_by: string | null
}
type FollowupDetailResult = { found: boolean; state: FollowupState; timeline: FollowupTimelineItem[] }

function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value)
  return m ? m[1]! : ''
}
function todayInput(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function titleCase(v: string): string {
  return v.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}
function followupLabel(status: string | null): string {
  if (!status) return 'Note'
  if (status === 'followed_up') return 'Followed up'
  return titleCase(status)
}
function headerContactName(h: SampleDetailHeader): string {
  return h.customer_contact_name?.trim() || h.customer_name?.trim() || 'the customer'
}
function headerItemPhrase(h: SampleDetailHeader): string {
  const d = h.item_desc?.trim()
  return d ? `the ${d} sample` : 'the sample'
}
function buildSampleMailto(h: SampleDetailHeader, userName: string, brokerageName: string): string {
  const first = (h.contact_first_name ?? '').trim() || 'there'
  const itemDesc = h.item_desc?.trim() ?? ''
  const itemLabel = itemDesc ? `${itemDesc} ` : ''
  const supplierPart = h.supplier_name?.trim() ? ` from ${h.supplier_name.trim()}` : ''
  const projectOrApp = h.project?.trim() || h.application?.trim() || ''
  const forPart = projectOrApp ? ` for your ${projectOrApp}` : ''
  const datePart = h.sample_date ? ` on ${fmtDate(h.sample_date)}` : ''
  const subject = itemDesc ? `Following up on your ${itemDesc} sample` : 'Following up on your sample'
  const company = brokerageName.trim()
  const signature = company ? `Best,\n${userName}\n${company}` : `Best,\n${userName}`
  const body = `Hi ${first},\n\nI wanted to follow up on the ${itemLabel}sample${supplierPart} we sent over${forPart}${datePart}. I'd love to hear how it's performing in your evaluation and whether it looks like a fit for what you're working on.\n\nHappy to answer any questions, pull together specs or documentation, or get you pricing whenever you're ready.\n\n${signature}`
  return `mailto:${encodeURIComponent(h.contact_email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// ---- Card shell -----------------------------------------------------------
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border border-border bg-card p-4', className)}>{children}</div>
}
function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{children}</h2>
      {right}
    </div>
  )
}
function Fact({ label, value, big }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5', big && 'text-[15px] font-semibold')}>{value ?? '—'}</div>
    </div>
  )
}

export default function SampleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const sampleId = Number(id)
  const navigate = useNavigate()
  const { currentUserId, activeBrokerageId, activeBrokerage, currentUser } = useActiveUser()
  const actingUserId = currentUserId ?? FALLBACK_USER_ID

  const detailHook = useGetSampleDetail()
  const followupHook = useGetSampleFollowupDetail()
  const followupRef = useRef(followupHook)
  followupRef.current = followupHook
  const setFollowupHook = useSetSampleFollowupState()
  const deleteFollowupHook = useDeleteSampleFollowup()
  const conversionHook = useGetSampleConversion()
  const updateStatusHook = useUpdateSampleStatus()
  const updateFieldsHook = useUpdateSampleFields()
  const categoriesHook = useGetSampleCategories()

  const rawDetail = detailHook.data as SampleDetail | undefined
  const rawFollowup = followupHook.data as FollowupDetailResult | undefined
  const rawConversion = conversionHook.data as JourneyConversionResult | undefined

  // Retain the last-good payload for THIS sample so the cards never blank out
  // during a refetch. The load effect re-fires whenever activeBrokerageId
  // resolves (the tenant-resolution race), and the hooks return `undefined`
  // mid-flight — without this, header → null for a frame and every card flashes
  // its empty/loading state. Keyed on sampleId so switching samples resets the
  // cache synchronously (no stale frame) rather than showing the prior record.
  const retainRef = useRef<{
    id: number
    detail?: SampleDetail
    followup?: FollowupDetailResult
    conversion?: JourneyConversionResult
  }>({ id: NaN })
  if (retainRef.current.id !== sampleId) retainRef.current = { id: sampleId }
  if (rawDetail?.header) retainRef.current.detail = rawDetail
  if (rawFollowup) retainRef.current.followup = rawFollowup
  if (rawConversion) retainRef.current.conversion = rawConversion

  const detail = rawDetail?.header ? rawDetail : retainRef.current.detail
  const header = detail?.header ?? null
  const followup = rawFollowup ?? retainRef.current.followup
  const timeline = followup?.timeline ?? []
  const conversion = rawConversion ?? retainRef.current.conversion
  const categoryOptions = (categoriesHook.data as { id: number; name: string }[] | undefined) ?? []

  // Load everything for this sample.
  useEffect(() => {
    if (!Number.isFinite(sampleId)) return
    void detailHook.trigger({ sample_id: sampleId, brokerageId: activeBrokerageId })
    void followupRef.current.trigger({ sample_id: sampleId, brokerageId: activeBrokerageId })
    void categoriesHook.trigger()
    const ids = activeBrokerage?.companyIds
    void conversionHook.trigger(ids && ids.length ? { sampleId, brokerCompanyIds: ids } : { sampleId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleId, activeBrokerageId])

  const refreshDetail = () => {
    if (!header) return
    void detailHook.trigger({ sample_id: header.sample_id, brokerageId: activeBrokerageId }, { skipCache: true })
  }
  const refreshFollowup = () => {
    if (!header) return
    void followupRef.current.trigger({ sample_id: header.sample_id, brokerageId: activeBrokerageId }, { skipCache: true })
  }

  // Optimistic status + forced Won/Lost decision (same rules as the modal).
  const [detailStatus, setDetailStatus] = useState<string>('New')
  const [statusError, setStatusError] = useState<string | null>(null)
  const [pendingDecision, setPendingDecision] = useState<'Won' | 'Lost' | null>(null)
  const [decisionDate, setDecisionDate] = useState('')
  useEffect(() => { if (header) setDetailStatus(header.status ?? 'New') }, [detail])

  const commitStatus = async (status: string, extra: Record<string, unknown> = {}) => {
    if (!header || updateStatusHook.loading) return
    const prev = detailStatus
    setStatusError(null)
    setDetailStatus(status)
    try {
      await updateStatusHook.trigger({ sample_id: header.sample_id, status, brokerageId: activeBrokerageId, ...extra })
      refreshDetail()
    } catch (err) {
      setDetailStatus(prev)
      setStatusError(err instanceof Error ? err.message : 'Failed to update status.')
    }
  }
  const handleStagePillClick = (status: string) => {
    if (status === detailStatus && status !== 'Won' && status !== 'Lost') return
    setStatusError(null)
    if (status === 'Won' || status === 'Lost') {
      const existing = status === 'Won' ? toDateInput(header?.won_at) : toDateInput(header?.lost_at)
      setDecisionDate(existing || todayInput())
      setPendingDecision(status)
      return
    }
    setPendingDecision(null)
    void commitStatus(status, { autoFillStageDate: true, clearDecision: true })
  }
  const confirmDecision = () => {
    if (!pendingDecision || !decisionDate) return
    const decidedBy = currentUser?.name || null
    const extra = pendingDecision === 'Won'
      ? { won_at: decisionDate, lost_at: null, decided_by: decidedBy }
      : { lost_at: decisionDate, won_at: null, decided_by: decidedBy }
    void commitStatus(pendingDecision, extra)
    setPendingDecision(null)
  }

  // Editable Category / Application / Context.
  const [editCategoryId, setEditCategoryId] = useState<number | null>(null)
  const [editApplication, setEditApplication] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [fieldsError, setFieldsError] = useState<string | null>(null)
  const [editingFields, setEditingFields] = useState(false)
  useEffect(() => {
    if (!header) return
    setEditCategoryId(header.sample_category_id ?? null)
    setEditApplication(header.application ?? '')
    setEditNotes(header.notes ?? '')
  }, [detail])
  const saveFields = async () => {
    if (!header || updateFieldsHook.loading) return
    setFieldsError(null)
    try {
      await updateFieldsHook.trigger({
        sample_id: header.sample_id,
        project: header.project,
        notes: editNotes.trim() || null,
        sample_category_id: editCategoryId ?? null,
        application: editApplication.trim() || null,
        brokerageId: activeBrokerageId,
      })
      setEditingFields(false)
      refreshDetail()
    } catch (err) {
      setFieldsError(err instanceof Error ? err.message : 'Failed to save.')
    }
  }

  // ---- Follow-up composer (email / call / note) + delete --------------------
  const [fuMode, setFuMode] = useState<'menu' | 'call' | 'note'>('menu')
  const [fuNote, setFuNote] = useState('')
  const [fuError, setFuError] = useState<string | null>(null)
  const [confirmDeleteFuId, setConfirmDeleteFuId] = useState<number | null>(null)
  // Next follow-up date picked in the composer. log_touch OVERWRITES
  // next_followup_date, so we must always send the date we mean to keep —
  // sending null (the old behaviour) silently wiped Brad's reminder.
  const [fuNextDate, setFuNextDate] = useState('')
  const localISO = (d: Date) => {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const plusDaysISO = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localISO(d) }
  // Keep the current date if it's still ahead of today; a past-due date is
  // what this touch is resolving, so it drops (unless a new one is picked).
  const keepableNextDate = (): string | null => {
    const cur = followup?.state?.next_followup_date?.slice(0, 10) ?? null
    return cur && cur > localISO(new Date()) ? cur : null
  }
  const openComposer = (mode: 'call' | 'note') => {
    setFuMode(mode); setFuNote(''); setFuError(null)
    setFuNextDate(keepableNextDate() ?? plusDaysISO(14))
  }
  const submitTouch = async (note: string, nextDate: string | null) => {
    if (!header) return
    setFuError(null)
    try {
      await setFollowupHook.trigger({
        sample_id: header.sample_id, action: 'log_touch', note: note || null,
        next_followup_date: nextDate, brokerageId: activeBrokerageId, user_name: currentUser?.name || null,
      })
      setFuNote(''); setFuNextDate(''); setFuMode('menu')
      refreshFollowup()
    } catch (err) {
      setFuError(err instanceof Error ? err.message : 'Failed to log follow-up.')
    }
  }
  const handleEmail = () => {
    if (!header || !header.contact_email?.trim()) return
    window.open(buildSampleMailto(header, currentUser?.name || '', activeBrokerage?.name ?? ''), '_blank', 'noopener,noreferrer')
    void submitTouch(`Emailed ${headerContactName(header)} about ${headerItemPhrase(header)}.`, keepableNextDate())
  }
  const handleCall = () => {
    if (!header) return
    const base = `Called ${headerContactName(header)} about ${headerItemPhrase(header)}.`
    const typed = fuNote.trim()
    void submitTouch(typed ? `${base} — ${typed}` : base, fuNextDate || null)
  }
  const handleNote = () => { const t = fuNote.trim(); if (t) void submitTouch(t, fuNextDate || null) }
  const handleDeleteFollowup = async (followupId: number) => {
    if (!header || deleteFollowupHook.loading) return
    setFuError(null)
    try {
      await deleteFollowupHook.trigger({ followup_id: followupId, sample_id: header.sample_id, brokerageId: activeBrokerageId })
      setConfirmDeleteFuId(null)
      refreshFollowup()
    } catch (err) {
      setFuError(err instanceof Error ? err.message : 'Failed to delete follow-up.')
    }
  }

  // ---- Sample payoff (right rail hero) --------------------------------------
  // Confirmed when the sample carries a converted_order_id; otherwise show the
  // inferred conversion from getSampleConversion, labelled honestly.
  const confirmedOrderId = header?.converted_order_id ?? null
  const payoff = conversion?.summary
  const payoffDollars = payoff?.commission ?? 0
  const payoffConfidence = payoff?.confidence ?? 'none'
  const payoffLabel = confirmedOrderId
    ? 'Confirmed'
    : payoffConfidence === 'item' ? 'Likely match' : payoffConfidence === 'pair' ? 'Inferred' : 'No match yet'
  const topOrder = conversion?.orders?.[0] ?? null

  if (!Number.isFinite(sampleId)) {
    return <div className="mx-auto wos-container px-6 py-10 text-sm text-muted-foreground">Invalid sample id.</div>
  }

  return (
    <div className="mx-auto wos-container px-6 pb-16">
      {/* Breadcrumbs + back */}
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <button type="button" onClick={() => navigate('/samples')} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Samples
        </button>
        {header?.customer_name && <><span>›</span><span>{header.customer_name}</span></>}
        <span>›</span>
        <span>Sample #{sampleId}</span>
      </div>

      {detailHook.loading && !header ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading sample…
        </div>
      ) : !header ? (
        <div className="py-16 text-sm text-muted-foreground">Sample not found.</div>
      ) : (
        <>
          {/* Header row */}
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 shrink-0 text-primary" />
                <h1 className="text-[22px] font-extrabold leading-tight tracking-tight">{header.item_desc || `Sample #${sampleId}`}</h1>
              </div>
              <div className="mt-1 text-[13px] text-muted-foreground">
                {header.customer_name || 'No customer'}
                {header.supplier_name ? <> · from {header.supplier_name}</> : null}
                {header.sample_date ? <> · sampled {fmtDate(header.sample_date)}</> : null}
                {header.rep_name ? <> · {resolveRepName(header.rep_name) || header.rep_name}</> : null}
              </div>
            </div>
            <div className="ml-auto">
              <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-bold', STATUS_STYLES[detailStatus] ?? STATUS_STYLES['New'])}>{detailStatus}</span>
            </div>
          </div>

          {/* Stage + actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {SAMPLE_STATUSES.map((s) => {
              const selected = s === (pendingDecision ?? detailStatus)
              return (
                <button key={s} type="button" disabled={updateStatusHook.loading}
                  onClick={() => handleStagePillClick(s)}
                  className={cn('rounded-full px-3 py-1 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60',
                    STATUS_STYLES[s], selected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'opacity-50 hover:opacity-100')}>
                  {s}
                </button>
              )
            })}
            <div className="ml-2 flex items-center gap-2">
              {header.contact_email?.trim() ? (
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5"
                  disabled={setFollowupHook.loading}
                  title={header.contact_email.trim()}
                  onClick={handleEmail}>
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="max-w-[16rem] truncate">{`Email ${header.contact_email.trim()}`}</span>
                </Button>
              ) : (
                <AddSampleContactInline sampleId={header.sample_id} customerName={header.customer_name} customerId={header.customer_id}
                  contactName={header.customer_contact_name} contactEmail={header.contact_email} brokerageId={activeBrokerageId}
                  hasEmail={false} currentUserId={actingUserId} onAdded={() => { refreshDetail() }} />
              )}
              {updateStatusHook.loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>

          {/* Forced Won/Lost decision */}
          {pendingDecision && (
            <div className={cn('mt-4 space-y-3 rounded-lg border-2 p-3',
              pendingDecision === 'Won' ? 'border-green-500 bg-green-50 dark:border-green-600 dark:bg-green-950/40' : 'border-red-500 bg-red-50 dark:border-red-600 dark:bg-red-950/40')}>
              <p className="text-sm font-semibold">Record final outcome: {pendingDecision}</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{pendingDecision === 'Won' ? 'Won on' : 'Lost on'} *</Label>
                  <Input type="date" required value={decisionDate} disabled={updateStatusHook.loading}
                    onChange={(e) => setDecisionDate(e.target.value)} className="h-8 w-[10rem] text-sm" />
                </div>
                <Button type="button" size="sm" disabled={!decisionDate || updateStatusHook.loading} onClick={confirmDecision}
                  className={pendingDecision === 'Won' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-600 text-white hover:bg-red-700'}>
                  Mark {pendingDecision}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={updateStatusHook.loading} onClick={() => setPendingDecision(null)}>Cancel</Button>
              </div>
            </div>
          )}
          {statusError && <p className="mt-2 text-xs text-destructive">{statusError}</p>}

          {/* Two-column grid. minmax(0,1fr) lets the left track shrink below
              its content's intrinsic width — without it, wide left-column
              content (items table, project search) forces the track wider than
              available and shoves the 360px right rail off the right edge. */}
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* LEFT: the record */}
            <div className="flex min-w-0 flex-col gap-5">
              {/* Outcome banner */}
              {detailStatus === 'Won' && (
                <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3.5 py-3 text-sm font-semibold text-green-800 dark:border-green-700 dark:bg-green-950/40 dark:text-green-200">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  Won{confirmedOrderId ? <> — converted to order #{confirmedOrderId.toLocaleString('en-US')}</> : null}
                  {header.won_at ? <> on {fmtDate(header.won_at)}</> : null}
                  {header.decided_by ? <> · by {header.decided_by}</> : null}
                </div>
              )}
              {detailStatus === 'Lost' && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 text-sm font-semibold text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
                  Lost{header.lost_at ? <> on {fmtDate(header.lost_at)}</> : null}{header.decided_by ? <> · by {header.decided_by}</> : null}
                </div>
              )}

              {/* Facts + editable category/application/context */}
              <Card>
                <CardTitle right={
                  <button type="button" onClick={() => setEditingFields((v) => !v)} className="text-[11px] font-semibold text-primary hover:underline">
                    {editingFields ? 'Done' : 'Edit'}
                  </button>
                }>Overview</CardTitle>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <Fact label="Customer" value={header.customer_name} big />
                  <Fact label="Supplier / principal" value={header.supplier_name} big />
                  <Fact label="Customer contact" value={header.customer_contact_name} />
                  <Fact label="Rep" value={resolveRepName(header.rep_name) || header.rep_name} />
                  <Fact label="Sampled" value={fmtDate(header.sample_date)} />
                  <Fact label="Requested arrival" value={fmtDate(header.requested_arrival_date)} />
                  {!editingFields ? (
                    <>
                      <Fact label="Category" value={header.sample_category_name} />
                      <Fact label="Application" value={header.application} />
                    </>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Category</Label>
                        <NativeSelect value={editCategoryId == null ? '' : String(editCategoryId)}
                          onChange={(e) => setEditCategoryId(e.target.value === '' ? null : Number(e.target.value))} className="bg-background">
                          <option value="">Select…</option>
                          {categoryOptions.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                        </NativeSelect>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Application</Label>
                        <Input value={editApplication} onChange={(e) => setEditApplication(e.target.value)} placeholder="e.g. gluten-free muffin" className="bg-background" />
                      </div>
                    </>
                  )}
                </div>

                {/* Project link (self-contained editor) */}
                <div className="mt-4 border-t border-border pt-4">
                  <SampleProjectLink
                    sampleId={header.sample_id}
                    customerId={header.customer_id}
                    customerName={header.customer_name}
                    application={header.application}
                    linked={{
                      project_id: header.project_id ?? null,
                      project_name: header.project_name ?? null,
                      project_application: header.project_application ?? null,
                      launch_timing: header.launch_timing ?? null,
                      est_revenue: header.est_revenue ?? null,
                      est_commission: header.est_commission ?? null,
                    }}
                    brokerageId={activeBrokerageId}
                    createdBy={currentUser?.contact_id ?? null}
                    onChanged={refreshDetail}
                  />
                </div>

                {editingFields && (
                  <div className="mt-4 space-y-2 border-t border-border pt-4">
                    <Label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Context</Label>
                    <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="What is this sample for? Application, spec, customer ask…" className="min-h-[72px] bg-background text-sm" />
                    <div className="flex items-center gap-3">
                      <Button type="button" size="sm" onClick={saveFields} disabled={updateFieldsHook.loading} className="gap-1.5">
                        {updateFieldsHook.loading && <Loader2 className="h-4 w-4 animate-spin" />}Save
                      </Button>
                      {fieldsError && <p className="text-xs text-destructive">{fieldsError}</p>}
                    </div>
                  </div>
                )}
                {!editingFields && header.notes && (
                  <div className="mt-4 border-t border-border pt-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Context</div>
                    <p className="mt-1 text-sm">{header.notes}</p>
                  </div>
                )}
              </Card>

              {/* Activity */}
              <Card>
                <CardTitle right={followupHook.loading && !followup ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : undefined}>Activity</CardTitle>
                {/* Contact line */}
                <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs">
                  <span className="font-semibold">Contact:</span>
                  <span>{header.customer_contact_name?.trim() || <span className="text-muted-foreground">No name on file</span>}</span>
                  <span aria-hidden className="text-muted-foreground">·</span>
                  {header.contact_email?.trim()
                    ? <span className="font-medium">{header.contact_email.trim()}</span>
                    : <span className="font-medium text-amber-700">no email yet</span>}
                </div>
                {/* Email the contact right here in Activity too (Brad: didn't want it
                    only up in the header). Same action as the top button. */}
                {header.contact_email?.trim() && (
                  <div className="mb-3">
                    <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5"
                      disabled={setFollowupHook.loading} title={header.contact_email.trim()} onClick={handleEmail}>
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="max-w-[18rem] truncate">{`Email ${header.contact_email.trim()}`}</span>
                    </Button>
                  </div>
                )}
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Next follow-up: <span className="font-medium text-foreground">{followup?.state?.next_followup_date ? fmtDate(followup.state.next_followup_date) : '—'}</span></span>
                  <span aria-hidden>·</span>
                  <span>Last touch: <span className="font-medium text-foreground">{followup?.state?.last_touch_at ? fmtDateTime(followup.state.last_touch_at) : 'Never'}</span></span>
                </div>

                {/* Composer */}
                {fuMode === 'menu' && (
                  <div className="flex flex-col gap-1.5">
                    <AddSampleContactInline sampleId={header.sample_id} customerName={header.customer_name} customerId={header.customer_id}
                      contactName={header.customer_contact_name} contactEmail={header.contact_email} brokerageId={activeBrokerageId}
                      hasEmail={!!header.contact_email?.trim()} currentUserId={actingUserId}
                      onAdded={() => { refreshDetail() }} />
                    <Button type="button" size="sm" variant="outline" className="h-8 justify-start" disabled={setFollowupHook.loading}
                      onClick={() => openComposer('call')}>
                      <Phone className="mr-1.5 h-3.5 w-3.5" />Logged a call
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 justify-start" disabled={setFollowupHook.loading}
                      onClick={() => openComposer('note')}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />Note
                    </Button>
                  </div>
                )}
                {fuMode === 'call' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Add a note (optional)</Label>
                    <Input value={fuNote} onChange={(e) => setFuNote(e.target.value)} placeholder="What was discussed?" className="h-9 bg-background"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCall() } }} />
                    <NextFollowupPicker value={fuNextDate} onChange={setFuNextDate} plusDaysISO={plusDaysISO} disabled={setFollowupHook.loading} />
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => { setFuMode('menu'); setFuNote('') }}>Cancel</Button>
                      <Button type="button" size="sm" className="h-8 gap-1.5" disabled={setFollowupHook.loading} onClick={handleCall}>
                        {setFollowupHook.loading && <Loader2 className="h-4 w-4 animate-spin" />}Save
                      </Button>
                    </div>
                  </div>
                )}
                {fuMode === 'note' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Note</Label>
                    <Textarea value={fuNote} onChange={(e) => setFuNote(e.target.value)} placeholder="Tasting feedback, next step…" className="min-h-[64px] bg-background text-sm" />
                    <NextFollowupPicker value={fuNextDate} onChange={setFuNextDate} plusDaysISO={plusDaysISO} disabled={setFollowupHook.loading} />
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => { setFuMode('menu'); setFuNote('') }}>Cancel</Button>
                      <Button type="button" size="sm" className="h-8 gap-1.5" disabled={setFollowupHook.loading || fuNote.trim() === ''} onClick={handleNote}>
                        {setFollowupHook.loading && <Loader2 className="h-4 w-4 animate-spin" />}Save
                      </Button>
                    </div>
                  </div>
                )}
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BellRing className="h-3.5 w-3.5 shrink-0" /> You'll get an email reminder the morning of your follow-up date.
                </p>
                {fuError && <p className="text-xs text-destructive">{fuError}</p>}

                {/* Timeline */}
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  {timeline.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No notes yet — add the first one above.</p>
                  ) : (
                    [...timeline].reverse().map((t) => (
                      <div key={t.followup_id} className="rounded-md border border-border bg-background px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{followupLabel(t.status)}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-muted-foreground">{t.updated_at ? fmtDateTime(t.updated_at) : '—'}</span>
                            {confirmDeleteFuId === t.followup_id ? (
                              <span className="flex items-center gap-1.5">
                                <button type="button" disabled={deleteFollowupHook.loading} onClick={() => void handleDeleteFollowup(t.followup_id)} className="text-[11px] font-semibold text-destructive hover:underline disabled:opacity-60">{deleteFollowupHook.loading ? 'Deleting…' : 'Delete'}</button>
                                <button type="button" disabled={deleteFollowupHook.loading} onClick={() => setConfirmDeleteFuId(null)} className="text-[11px] text-muted-foreground hover:underline">Cancel</button>
                              </span>
                            ) : (
                              <button type="button" aria-label="Delete this entry" title="Delete this entry" onClick={() => setConfirmDeleteFuId(t.followup_id)} className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        {t.note && <p className="mt-1 text-sm">{t.note}</p>}
                        {t.user_name && <p className="mt-0.5 text-[11px] text-muted-foreground">{t.user_name}</p>}
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* Items sampled (self-contained editor) */}
              <Card>
                <CardTitle>Items sampled</CardTitle>
                <SampleItemsTab
                  header={{
                    sample_id: header.sample_id, customer_id: header.customer_id, supplier_id: header.supplier_id,
                    supplier_code: header.supplier_code, supplier_name: header.supplier_name, item_desc: header.item_desc,
                  }}
                  items={detail?.items ?? []}
                  brokerageId={activeBrokerageId}
                  onChanged={refreshDetail}
                />
              </Card>

              {/* Delivery */}
              <Card>
                <CardTitle>Delivery</CardTitle>
                <SampleDeliverySection
                  sampleId={header.sample_id}
                  values={{
                    delivery_carrier: header.delivery_carrier ?? null,
                    delivery_tracking: header.delivery_tracking ?? null,
                    delivery_doc_url: header.delivery_doc_url ?? null,
                    delivered_at: header.delivered_at ?? null,
                    delivery_noted_at: header.delivery_noted_at ?? null,
                  }}
                  brokerageId={activeBrokerageId}
                  onSaved={refreshDetail}
                />
              </Card>
            </div>

            {/* RIGHT RAIL */}
            <div className="flex flex-col gap-5">
              {/* Payoff hero */}
              <div className="rounded-xl border-none bg-gradient-to-br from-[#20321c] to-[#3b4a2a] p-4 text-[#eef2e6]">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[11px] font-bold uppercase tracking-wide text-[#cdd8bf]">Sample payoff</h2>
                  <span className={cn('rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide',
                    confirmedOrderId ? 'bg-[#cfe6c3] text-[#255021]' : payoffConfidence === 'none' ? 'bg-white/15 text-[#cdd8bf]' : 'bg-[#e3c892] text-[#5a4410]')}>
                    {payoffLabel}
                  </span>
                </div>
                {conversionHook.loading && !conversion ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-[#b9c6a7]"><Loader2 className="h-4 w-4 animate-spin" /> Checking orders…</div>
                ) : payoffConfidence === 'none' && !confirmedOrderId ? (
                  <>
                    <div className="text-[15px] font-semibold">No matching order yet</div>
                    <p className="mt-1 text-[12.5px] text-[#b9c6a7]">We haven't found a follow-on order tied to this sample. Mark it Won to tie it to the order and count the commission.</p>
                  </>
                ) : (
                  <>
                    <div className="text-[30px] font-extrabold leading-none tracking-tight">${payoffDollars.toLocaleString('en-US')}</div>
                    <div className="mt-1 text-[12.5px] text-[#b9c6a7]">commission {confirmedOrderId ? 'won from' : 'linked to'} this sample</div>
                    {topOrder && (
                      <div className="mt-3 flex items-center justify-between rounded-lg border border-white/15 bg-white/[0.07] px-3 py-2.5">
                        <div>
                          <div className="font-bold">Order #{topOrder.order_id.toLocaleString('en-US')}</div>
                          <div className="text-[12px] text-[#b9c6a7]">{fmtDate(topOrder.order_date)}{topOrder.po ? ` · PO ${topOrder.po}` : ''}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-extrabold">${(topOrder.commission ?? 0).toLocaleString('en-US')}</div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-[#b9c6a7]">{topOrder.item_match ? 'item match' : 'pair match'}</div>
                        </div>
                      </div>
                    )}
                    {(confirmedOrderId || topOrder) && (
                      <div className="mt-3">
                        <Button type="button" size="sm" className="w-full justify-center bg-[#caa75d] text-[#2a2210] hover:bg-[#d8b872]"
                          onClick={() => navigate(`/orders/final/${confirmedOrderId ?? topOrder?.order_id}`)}>
                          View order <ExternalLink className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    <p className="mt-2.5 text-[11.5px] text-[#aebb9c]">
                      {confirmedOrderId
                        ? 'Confirmed win — this $ counts exactly in Insights and the weekly samples report.'
                        : 'Inferred from the customer + principal match. Mark the sample Won to confirm and count it exactly.'}
                    </p>
                  </>
                )}
              </div>

              {/* Customer contact */}
              <Card>
                <CardTitle>Customer contact</CardTitle>
                {header.customer_contact_name?.trim() || header.contact_email?.trim() ? (
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--brand-tint))] text-sm font-bold text-[hsl(var(--brand-tint-foreground))]">
                      {(header.customer_contact_name || header.contact_email || '?').trim().slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold">{header.customer_contact_name || '—'}</div>
                      <div className="truncate text-xs text-muted-foreground">{header.contact_email || 'no email'}</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No contact on file yet.</p>
                )}
                <div className="mt-3">
                  <AddSampleContactInline sampleId={header.sample_id} customerName={header.customer_name} customerId={header.customer_id}
                    contactName={header.customer_contact_name} contactEmail={header.contact_email} brokerageId={activeBrokerageId}
                    hasEmail={!!header.contact_email?.trim()} currentUserId={actingUserId} onAdded={() => { refreshDetail() }} />
                </div>
              </Card>

              {/* At a glance */}
              <Card>
                <CardTitle>At a glance</CardTitle>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <Fact label="Status" value={<span className="font-bold">{detailStatus}</span>} />
                  <Fact label="In project" value={header.project_id ? 'Yes' : 'No'} />
                  <Fact label="Sampled" value={fmtDate(header.sample_date)} />
                  <Fact label="Order" value={confirmedOrderId
                    ? <button type="button" onClick={() => navigate(`/orders/final/${confirmedOrderId}`)} className="font-semibold text-primary hover:underline">#{confirmedOrderId.toLocaleString('en-US')}</button>
                    : '—'} />
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Inline "Add / change contact" — mirrors the modal's AddSampleContactInline so
// both surfaces behave identically. Email required; unlinked samples fall back
// to creating the prospect from the sample's own customer_name so Save never
// dead-ends. Backend addSampleContact resolve-or-creates the app-origin company.
function AddSampleContactInline({
  sampleId, customerName, customerId, contactName, contactEmail, brokerageId, hasEmail, currentUserId, onAdded,
}: {
  sampleId: number
  customerName: string | null
  customerId: number | null
  contactName: string | null
  contactEmail: string | null
  brokerageId: number | null
  hasEmail: boolean
  currentUserId: number
  onAdded: () => void
}) {
  const addHook = useAddSampleContact()
  const searchCustomersHook = useSearchCustomers()
  const countHook = useGetSameNameSampleCount()
  const seedName = customerName?.trim() ?? ''

  const [adding, setAdding] = useState(false)
  const [company, setCompany] = useState<SelectedCompany | null>(null)
  const [makeNew, setMakeNew] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [applyToAll, setApplyToAll] = useState(true)
  const [sameNameCount, setSameNameCount] = useState<number | null>(null)
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement | null>(null)

  const reset = () => {
    setCompany(null); setMakeNew(false); setNewCompanyName(''); setApplyToAll(true); setSameNameCount(null)
    setFirst(''); setLast(''); setEmail(''); setError(null)
  }
  const fetchSameNameCount = async () => {
    if (!seedName) { setSameNameCount(null); return }
    try {
      const res = (await countHook.trigger({ brokerageId, customer_name: seedName }).result) as { count: number } | undefined
      setSameNameCount(res?.count ?? 0)
    } catch { setSameNameCount(null) }
  }
  const handleSelectCompany = async (c: CompanyMatch) => {
    setCompany({ company_id: c.company_id, company_name: c.company_name }); setApplyToAll(true); setSameNameCount(null); await fetchSameNameCount()
  }
  const toggleMakeNew = () => {
    if (makeNew) { setMakeNew(false); setNewCompanyName(''); setSameNameCount(null) }
    else { setMakeNew(true); setCompany(null); setNewCompanyName(seedName); setApplyToAll(true); void fetchSameNameCount() }
  }
  const openForm = () => {
    reset()
    setEmail(contactEmail?.trim() ?? '')
    const full = (contactName ?? '').trim()
    if (full) { const parts = full.split(/\s+/); setFirst(parts[0] ?? ''); setLast(parts.slice(1).join(' ')) }
    setAdding(true)
    window.setTimeout(() => emailRef.current?.focus(), 0)
  }
  const closeForm = () => { setAdding(false); reset() }
  const handleSave = async () => {
    const trimmed = email.trim()
    if (!trimmed) { setError('Email is required.'); emailRef.current?.focus(); return }
    if (!ADD_CONTACT_EMAIL_RE.test(trimmed)) { setError('Enter a valid email address.'); emailRef.current?.focus(); return }
    setSaving(true); setError(null)
    try {
      const fallbackNewName = !makeNew && !company && customerId == null && seedName.trim() ? seedName.trim() : null
      const hasExplicitTarget = makeNew ? newCompanyName.trim() !== '' : !!company
      await addHook.trigger({
        sample_id: sampleId, firstName: first.trim() || null, lastName: last.trim() || null, email: trimmed || null,
        brokerageId, changedBy: currentUserId,
        company_id: makeNew ? null : company?.company_id ?? null,
        new_company_name: makeNew ? (newCompanyName.trim() || null) : fallbackNewName,
        apply_to_all_same_name: hasExplicitTarget ? applyToAll : false,
        customer_name: seedName || null,
      })
      setAdding(false); reset(); onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contact.')
    } finally { setSaving(false) }
  }

  const label = hasEmail ? 'Add / change contact' : 'Add contact'
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-8 justify-start"
        style={{ borderColor: 'hsl(var(--gold))', color: 'hsl(var(--gold))' }} onClick={openForm}>
        <UserPlus className="mr-1.5 h-3.5 w-3.5" />{label}
      </Button>
      <Dialog open={adding} onOpenChange={(o) => { if (!o) closeForm() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
      <div className="space-y-1.5">
        {makeNew ? (
          <div className="space-y-1">
            <Label className="text-xs">New customer company</Label>
            <Input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="Company name" className="h-8 bg-background" />
            <p className="text-[11px] text-muted-foreground">Not in WOS yet — this creates the customer in Cambium and links the sample.</p>
          </div>
        ) : (
          <CompanySearch label="Customer company (optional)" placeholder="Search companies…" selected={company}
            onSelect={(c) => void handleSelectCompany(c)} onClear={() => { setCompany(null); setSameNameCount(null) }}
            search={(q) => searchCustomersHook.trigger({ query: q, recentOnly: false, brokerageId }).result as Promise<CompanyMatch[]>}
            accent="primary" initialQuery={seedName} />
        )}
        <button type="button" onClick={toggleMakeNew} className="text-[11px] font-medium text-primary underline underline-offset-2 hover:opacity-80">
          {makeNew ? 'Pick an existing company instead' : "Company not in WOS? Add it as a new customer"}
        </button>
        {(company || (makeNew && newCompanyName.trim() !== '')) && (
          <label className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-2 text-[11px]">
            <Checkbox checked={applyToAll} onCheckedChange={(v) => setApplyToAll(v === true)} className="mt-0.5" />
            <span>Apply to all {sameNameCount ?? '…'} open sample{sameNameCount === 1 ? '' : 's'} for &ldquo;{seedName || 'this customer'}&rdquo;</span>
          </label>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label className="text-xs">First name</Label><Input value={first} onChange={(e) => setFirst(e.target.value)} className="h-8 bg-background" /></div>
        <div className="space-y-1"><Label className="text-xs">Last name</Label><Input value={last} onChange={(e) => setLast(e.target.value)} className="h-8 bg-background" /></div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Email</Label>
        <Input ref={emailRef} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 bg-background"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSave() } }} />
        <p className="text-[11px] text-muted-foreground">The email is what lights up "Email customer".</p>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" className="h-8" disabled={saving} onClick={closeForm}>Cancel</Button>
        <Button type="button" size="sm" className="h-8" disabled={saving || !ADD_CONTACT_EMAIL_RE.test(email.trim())} onClick={() => void handleSave()}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Save
        </Button>
      </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Next follow-up date for the call/note composer: a date input plus quick
// presets. Blank = no reminder.
function NextFollowupPicker({ value, onChange, plusDaysISO, disabled }: {
  value: string
  onChange: (v: string) => void
  plusDaysISO: (n: number) => string
  disabled?: boolean
}) {
  const presets: Array<[string, number]> = [['1 wk', 7], ['2 wks', 14], ['1 mo', 30]]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label className="text-xs text-muted-foreground">Next follow-up</Label>
      <Input type="date" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-8 w-[10.5rem] bg-background text-sm" />
      {presets.map(([label, n]) => (
        <Button key={label} type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={disabled}
          onClick={() => onChange(plusDaysISO(n))}>{label}</Button>
      ))}
      {value && (
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" disabled={disabled}
          onClick={() => onChange('')}>No reminder</Button>
      )}
    </div>
  )
}
