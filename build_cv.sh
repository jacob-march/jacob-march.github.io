#!/usr/bin/env bash
# Build the website's public cv.pdf from the Academic CV.
#
# The private CV header carries a home address and phone number. This builds a
# copy in a temp directory with that header line replaced by the department
# address + email, then copies the PDF here. The source CV is never modified.
#
# Usage:  ./build_cv.sh            (refresh the CV's publications.bib first with
#                                   `make bib` in the Academic_CV folder if needed)
set -euo pipefail

SRC="${CV_SRC:-$HOME/Library/CloudStorage/Dropbox/Applications/Resume & CV/Academic_CV}"
HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp "$SRC/cv.tex" "$SRC/publications.bib" "$SRC/.latexmkrc" "$TMP/"

python3 - "$TMP/cv.tex" <<'PY'
import re, sys
path = sys.argv[1]
tex = open(path, encoding="utf-8").read()

# The contact line is the first "{\small ...}\\[3pt]" group after \begin{center}.
m = re.search(r"\{\\small[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\\\\\[3pt\]", tex)
if not m:
    sys.exit("build_cv: could not find the contact line in cv.tex")
mail = re.search(r"\\href\{mailto:[^}]*\}\{[^}]*\}", m.group(0))
if not mail:
    sys.exit("build_cv: no mailto link in the contact line")
public = (r"{\small Department of Physics, Northeastern University, Boston, MA"
          r" \;\textperiodcentered\; " + mail.group(0) + r"}\\[3pt]")
tex = tex[:m.start()] + public + tex[m.end():]

# Refuse to publish anything that still looks like a phone number or street address.
body = tex.split(r"\begin{document}", 1)[1]
if re.search(r"\b\d{3}[.\-) ]\s?\d{3}[.\- ]\d{4}\b", body) or re.search(r"\b\d+\s+\w+\s+(Rd|St|Ave|Blvd|Ln|Dr)\b", body):
    sys.exit("build_cv: a phone number or street address is still in cv.tex -- not building")
open(path, "w", encoding="utf-8").write(tex)
PY

cd "$TMP"
latexmk -pdf -interaction=nonstopmode -halt-on-error cv.tex >/dev/null 2>build.log \
  || { cat build.log; tail -40 cv.log; exit 1; }

# latexmk exits 0 even when biber fails and the bibliography comes out empty.
if ! pdftotext cv.pdf - | grep -q "arXiv"; then
  echo "build_cv: publication list is empty (broken biber? see Academic_CV/README.md)" >&2
  exit 1
fi

cp cv.pdf "$HERE/cv.pdf"
echo "wrote $HERE/cv.pdf"
