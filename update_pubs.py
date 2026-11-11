#!/usr/bin/env python3
"""Regenerate the publication list in index.html from INSPIRE-HEP.

Pulls every record on the INSPIRE author profile (BAI J.March.2) in
most-recent-first order and rewrites the block between the PUBS:START and
PUBS:END markers in index.html. Everything outside the markers is left alone.

Usage:  python3 update_pubs.py
"""
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

BAI = "J.March.2"
SELF_NAME = "March, Jacob"
URL = ("https://inspirehep.net/api/literature?sort=mostrecent&size=250"
       "&q=a%20" + BAI +
       "&fields=titles,authors.full_name,authors.bai,arxiv_eprints,dois,"
       "publication_info,control_number,earliest_date")

INDEX = Path(__file__).resolve().with_name("index.html")
MARKERS = re.compile(r"(?P<indent>[ \t]*)(?P<start><!-- PUBS:START[^>]*-->)"
                     r".*?(?P<end><!-- PUBS:END -->)", re.S)

# INSPIRE lower-cases some title words that should keep their casing.
FIXUPS = [("ds black hole", "dS black hole")]

# INSPIRE journal abbreviations -> how they read in a citation.
JOURNALS = {
    "Class.Quant.Grav.": "Class. Quantum Grav.",
    "Commun.Math.Phys.": "Commun. Math. Phys.",
    "J.Math.Phys.": "J. Math. Phys.",
    "Phys.Rev.A": "Phys. Rev. A",
    "Phys.Rev.B": "Phys. Rev. B",
    "Phys.Rev.D": "Phys. Rev. D",
    "Phys.Rev.Lett.": "Phys. Rev. Lett.",
    "Phys.Rev.X": "Phys. Rev. X",
}
MAX_AUTHORS = 12
MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()


def esc(s):
    return html.escape(s, quote=True)


def journal_name(abbrev):
    return JOURNALS.get(abbrev, re.sub(r"\.(?=\S)", ". ", abbrev))


def render(meta, indent):
    title = meta["titles"][0]["title"]
    for bad, good in FIXUPS:
        title = title.replace(bad, good)

    names = []
    for a in meta.get("authors", []):
        last, _, first = a["full_name"].partition(", ")
        name = esc(f"{first} {last}".strip())
        is_me = a.get("bai") == BAI or a["full_name"] == SELF_NAME
        names.append(f'<span class="me">{name}</span>' if is_me else name)
    if len(names) > MAX_AUTHORS:
        mine = [n for n in names if 'class="me"' in n]
        names = names[:3] + ["et al."] + [n for n in mine if n not in names[:3]]

    recid = meta["control_number"]
    inspire = f"https://inspirehep.net/literature/{recid}"
    eprints = meta.get("arxiv_eprints") or []
    arxiv = eprints[0]["value"] if eprints else None
    dois = meta.get("dois") or []
    doi = dois[0]["value"] if dois else None
    pub = next((p for p in meta.get("publication_info", []) if p.get("journal_title")), None)

    date = meta.get("earliest_date", "")
    meta_bits = []
    if pub:
        artid = pub.get("artid") or pub.get("page_start") or ""
        vol = pub.get("journal_volume", "")
        venue = esc(f'{journal_name(pub["journal_title"])} {vol} '
                    f'({pub.get("year", date[:4])}) {artid}'.strip())
        meta_bits.append(f'<a href="https://doi.org/{esc(doi)}">{venue}</a>' if doi else venue)
    else:
        when = date[:4]
        if len(date) >= 7:
            when = f"{MONTHS[int(date[5:7]) - 1]} {date[:4]}"
        meta_bits.append(f"preprint, {when}" if when else "preprint")
    if arxiv:
        meta_bits.append(f'<a href="https://arxiv.org/abs/{arxiv}">arXiv</a>')
        meta_bits.append(f'<a href="https://arxiv.org/pdf/{arxiv}">pdf</a>')
    meta_bits.append(f'<a href="{inspire}">inspire</a>')
    href = f"https://arxiv.org/abs/{arxiv}" if arxiv else inspire

    i1, i2 = indent, indent + "  "
    return "\n".join([
        f'{i1}<li class="pub">',
        f'{i2}<a class="pub-title" href="{href}">{esc(title)}</a><br>',
        f'{i2}<span class="pub-authors">{", ".join(names)}</span><br>',
        f'{i2}<span class="pub-meta">{" · ".join(meta_bits)}</span>',
        f'{i1}</li>',
    ])


def main():
    try:
        with urllib.request.urlopen(URL, timeout=30) as r:
            hits = json.load(r)["hits"]["hits"]
    except Exception as exc:                       # network, DNS, INSPIRE down
        print(f"could not reach INSPIRE: {exc}", file=sys.stderr)
        return 1
    if not hits:
        print("INSPIRE returned no records -- has the BAI changed?", file=sys.stderr)
        return 1

    page = INDEX.read_text(encoding="utf-8")
    m = MARKERS.search(page)
    if not m:
        print("PUBS:START / PUBS:END markers not found in index.html", file=sys.stderr)
        return 1

    indent = m.group("indent")
    items = "\n".join(render(h["metadata"], indent) for h in hits)
    # external links open in a new tab
    items = re.sub(r'(<a [^>]*?href="https?://[^"]+")', r'\1 target="_blank" rel="noopener"', items)
    block = f'{indent}{m.group("start")}\n{items}\n{indent}{m.group("end")}'
    INDEX.write_text(page[:m.start()] + block + page[m.end():], encoding="utf-8")

    n_pub = sum(1 for h in hits if any(p.get("journal_title")
                for p in h["metadata"].get("publication_info", [])))
    print(f"index.html: {len(hits)} papers ({n_pub} published, {len(hits) - n_pub} preprints)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
