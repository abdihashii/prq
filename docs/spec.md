# PRQ — Product Requirements Document

**Author:** Abdirahman Haji
**Last updated:** June 7, 2026
**Status:** Spec locked, implementation in progress

---

## What we're building

PRQ is a hosted PR command center for engineers who ship fast. It pulls all your open pull requests — the ones you author and the ones you're asked to review — into a single dashboard designed for the new normal of 5-15 PRs in flight at once, rather than the 2-3 PR baseline that older tools assume.

Beyond aggregation, PRQ includes one new opinionated feature: **stacked PRs as a first-class concept**, with auto-managed remote state so you never manually retarget a child PR's base after its parent merges.

---

## The pain

PRQ exists because of four overlapping problems:

1. **Volume.** AI-accelerated development means engineers have many more PRs in flight than tools were designed for. The default GitHub dashboard and most third-party tools were built for an earlier baseline and feel cluttered or slow at modern volumes.

2. **Self-visibility loss.** You can't keep track of your _own_ open PRs — what's stalled, what's blocked on review, what has unaddressed comments, what's mergeable right now. Things slip.

3. **Review backlog.** When the team ships fast, the review queue stacks up. Without good triage, the wrong PRs get reviewed first or none get reviewed in time.

4. **Incremental shipping has friction.** Stacked PRs solve the "don't drop a 2000-line PR on me" problem, but managing stacks manually — retargeting bases, restacking after merges — is enough friction that most engineers skip the practice entirely.

---

## Who it's for

Engineers shipping fast at AI-augmented organizations. Specifically:

- ICs at small-to-mid companies who already do, or want to do, incremental shipping but find the PR-management overhead annoying
- Indie devs and solo founders who don't have access to Graphite via their org
- Engineers at organizations where GitHub's native Stacked PRs isn't enabled and won't be for a while

PRQ is not designed for engineering managers or PMs tracking team output. It is designed for the person doing the actual work.

---

## Design principles

These are the principles that decide what goes in and what stays out. They are Ousterhout-flavored on purpose.

**Simplest possible UX.** If a feature requires explanation, it's a candidate for cutting. The user opens PRQ, sees what's happening, knows what to do next.

**Volume-aware by default.** The dashboard assumes you have 5-15 PRs in play, not 2. Defaults reflect that.

**Stacks are one unit of work, not many.** A chain of three PRs is one piece of work for the author. The UI renders it that way, or stacks will worsen the volume problem they're supposed to alleviate.

**PRQ does not mutate your local git.** No CLI. No working tree state. No conflict UI. PRQ changes _remote_ state — PR base branches via the GitHub API. Local cleanup stays a `git fetch && git pull --rebase` the user runs on their own time.

**No feature without a felt pain.** AI features, team features, notification systems, snooze, read/unread, mark-done — all interesting, all cut because they don't address a stated pain. They earn their way in by use.

**Errors defined out of existence over UX patching.** Design choices eliminate failure modes rather than handle them. Example: stacks are inferred from PR base→head edges every refresh, so there is no stored stack metadata that can drift out of sync, so there is no "stack metadata corruption" bug class to handle.

---

## Scope

### In scope

- Hosted dashboard accessed via web browser
- GitHub App-based authentication and authorization (not PAT)
- Webhook-driven state updates with eventual-consistency fallback
- Aggregated PR view across every repo the App is installed on, including authored PRs and PRs requesting the user's review, with statuses for draft, ready, blocked on review, comments unresolved, CI failing, and mergeable
- Stack detection by inference: if PR B's base branch is PR A's head branch, they form a stack
- Inline nested rendering: children visually nest under the bottom PR, no separate stack view or tab
- Automatic base retargeting: when a parent PR merges, PRQ retargets the child PR's base via the GitHub API
- Subtle visual indicator on auto-retargeted PRs so the user can see what happened

### Explicitly out of scope

- AI features (review summaries, auto-prioritization, draft reviews)
- Team features (assignment, multi-user invites, shared review queues)
- Notification system beyond what GitHub already sends (no PRQ emails, no Slack integration)
- Snooze, read/unread, mark-done state
- A "what's next" single-PR view (the pain is landscape, not single-action)
- CLI for local rebase, push, or sync
- Self-hostable build
- Custom triage logic beyond PRQ's current baseline

---

## Key user journeys

### First install

The user signs in to PRQ via GitHub, installs the GitHub App on the orgs and repos they care about, and lands on a dashboard already populated with their PRs. No PAT setup. No path configuration. No CLI install. Zero ceremony between sign-in and value.

### Morning use

The user opens PRQ. They see authored PRs and review requests across every repo in one view. PRs needing attention surface visibly. Stacks render as nested groups, not as three separate flat entries. The user clicks into the one that needs work and is sent to GitHub for the actual review or response.

### Parent merges while I'm asleep

The user has a stack of three PRs: A → B → C. A teammate merges PR A overnight. By the time the user wakes up, PRQ has already retargeted PR B's base to `main` via the GitHub API. The dashboard shows PR A as merged, PR B as the new bottom of the stack, and PR C still stacked on B. The user takes no action. A small "auto-retargeted to main" indicator on PR B explains what happened.

### Reviewing someone else's stack

A teammate's stack of four PRs appears in the user's review queue. They render as a nested group under the bottom PR. The user reviews them bottom-up via GitHub; PRQ stays out of the review flow itself.

### Revoking the GitHub App

The user removes PRQ's GitHub App from an org. PRQ stops receiving webhook events for that org. Within one refresh, the dashboard reflects the loss of data with a clear indicator. No data corruption, no zombie state, no manual cleanup.

---

## Success criteria

PRQ succeeds if all of the following are true:

1. PRQ has replaced the local version of PRQ and the native GitHub PR list as the user's primary PR dashboard.
2. The user has not manually retargeted a single child PR base — the cascade automation works.
3. The user can see and reason about their stacks in PRQ in less time than they could in GitHub's UI or `git log`.
4. The dashboard does not feel worse than the local PRQ at volumes of 10+ PRs in flight.

If any of these is false, the product is not done.

---

## What this PRD is not

It is not an engineering spec. The data model, architecture, webhook handling strategy, database schema, and stack inference algorithm are all _implementation_ and live in the design weekend output, not here. This document tells you what to build and why. The how is yours.
