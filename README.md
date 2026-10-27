# lekopien-pages

Small sites for lekopien.com, each deployed as its own free Cloudflare Worker:

| Folder | URL | What it is |
| --- | --- | --- |
| `info/` | https://info.lekopien.com | About the studio, services, process, and links to all 12 portfolio projects |
| `payment/` | https://payment.lekopien.com | How payment works, M-Pesa and bank details, FAQ |
| `resources/` | https://resources.lekopien.com | Free guides, an interactive launch checklist, and useful tools |
| `invoices/` | https://invoices.lekopien.com | Invoice generator and payment tracker (data stays in your browser) |

No build step and no dependencies: each folder is plain HTML, CSS and JavaScript.

## Payment details

M-Pesa and NCBA bank details live in the `PAYMENT` object near the bottom of `payment/index.html`. Edit them there if they change.

## Deploy

In **Cloudflare → Workers & Pages → Create → Import a repository**, import this repo once per folder, and set **Root directory** to `info`, `payment`, `resources` or `invoices`. Each folder's `wrangler.jsonc` already names its subdomain, so Cloudflare attaches `info.lekopien.com` and the others automatically.

Preview locally with `npx serve info` (or `payment`, `resources`).

## Invoice generator (`invoices/`)

Invoices are saved in the browser you make them in (localStorage), so anyone else who opens the link sees an empty app. Use **Backup** and **Restore** to keep a copy or move to another device.

- **Create invoices** by outlining the work and price per line, client, engagement and discount. The preview is the printed A4 invoice; **Print / Save PDF** produces the file to send.
- **Set the guardrails per invoice**: deliverables, exclusions, a payment schedule of milestones (for example 50% deposit, 50% before go-live), the terms printed on the invoice, and Annex A, the scope of work and terms of engagement, which you can edit section by section. Clauses can use placeholders such as `{client}`, `{total}`, `{deliverables}` and `{schedule}`.
- **Save your defaults**: any invoice's guardrails can become the starting point for new ones.
- **Track payments**: record each payment received. The dashboard shows what is outstanding, overdue and collected, and each milestone shows as paid, part-paid or due.

Import the repo in Cloudflare with root directory `invoices`. No secrets or settings are needed.

Run it locally by opening `invoices/public/index.html` through any static server (`npx serve invoices/public`); without the Worker it saves to the browser only.

## License

MIT

## Author

Built by **David Lekopien** ([@Lekopien](https://github.com/Lekopien)) · [lekopien.com](https://lekopien.com)
