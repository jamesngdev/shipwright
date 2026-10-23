#!/usr/bin/env python3
"""
discover_endpoints.py — enumerate every (verb, full_path) pair from **/*.controller.ts (NestJS)

Resolves:
  - @Controller('foo')  →  prefix='foo', version inherited from app default (v1)
  - @Controller({ path: 'foo', version: '2' })  →  prefix='foo', version='2'
  - @Controller({ path: 'foo', version: VERSION_NEUTRAL })  →  no /v<n> prefix
  - Per-method @Version(['2','3'])  →  emit one row per version
  - Per-method HTTP @Get/@Post/@Put/@Patch/@Delete/@All with optional path
  - Multiple controller classes per file (each gets its own version inheritance)

Output: JSON to stdout (or to scripts/.cache/endpoints.json if --cache).
Each row: { "verb": "GET", "full": "/v1/users/:id", "file": "src/...", "line": 42 }
"""
import argparse, json, re, subprocess, sys
from pathlib import Path

Q = r"""['"`]([^'"`]*)['"`]"""
VERSION_NEUTRAL = "VERSION_NEUTRAL"
DEFAULT_VERSION = "1"  # app defaultVersion; overridden by --default-version

def scan(files):
    out = []
    for f in files:
        lines = Path(f).read_text(errors="replace").splitlines()
        # Walk the file, segmenting by @Controller occurrences
        segments = []  # (start_idx, prefix, versions)
        pending_version = None
        for i, ln in enumerate(lines):
            s = ln.strip()
            v = re.match(r"@Version\((.*)\)\s*$", s)
            if v and not segments:
                pending_version = re.findall(Q, v.group(1))
                continue
            if s.startswith("@Controller("):
                body = s[len("@Controller("):].rstrip(")")
                # @Controller('foo')  OR  @Controller({ path: 'foo', version: '2' | VERSION_NEUTRAL | ['2','3'] })
                obj = re.match(r"^\s*\{(.*)\}\s*$", body, re.S)
                prefix, versions = "", [DEFAULT_VERSION]
                if obj:
                    pm = re.search(r"path:\s*" + Q, obj.group(1))
                    if pm: prefix = pm.group(1)
                    vm = re.search(r"version:\s*(?:" + Q + r"|\[([^\]]+)\]|VERSION_NEUTRAL)", obj.group(1))
                    if vm:
                        if vm.group(1) == VERSION_NEUTRAL:
                            versions = []  # no /v<n> segment
                        elif vm.group(2):
                            versions = re.findall(Q, vm.group(2))
                        else:
                            # array form: [v1, v2] — vm.group(1) is the body
                            body = vm.group(1) or ""
                            versions = re.findall(Q, body) or [body.strip("'\"`")]
                else:
                    pm = re.search(Q, body)
                    if pm: prefix = pm.group(1)
                    versions = pending_version or [DEFAULT_VERSION]
                segments.append((i, prefix, versions))
                pending_version = None
        for si, (sl, prefix, cvers) in enumerate(segments):
            el = segments[si + 1][0] if si + 1 < len(segments) else len(lines)
            # find HTTP-verb decorator lines within segment
            for i in range(sl, el):
                s = lines[i].strip()
                hm = re.match(r"@(Get|Post|Put|Patch|Delete|All)\((.*)\)\s*$", s)
                if not hm: continue
                verb = hm.group(1).upper()
                pm = re.search(Q, hm.group(2))
                path = pm.group(1) if pm else ""
                # Per-method @Version span: walk back to previous decorator boundary
                # Collect all @Version(...) that appear *before* this method but *after*
                # the last HTTP-verb decorator (or the segment start).
                span_start = sl
                for j in range(i - 1, sl, -1):
                    if re.match(r"@(Get|Post|Put|Patch|Delete|All)\(", lines[j].strip()):
                        span_start = j + 1; break
                span = "\n".join(lines[span_start:i])
                mvs = re.findall(r"@Version\((.*?)\)", span)
                if mvs:
                    last = mvs[-1]
                    if "VERSION_NEUTRAL" in last:
                        versions = []
                    else:
                        versions = re.findall(Q, last) or [last.strip("'\"`")]
                else:
                    versions = cvers
                p = "/".join(x for x in [prefix, path] if x).strip("/")
                for v in (versions or [""]):  # VERSION_NEUTRAL / unversioned → plain path
                    if v == VERSION_NEUTRAL or v == "":
                        full = ("/" + p) if p else "/"
                    else:
                        full = ("/v" + v + "/" + p).rstrip("/") if p else "/v" + v
                    out.append({"verb": verb, "full": full, "file": f, "line": i + 1})
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="repo root (default cwd)")
    ap.add_argument("--cache", action="store_true", help="also write <root>/.sw/llms-endpoints.json")
    ap.add_argument("--default-version", default="1", help="app defaultVersion (NestJS enableVersioning); 'none' if URI versioning is off")
    args = ap.parse_args()
    global DEFAULT_VERSION
    DEFAULT_VERSION = "" if args.default_version == "none" else args.default_version
    files = subprocess.run(
        ["find", args.root, "-path", "*/node_modules", "-prune", "-o",
         "-name", "*.controller.ts", "-print"],
        capture_output=True, text=True
    ).stdout.split()
    rows = scan(sorted(files))
    if args.cache:
        cache = Path(args.root) / ".sw" / "llms-endpoints.json"
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(rows, indent=2))
    json.dump(rows, sys.stdout, indent=2)
    print(f"\n# total: {len(rows)} endpoints from {len(files)} controllers", file=sys.stderr)

if __name__ == "__main__":
    main()
