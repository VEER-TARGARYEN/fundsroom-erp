import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useChallan } from '@/api/challans.api'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { LoadingState, ErrorState } from '@/components/ui/states'
import { COMPANY, splitGst, amountInWords, GST_RATE } from '@/config/company'
import { formatDate, formatDateTime } from '@/lib/utils'
import { CHALLAN_STATUS } from '@/config/statusMeta'

/** Plain grouping without the ₹ symbol — the column header carries the unit. */
const num = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    typeof v === 'string' ? Number.parseFloat(v) || 0 : v,
  )

/**
 * Printable tax invoice / delivery challan.
 *
 * Rendered outside AppShell on its own route so there is no sidebar or header to
 * strip, and styled for paper first: fixed A4 width, black on white, and no
 * dependency on the dark theme. `@media print` then removes the on-screen
 * chrome so Save-as-PDF produces the document alone.
 *
 * Deliberately no PDF library — the browser's own engine handles ₹ and Indian
 * names correctly, costs nothing on a 0.1 CPU instance, and adds no bundle
 * weight. The trade-off is that the user goes through the print dialog.
 */
export function ChallanPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const { data: c, isLoading, isError, error, refetch } = useChallan(id ?? null)

  // `?auto=1` opens the print dialog once data has painted — used by the
  // "Print" action elsewhere in the app so it's one click, not two.
  useEffect(() => {
    if (c && params.get('auto') === '1') {
      const t = setTimeout(() => window.print(), 350)
      return () => clearTimeout(t)
    }
  }, [c, params])

  useEffect(() => {
    if (c) document.title = `${c.challanNumber} — ${c.customer?.businessName ?? 'Invoice'}`
    return () => {
      document.title = 'Nexus Core — Fundsroom ERP'
    }
  }, [c])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <LoadingState label="Loading challan…" />
      </div>
    )
  }
  if (isError || !c) {
    return (
      <div className="min-h-screen bg-background p-8">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    )
  }

  const items = c.items ?? []
  const cust = c.customer
  const gst = splitGst(Number.parseFloat(c.taxAmount) || 0, cust?.state)
  const halfRate = (GST_RATE / 2) * 100
  const isTaxInvoice = c.status === 'CONFIRMED'

  return (
    <div className="min-h-screen bg-surface-container-low print:bg-white">
      {/* Screen-only toolbar */}
      <div className="sticky top-0 z-10 border-b border-outline-variant/15 bg-background/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[820px] items-center gap-2 px-4 py-3">
          <Link to="/challans">
            <Button variant="ghost" size="sm" icon="arrow_back">
              Back
            </Button>
          </Link>
          <span className="ml-1 font-mono text-body-sm text-on-surface-variant">
            {c.challanNumber}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {!isTaxInvoice && (
              <span className="flex items-center gap-1.5 rounded-lg bg-warning/15 px-2.5 py-1 text-body-sm text-warning">
                <Icon name="info" size={15} />
                {CHALLAN_STATUS[c.status].label} — not a tax invoice
              </span>
            )}
            <Button size="sm" icon="print" onClick={() => window.print()}>
              Print / Save as PDF
            </Button>
          </span>
        </div>
      </div>

      {/* The document. Fixed width so screen and paper agree on layout. */}
      <div className="mx-auto my-6 w-full max-w-[820px] bg-white p-10 text-[#111827] shadow-card print:my-0 print:max-w-none print:p-0 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between gap-6 border-b-2 border-[#111827] pb-4">
          <div>
            <h1 className="text-[20px] font-bold leading-tight">{COMPANY.legalName}</h1>
            <p className="mt-1 text-[11px] leading-relaxed text-[#4b5563]">
              {COMPANY.addressLine1}, {COMPANY.addressLine2}
              <br />
              {COMPANY.city} {COMPANY.pincode}, {COMPANY.state}
              <br />
              GSTIN: <span className="font-semibold text-[#111827]">{COMPANY.gstin}</span> · PAN:{' '}
              {COMPANY.pan}
              <br />
              {COMPANY.phone} · {COMPANY.email}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[15px] font-bold uppercase tracking-wide">
              {isTaxInvoice ? 'Tax Invoice' : 'Delivery Challan'}
            </p>
            <table className="mt-2 ml-auto text-[11px]">
              <tbody>
                <tr>
                  <td className="pr-3 text-[#6b7280]">No.</td>
                  <td className="font-mono font-semibold">{c.challanNumber}</td>
                </tr>
                <tr>
                  <td className="pr-3 text-[#6b7280]">Date</td>
                  <td>{formatDate(c.confirmedAt ?? c.createdAt)}</td>
                </tr>
                <tr>
                  <td className="pr-3 text-[#6b7280]">Status</td>
                  <td className="font-semibold">{CHALLAN_STATUS[c.status].label}</td>
                </tr>
                <tr>
                  <td className="pr-3 text-[#6b7280]">Supply</td>
                  <td>{gst.intraState ? 'Intra-state' : 'Inter-state'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Parties */}
        <div className="mt-5 grid grid-cols-2 gap-6">
          {[
            { label: 'Bill to', showAddr: true },
            { label: 'Ship to', showAddr: true },
          ].map((box) => (
            <div key={box.label} className="rounded border border-[#d1d5db] p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6b7280]">
                {box.label}
              </p>
              <p className="mt-1 text-[13px] font-semibold">{cust?.businessName ?? '—'}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#4b5563]">
                {cust?.contactPerson}
                {cust?.addressLine1 && (
                  <>
                    <br />
                    {cust.addressLine1}
                  </>
                )}
                {(cust?.city || cust?.state) && (
                  <>
                    <br />
                    {[cust?.city, cust?.state, cust?.pincode].filter(Boolean).join(', ')}
                  </>
                )}
                {cust?.gstin && (
                  <>
                    <br />
                    GSTIN: <span className="font-semibold text-[#111827]">{cust.gstin}</span>
                  </>
                )}
              </p>
            </div>
          ))}
        </div>

        {/* Line items */}
        <table className="mt-5 w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#f3f4f6] text-left">
              {['#', 'Description', 'SKU', 'Qty', 'Rate (₹)', 'Amount (₹)'].map((h, i) => (
                <th
                  key={h}
                  className={`border border-[#d1d5db] px-2 py-1.5 font-bold uppercase tracking-wide ${
                    i >= 3 ? 'text-right' : ''
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className="align-top">
                <td className="border border-[#d1d5db] px-2 py-1.5">{i + 1}</td>
                <td className="border border-[#d1d5db] px-2 py-1.5">{it.productNameSnapshot}</td>
                <td className="border border-[#d1d5db] px-2 py-1.5 font-mono">{it.skuSnapshot}</td>
                <td className="border border-[#d1d5db] px-2 py-1.5 text-right">{it.quantity}</td>
                <td className="border border-[#d1d5db] px-2 py-1.5 text-right font-mono">
                  {num(it.unitPriceSnapshot)}
                </td>
                <td className="border border-[#d1d5db] px-2 py-1.5 text-right font-mono">
                  {num(it.lineTotal)}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="border border-[#d1d5db] px-2 py-4 text-center text-[#6b7280]">
                  No line items on this challan.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Totals + words */}
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6b7280]">
              Amount in words
            </p>
            <p className="mt-1 text-[11px] font-semibold leading-relaxed">
              {amountInWords(Number.parseFloat(c.totalAmount) || 0)}
            </p>

            <div className="mt-4 rounded border border-[#d1d5db] p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6b7280]">
                Bank details
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#4b5563]">
                {COMPANY.bank.name} · {COMPANY.bank.branch}
                <br />
                A/c: <span className="font-mono font-semibold text-[#111827]">{COMPANY.bank.accountNumber}</span>
                <br />
                IFSC: <span className="font-mono font-semibold text-[#111827]">{COMPANY.bank.ifsc}</span>
              </p>
            </div>
          </div>

          <table className="w-full text-[11px] sm:w-[300px]">
            <tbody>
              <tr>
                <td className="px-2 py-1.5 text-[#4b5563]">Taxable value</td>
                <td className="px-2 py-1.5 text-right font-mono">{num(c.subtotal)}</td>
              </tr>
              {gst.intraState ? (
                <>
                  <tr>
                    <td className="px-2 py-1.5 text-[#4b5563]">CGST @ {halfRate}%</td>
                    <td className="px-2 py-1.5 text-right font-mono">{num(gst.cgst)}</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1.5 text-[#4b5563]">SGST @ {halfRate}%</td>
                    <td className="px-2 py-1.5 text-right font-mono">{num(gst.sgst)}</td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td className="px-2 py-1.5 text-[#4b5563]">IGST @ {GST_RATE * 100}%</td>
                  <td className="px-2 py-1.5 text-right font-mono">{num(gst.igst)}</td>
                </tr>
              )}
              <tr className="border-t-2 border-[#111827]">
                <td className="px-2 py-2 text-[13px] font-bold">Total (₹)</td>
                <td className="px-2 py-2 text-right font-mono text-[13px] font-bold">
                  {num(c.totalAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Terms + signature */}
        <div className="mt-6 grid grid-cols-1 gap-6 border-t border-[#d1d5db] pt-4 sm:grid-cols-[1fr_200px]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6b7280]">
              Terms &amp; conditions
            </p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[10px] leading-relaxed text-[#4b5563]">
              {COMPANY.terms.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </div>
          <div className="text-center">
            <p className="text-[11px] text-[#4b5563]">For {COMPANY.legalName}</p>
            <div className="mt-12 border-t border-[#111827] pt-1 text-[10px] text-[#6b7280]">
              Authorised signatory
            </div>
          </div>
        </div>

        <p className="mt-5 border-t border-[#e5e7eb] pt-2 text-center text-[9px] text-[#9ca3af]">
          {isTaxInvoice
            ? 'This is a computer-generated tax invoice.'
            : 'Delivery challan — not valid as a tax invoice until the order is confirmed.'}
          {' · '}
          Prepared by {c.createdBy?.name ?? '—'} · {formatDateTime(c.createdAt)}
        </p>
      </div>

      {/* Print rules. Colour-adjust keeps the header rules and table shading
          from being dropped by the browser's ink-saving default. */}
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          html, body { background: #fff !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          table { page-break-inside: auto; }
          tr    { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
      `}</style>
    </div>
  )
}
