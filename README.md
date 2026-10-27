# lekopien-pages

Three small static sites for lekopien.com, each deployed as its own free Cloudflare Worker:

| Folder | URL | What it is |
| --- | --- | --- |
| `info/` | https://info.lekopien.com | About the studio, services, process, and links to all 12 portfolio projects |
| `payment/` | https://payment.lekopien.com | How payment works, M-Pesa and bank details, FAQ |
| `resources/` | https://resources.lekopien.com | Free guides, an interactive launch checklist, and useful tools |

No build step and no dependencies: each folder is plain HTML and CSS.

## Payment details

M-Pesa and NCBA bank details live in the `PAYMENT` object near the bottom of `payment/index.html`. Edit them there if they change.

## Deploy

In **Cloudflare → Workers & Pages → Create → Import a repository**, import this repo three times, once per folder, and set **Root directory** to `info`, `payment` or `resources`. Each folder's `wrangler.jsonc` already names its subdomain, so Cloudflare attaches `info.lekopien.com` and the others automatically.

Preview locally with `npx serve info` (or `payment`, `resources`).

## License

MIT

## Author

Built by **David Lekopien** ([@Lekopien](https://github.com/Lekopien)) · [lekopien.com](https://lekopien.com)
