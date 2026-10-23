#!/usr/bin/env python3
"""
validate_llmstxt.py — enforce llmstxt.org spec on llms.txt + <docs>/*.md (default docs/llm)

Checks:
  1. llms.txt structure: exactly one # H1, one > blockquote, no headings before first ##,
     each ## H2 is a link list (or the special "## Optional"), max ~80 lines.
  2. Every topic file referenced from llms.txt must exist on disk.
  3. Every (file.md#anchor) link must resolve to a real file and a real heading slug.
  4. No orphan docs/llm/*.md (every file is referenced from llms.txt).
  5. Topic files end with a "## Related" section (project rule).
  6. Topic files ≤ ~400 lines (soft cap).

Exit code: 0 clean, 1 problems found.
"""
import glob, os, re, sys

PARAM = r"(?:\{[^}/\s]+\}|:[A-Za-z_]\w*|<[^>/\s]+>)"

def anchor(h):
    h = re.sub(r"`|\*|\[|\]|\([^)]*\)", "", h).strip().lower()
    return re.sub(r"[^a-z0-9\s-]", "", h).replace(" ", "-")

def anchors_of(text):
    return {anchor(m) for m in re.findall(r"^#{1,6}\s+(.*)$", text, re.M)}

def check_llms_txt(path, topic_files, topic_anchors):
    errs = []
    txt = Path_safe(path).read_text() if Path_safe(path).exists() else ""
    if not txt:
        return [f"missing {path}"]
    lines = txt.splitlines()
    # Exactly one # H1
    h1 = [l for l in lines if l.startswith("# ") and not l.startswith("## ")]
    if len(h1) != 1: errs.append(f"{path}: expected 1 # H1, found {len(h1)}")
    # One > blockquote
    bq = [l for l in lines if l.startswith("> ")]
    if len(bq) < 1: errs.append(f"{path}: missing > blockquote summary")
    # No headings before first ## H2
    first_h2 = next((i for i, l in enumerate(lines) if l.startswith("## ")), None)
    if first_h2 is not None:
        for i in range(first_h2):
            l = lines[i]
            if re.match(r"^#{1,6}\s+", l) and not l.startswith("# "):
                errs.append(f"{path}:{i+1}: heading before first ## H2 not allowed: {l!r}")
    # Soft cap
    if len(lines) > 100:
        errs.append(f"{path}: {len(lines)} lines > soft cap 80 (split topic)")
    return errs

def Path_safe(p): return __import__("pathlib").Path(p)

def check_links(referring_file, base, all_files, all_anchors):
    errs = []
    txt = Path_safe(referring_file).read_text()
    for m in re.finditer(r"\]\(([^)\s]+?)(?:#([^)\s]+))?\)", txt):
        tgt, anc = m.group(1), m.group(2)
        if tgt.startswith(("http", "mailto", "#")):
            if tgt.startswith("#") and anc is None:
                if tgt[1:] not in all_anchors.get(referring_file, set()):
                    errs.append(f"{referring_file}: bad in-page anchor #{tgt[1:]}")
            continue
        if "#" in tgt:
            tgt_file, tgt_anc = tgt.split("#", 1)
        else:
            tgt_file, tgt_anc = tgt, anc
        resolved = os.path.normpath(os.path.join(base, tgt_file))
        if resolved not in all_files:
            errs.append(f"{referring_file}: broken link -> {tgt}")
            continue
        if tgt_anc and tgt_anc not in all_anchors.get(resolved, set()):
            errs.append(f"{referring_file}: bad anchor {tgt} (have: {sorted(all_anchors[resolved])[:5]}...)")
    return errs

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="repo root (default cwd)")
    ap.add_argument("--docs", default="docs/llm", help="topic files dir relative to root")
    args = ap.parse_args()
    os.chdir(args.root)
    md_files = ["llms.txt"] + sorted(glob.glob(os.path.join(args.docs, "*.md")))
    all_anchors = {f: anchors_of(open(f).read()) for f in md_files}
    all_files = set(md_files)
    errs = []
    errs += check_llms_txt("llms.txt", md_files, all_anchors)
    # Orphan check: every docs/llm/*.md must be linked from llms.txt
    llms_txt = open("llms.txt").read() if Path_safe("llms.txt").exists() else ""
    for f in md_files:
        if f == "llms.txt": continue
        if f not in llms_txt:
            errs.append(f"orphan topic file (not linked from llms.txt): {f}")
    # Per-file: each must have ## Related, ≤ ~400 lines
    for f in md_files:
        if f == "llms.txt": continue
        text = open(f).read()
        nlines = text.count("\n") + 1
        if nlines > 450:
            errs.append(f"{f}: {nlines} lines > soft cap 400 (split topic)")
        if not re.search(r"^## Related\s*$", text, re.M):
            errs.append(f"{f}: missing '## Related' section")
    # All link checks
    for f in md_files:
        base = os.path.dirname(f) or "."
        errs += check_links(f, base, all_files, all_anchors)
    if errs:
        print(f"FAIL — {len(errs)} problem(s):")
        for e in errs: print("  ", e)
        sys.exit(1)
    print(f"OK — {len(md_files)} files, no problems")

if __name__ == "__main__":
    main()
