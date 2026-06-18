# PRQ

PRQ is a hosted pull-request command center that aggregates a user's authored and
review-requested PRs into one dashboard and auto-manages stacked-PR base branches.
This file fixes the project's ubiquitous language.

## Language

**Dashboard**:
The single aggregated view of every open PR a user authors or is asked to review,
across the repos they track.
_Avoid_: feed, list, home

**Stack**:
A chain of PRs inferred from base→head edges (PR B stacks on PR A when B's base
branch is A's head branch). Never stored; recomputed each refresh.
_Avoid_: chain, train, series

**Retarget**:
Changing a child PR's base branch via the GitHub API when its parent merges, so the
user never does it by hand. "Auto-retarget" is the background worker that performs it.
_Avoid_: rebase, restack, repoint

**Reconciliation**:
The refresh-time pass that brings stored PR state back in line with GitHub; the
eventual-consistency fallback to webhook ingestion.
_Avoid_: sync, refresh, poll

**Webhook ingestion**:
Receiving and storing GitHub webhook events that drive near-real-time dashboard updates.
_Avoid_: event handling, hook processing

**GitHub App**:
The installation-based identity PRQ uses for both authentication and repo access.
Never a personal access token.
_Avoid_: OAuth app, token, PAT

**Allowed account**:
A GitHub account permitted to complete sign-in. The sign-in gate denies every account
not on the list; an empty list denies all (fail-closed). Identified by numeric GitHub
user ID, never login.
_Avoid_: allowlist, whitelist

**Install scope**:
The set of repositories a GitHub App installation grants PRQ access to; the outer
bound of everything PRQ can surface for a user. Curated on GitHub, never inside PRQ.
_Avoid_: access scope, granted repos, permissions

**Tracked repos**:
The repositories a user has chosen to follow — the ones they care about — independent
of whether those repos currently have open PRs. The dashboard shows PRs only from
tracked repos. Always a subset of install scope.
_Avoid_: watched, selected, followed, default repos, allowlist

**PR firehose**:
Every PR that involves a user (authored, review-requested, or reviewed) across their
whole install scope, before tracked-repo filtering narrows it to the dashboard.
_Avoid_: feed, stream
