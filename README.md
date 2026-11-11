# Personal website

Hand-written static site: plain HTML + CSS, no build step. Hosted on GitHub Pages
under a custom domain (once set up, see below).

| File | |
|---|---|
| `index.html` | the whole site; edit by hand, except the publication block |
| `style.css` | styling; colour tokens at the top, dark mode included |
| `margins.js` | small scroll-driven gravity and entanglement figures in the side margins (screens ≥ 980px wide); the figures are listed at the top of the file |
| `update_pubs.py` | rewrites the publication block in `index.html` from INSPIRE-HEP |
| `build_cv.sh` | builds the public `cv.pdf` from the Academic CV |
| `cv.pdf` | **generated** by `build_cv.sh`; do not replace it with the private CV |
| `photo.jpg` | profile photo |
| `favicon.svg` | "jm" tab icon |
| `.nojekyll` | tells GitHub Pages to serve the files as-is |

## Routine updates

New paper, or a preprint got published:

```
python3 update_pubs.py
```

It queries INSPIRE for author BAI `J.March.2`, newest first, and replaces only
what sits between the `PUBS:START` / `PUBS:END` markers. Titles containing
`$...$` are typeset with KaTeX automatically.

CV changed:

```
./build_cv.sh
```

This copies `Academic_CV/cv.tex` to a temp folder, swaps the header's home
address and phone number for the department address, builds it, and copies the
PDF here. It refuses to build if anything that looks like a phone number or
street address is left, and fails if the bibliography comes out empty (the
broken-biber problem described in `Academic_CV/README.md`). Run `make bib` in
`Academic_CV` first if its publication list is stale.

Preview locally:

```
python3 -m http.server 8765
```

then open <http://localhost:8765>.

## Photo

`photo.jpg` is a 480×600 (4:5) crop with its EXIF metadata stripped. To swap
it, replace the file with another 4:5 image (strip location data first).

## Going live on a custom domain

1. Buy the domain from any registrar (Cloudflare, Porkbun, Namecheap, ...).
2. Create a public GitHub repository (e.g. `website`), push this folder to it,
   and in *Settings → Pages* set the source to the `main` branch, root folder.
3. In *Settings → Pages → Custom domain*, enter the domain. GitHub commits a
   `CNAME` file; keep it.
4. At the registrar, add DNS records:
   - apex (`@`): `A` records `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153` (and optionally `AAAA`
     `2606:50c0:8000::153` … `2606:50c0:8003::153`)
   - `www`: `CNAME` to `<github-username>.github.io`
5. Once the DNS check passes, tick *Enforce HTTPS*.
6. In `index.html`, change the `canonical`, `og:url`, `og:image` and JSON-LD
   URLs from `jacob-march.github.io` to the new domain. Consider adding the site URL to the CV header and to your INSPIRE and
   ORCID profiles.
