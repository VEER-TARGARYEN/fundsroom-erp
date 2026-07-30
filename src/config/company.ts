/**
 * Seller identity printed on invoices.
 *
 * Kept in one place because the GST treatment depends on it: a supply is
 * intra-state (CGST + SGST) or inter-state (IGST) purely by comparing this
 * state to the buyer's. Replace these with real registration details before
 * issuing any document that has to stand up to scrutiny.
 */
export const COMPANY = {
  legalName: 'Fundsroom Wholesale Pvt Ltd',
  tradeName: 'Fundsroom',
  gstin: '27AAFCF1234A1Z8',
  pan: 'AAFCF1234A',
  addressLine1: 'Unit 402, Nexus Business Park',
  addressLine2: 'Andheri East',
  city: 'Mumbai',
  /** Drives CGST+SGST vs IGST. Must match the GSTIN's state code (27 = MH). */
  state: 'Maharashtra',
  stateCode: '27',
  pincode: '400069',
  phone: '+91 22 4000 1200',
  email: 'accounts@fundsroom.in',
  bank: {
    name: 'HDFC Bank',
    accountName: 'Fundsroom Wholesale Pvt Ltd',
    accountNumber: '50200012345678',
    ifsc: 'HDFC0000123',
    branch: 'Andheri East, Mumbai',
  },
  terms: [
    'Goods once dispatched will not be taken back unless agreed in writing.',
    'Payment due within 30 days of invoice date unless otherwise agreed.',
    'Interest at 18% p.a. is chargeable on overdue amounts.',
    'Disputes subject to Mumbai jurisdiction.',
  ],
} as const

/** Total GST rate applied by the backend (see server constants: GST_RATE). */
export const GST_RATE = 0.18

export interface GstSplit {
  /** True when buyer and seller are in the same state. */
  intraState: boolean
  cgst: number
  sgst: number
  igst: number
  total: number
}

/**
 * Split a tax amount into its GST components.
 *
 * The backend stores one combined `taxAmount`; a compliant invoice has to show
 * the split. Same state means the 18% is halved into CGST and SGST; a different
 * state (or an unknown one) is treated as inter-state IGST, which is the safer
 * default — showing CGST/SGST on an inter-state supply is the worse error.
 */
export function splitGst(taxAmount: number, buyerState?: string | null): GstSplit {
  const intraState =
    Boolean(buyerState) && buyerState!.trim().toLowerCase() === COMPANY.state.toLowerCase()

  if (intraState) {
    // Halve on the paise to avoid the two halves failing to re-sum to the total.
    const half = Math.round((taxAmount / 2) * 100) / 100
    return { intraState, cgst: half, sgst: taxAmount - half, igst: 0, total: taxAmount }
  }
  return { intraState, cgst: 0, sgst: 0, igst: taxAmount, total: taxAmount }
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]!
  const t = TENS[Math.floor(n / 10)]!
  const o = ONES[n % 10]!
  return o ? `${t} ${o}` : t
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100)
  const rest = n % 100
  const parts = [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : '']
  return parts.filter(Boolean).join(' ')
}

/**
 * Rupees in words using the Indian numbering system — crore, lakh, thousand.
 * A tax invoice conventionally states the amount in words, and getting the
 * grouping wrong (Western millions) looks immediately wrong to an Indian
 * accounts team.
 */
export function amountInWords(amount: number): string {
  if (!Number.isFinite(amount)) return ''
  const rupees = Math.floor(Math.abs(amount))
  const paise = Math.round((Math.abs(amount) - rupees) * 100)

  if (rupees === 0 && paise === 0) return 'Zero Rupees Only'

  const crore = Math.floor(rupees / 10_000_000)
  const lakh = Math.floor((rupees % 10_000_000) / 100_000)
  const thousand = Math.floor((rupees % 100_000) / 1_000)
  const hundred = rupees % 1_000

  const words = [
    crore ? `${threeDigits(crore)} Crore` : '',
    lakh ? `${twoDigits(lakh)} Lakh` : '',
    thousand ? `${twoDigits(thousand)} Thousand` : '',
    hundred ? threeDigits(hundred) : '',
  ]
    .filter(Boolean)
    .join(' ')

  const sign = amount < 0 ? 'Minus ' : ''
  // Singular forms matter here — "One Rupees" is the kind of thing an accounts
  // team notices immediately on a document they have to file.
  const rupeePart = words ? `${sign}${words} ${rupees === 1 ? 'Rupee' : 'Rupees'}` : ''
  const paisePart = paise ? `${twoDigits(paise)} ${paise === 1 ? 'Paisa' : 'Paise'}` : ''

  return [rupeePart, paisePart].filter(Boolean).join(' and ') + ' Only'
}
