# llmstxt.org spec + Shipwright conventions

Verbatim spec at https://llmstxt.org/:

> The `llms.txt` file is a markdown file placed at the root path `/llms.txt` of a website.
> It contains the following sections in specific order:
> 1. Optional byte-order mark (BOM)
> 2. **Required H1** with the project/site name
> 3. **Blockquote** with a short summary of the project
> 4. Optional detailed sections (paragraphs, lists, etc., but **no headings**) with more project information
> 5. Optional H2-delimited file lists containing markdown hyperlinks `[name](url)` with optional notes after a `:` colon
>
> Special `## Optional` section: if included, URLs there can be skipped when a shorter context is needed.

## Conventions (enforced by scripts/validate_llmstxt.py)

Defaults below; a repo may override them in CLAUDE.local.md (e.g. a different topic dir).

### llms.txt (root index)

| Rule | Why |
|---|---|
| Exactly 1 `# H1` | Spec requirement |
| ≥ 1 `> ` blockquote (summary) | Spec requirement |
| No `## H2` before the spec-required H1/blockquote | Spec requires H1 → blockquote → details → H2s |
| Soft cap ~80 lines | Index should be skimmable; push detail into topic files |
| One section per major area: Start here, Core concepts, API reference, Reference, Optional | Conventional; client devs know where to look |
| All topic files linked from at least one H2 section | Orphan rule below |

### Topic files (default `docs/llm/*.md`)

| Rule | Why |
|---|---|
| One topic per file — never mix unrelated modules | Easier to link, easier to refresh |
| Soft cap ~400 lines (split if larger) | Single-file loading cost |
| File **must** end with `## Related` section | Lets a reader traverse the doc graph |
| Heading slug rule: lowercase, drop backticks/bold, **strip `(...)` entirely**, replace spaces with `-`. Em dash `—` and slash `/` both become `-`. | GitHub-flavored anchor derivation |
| All link targets inside `docs/llm/` are **relative** paths | Survives filename changes when whole tree moves |
| Never include source paths, service names, or implementation details | Integration-focused; client devs do not need them |

## Anchor derivation in detail

Apply this to **every heading text** to get the slug:

```python
import re
def slug(h):
    s = re.sub(r"`|\*|\[|\]|\([^)]*\)", "", h).strip().lower()
    s = re.sub(r"[^a-z0-9\s-]", "", s)   # keep alnum, space, hyphen
    return s.replace(" ", "-")
```

Examples:

| Heading | Slug |
|---|---|
| `## Workflow endpoint versions` | `workflow-endpoint-versions` |
| `## Refunds — partial / full` | `refunds--partial--full` |
| `## How the payment flow works` | `how-the-payment-flow-works` |

If a parenthesized phrase is a **subtitle** (e.g. `## Refunds (partial)`), replace the parens with an em dash so the anchor keeps the word: `refunds--partial`.
