# Tracked repos: two modes (All vs Custom) with a size-keyed default

prq has two repository-access layers: **install scope** (what the GitHub App can
access, curated on GitHub) and **tracked repos** (the repos a user cares about; the
dashboard shows PRs only from these). "Repos I care about" is an explicit human choice,
not derivable from PR activity: a repo with zero open PRs can be tracked, and a stray PR
does not force-track its repo. `prCount` is therefore only a display hint, never the
selection criterion.

## Decision

Tracked repos work in **two modes**, mirroring GitHub's own install model:

- **All**: track every repo in install scope, live. New in-scope repos appear
  automatically. On the wire this is the *absence* of a repo filter.
- **Custom**: an explicit pinned subset, sent as the repo allowlist.

A single tunable threshold **N (~10)** keys the default: a small install scope defaults
into All mode (no onboarding wall, populated dashboard immediately); a large scope
defaults into Custom mode with a guided picker. The same N gates the repo search bar,
which renders only above N. This keeps the model robust whether the user controls their
install scope (narrow, personal) or an org admin installs broadly (large, work), since a
user cannot assume they control install scope at work.

## Considered and rejected

- **Collapse to one layer** (dashboard = all install scope, curate only on GitHub):
  org-wide installs become an unfilterable firehose, and every comparable tool keeps two
  layers.
- **Copy Graphite (explicit-selection-only, capped 3 free / 30 paid)**: that cap is
  monetization, not UX. prq has no tiers, so it offers the friendlier All mode Graphite
  will not. Recorded here so All mode is not later "fixed" back to explicit-only.
