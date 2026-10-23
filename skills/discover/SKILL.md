---
name: discover
description: Research stage — maps relevant code and, for large tasks, library docs, current practices and prior art into a one-page research.md.
---

# Discover

Output: `<main>/.sw/specs/<slug>/research.md` — at most one page. Facts with file:line or URL, no filler.

## Code (always)
1. CodeGraph first if the repo has `.codegraph/`: `codegraph_explore` with the symbols/flow the task touches. Otherwise targeted Grep/Glob, then Read only the relevant ranges.
2. Find: entry points (routes/handlers/pages), the data model and migrations, services the change passes through, existing tests for that area, similar features to copy patterns from, config/env/feature flags involved.
3. Small task: stop here.

## Research (large tasks, or when an external library/API is involved)
Dispatch 2–3 `sw-researcher` agents **in one message** (parallel), each with ONE disjoint question, e.g.:
- library docs — "How does <lib vX> do <thing>? Breaking changes since <version in lockfile>?" (context7 first)
- practice — "Proven approaches + pitfalls for <problem> at <scale>" (WebSearch, prefer official docs and engineering blogs < 2 years old)
- prior art — "How do well-maintained repos implement <thing>?" (`gh search code '<query>' --limit 10`, then read 1–2 files)
Give each: the question, versions from the lockfile, what is already known, and the report path `<main>/.sw/specs/<slug>/research-<topic>.md`. For a very wide codebase, add one `sw-scout` with explicit directories.

## research.md template
```markdown
# Research: <task>
## Current behavior   (how it works today, file:line)
## Touch points       (files/modules the change hits)
## Constraints        (versions, contracts, data volume, existing patterns to follow)
## Options seen       (approaches from docs/prior art, 1 line each + source)
## Risks / unknowns   (what the architect must ask about)
```
Merge researcher reports into it; delete the per-topic files unless they hold detail the plan needs.
