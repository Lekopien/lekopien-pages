// Starting content for settings and new invoices. Everything here is editable in the app.

export const DEFAULT_SETTINGS = {
  business: {
    name: "LEKOPIEN.COM",
    tagline: "Web Engineering · Cloud Hosting · Digital Infrastructure",
    location: "Nairobi, Kenya",
    website: "lekopien.com",
    tradingAs: "Lekopien.com",
    person: "David Lekopien",
    role: "Lead Engineer",
    email: "david.lekopien@gmail.com",
    phone: "0716 873 099",
  },
  payment: {
    mpesa: "0716 873 099",
    mpesaName: "David Lekopien",
    showBank: true,
    bank: {
      "Payee name": "DAVID LEKOPIEN MUCHIRI",
      Bank: "NCBA",
      Branch: "Riverside Branch",
      "Bank code": "07",
      "Branch code": "000",
      "SWIFT code": "CBAFKENX",
      "Account number": "5576840014",
    },
  },
  currency: "KES",
  currencyName: "Kenya Shillings",
  // Default price of the discovery call line that every new invoice starts with, per currency.
  discoveryFee: { KES: 10000, USD: 100 },
  prefix: "INV",
  nextNumber: 43,
  dueDays: 7,
};

export const CURRENCIES = { KES: "Kenya Shillings", USD: "US Dollars" };

export const discoveryItem = (settings, currency) => ({
  ref: "DC-01",
  title: "Discovery call",
  desc: "Scoping session to understand your goals, review your current site and agree the plan, timeline and quote.",
  qty: 1,
  rate: Number(settings.discoveryFee?.[currency] ?? DEFAULT_SETTINGS.discoveryFee[currency] ?? 0),
});

export const DEFAULT_TERMS = [
  "Payment is due within {dueDays} days of the issue date.",
  "All payments should be made in {currencyName} ({currency}).",
  "Third-party costs (domain registration and renewal, paid mailbox or software subscriptions) are not included and are payable by the client directly to the provider.",
  "Ownership of all delivered files transfers to the client on full payment.",
  "The Terms of Engagement in Annex A form part of this invoice and are accepted on signature or on payment of any amount.",
];

export const DEFAULT_SCHEDULE = [
  { label: "Deposit on acceptance", percent: 50, due: "On signature" },
  { label: "Balance on delivery", percent: 50, due: "Before go-live" },
];

export const DEFAULT_ANNEX = [
  {
    title: "Parties and definitions",
    clauses: [
      "“Service Provider” means {person}, trading as {tradingAs}, of {location}. “Client” means {client}, its directors, officers, employees and agents.",
      "“Client Materials” means the Client's business name, domain name(s), logos, text, images, contact details and all other information supplied by or on behalf of the Client. “Services” means the services listed in the Schedule of Services on this invoice.",
    ],
  },
  {
    title: "Scope of the engagement",
    clauses: [
      "The Services are limited to those listed in the Schedule of Services and the Deliverables below. Any other work is a change of scope and will be quoted separately before it starts.",
      "Nothing in this engagement constitutes participation in the Client's business, or financial, legal, regulatory or tax advice by the Service Provider.",
    ],
  },
  {
    title: "Deliverables and exclusions",
    clauses: ["{deliverables}", "{exclusions}"],
  },
  {
    title: "Fees and payment",
    clauses: [
      "The total fee is {total}. {schedule}",
      "Work may pause while any instalment is overdue, and delivery dates move accordingly. Payments are non-refundable once the related work has started.",
    ],
  },
  {
    title: "Client materials and accounts",
    clauses: [
      "The Client provides, owns and is responsible for all Client Materials, and confirms it holds the rights needed for the Service Provider to use and publish them.",
      "The Client remains the registrant and account holder for its domain, hosting and email accounts. The Service Provider acts only as its technical agent on its instructions.",
    ],
  },
  {
    title: "Client warranties",
    clauses: [
      "The Client warrants that it is lawfully established, holds every licence its activities require, that the Client Materials are true and not misleading, and that the website, domain and email services will not be used for any unlawful purpose.",
    ],
  },
  {
    title: "Independent contractor",
    clauses: [
      "The Service Provider is an independent contractor, is not a partner, employee, agent or representative of the Client, and accepts no responsibility for the Client's dealings with its customers or any third party.",
    ],
  },
  {
    title: "Indemnity and limitation of liability",
    clauses: [
      "The Client shall indemnify the Service Provider against all claims, losses and costs arising from the Client Materials, any breach of the Client's warranties, or the Client's business activities.",
      "To the fullest extent permitted by law, the Service Provider's total liability is limited to the fees actually paid under this invoice, and excludes loss of profit, business, reputation or data, and any indirect loss.",
    ],
  },
  {
    title: "Suspension and termination",
    clauses: [
      "The Service Provider may suspend or terminate the Services without refund if payment is overdue or if it reasonably suspects a breach of the Client's warranties or any unlawful activity.",
      "On completion or termination, and subject to payment, the Service Provider hands over all files and access credentials held for the Client, after which the Client is solely responsible for them.",
    ],
  },
  {
    title: "General",
    clauses: [
      "These terms are governed by the laws of Kenya. They form the entire agreement on their subject matter and may be varied only in writing. Signature of this Annex, or payment of any amount under this invoice, constitutes the Client's acceptance of these terms.",
    ],
  },
];

/** The contract guardrails new invoices start from: the user's saved templates, else the built-in ones. */
export function templates(settings) {
  const t = settings.templates ?? {};
  return {
    terms: t.terms ?? DEFAULT_TERMS,
    schedule: t.schedule ?? DEFAULT_SCHEDULE,
    annex: t.annex ?? DEFAULT_ANNEX,
    deliverables: t.deliverables ?? [],
    exclusions: t.exclusions ?? [],
  };
}

export function newInvoice(settings) {
  const today = new Date().toISOString().slice(0, 10);
  const t = structuredClone(templates(settings));
  return {
    id: crypto.randomUUID(),
    number: `${settings.prefix}-${today.slice(0, 4)}-${String(settings.nextNumber).padStart(4, "0")}`,
    status: "draft",
    issueDate: today,
    dueDays: settings.dueDays,
    projectRef: "",
    client: { name: "", attn: "", location: "Nairobi, Kenya", email: "", phone: "" },
    engagement: { title: "", period: "", paymentTerms: `Net ${settings.dueDays} days` },
    currency: settings.currency,
    items: [discoveryItem(settings, settings.currency), { ref: "WM-01", title: "", desc: "", qty: 1, rate: 0 }],
    discount: 0,
    payments: [],
    ...t,
    annexEnabled: true,
    signatures: true,
    notes: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
