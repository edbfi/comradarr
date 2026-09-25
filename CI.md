# Repository CI

Comradarr remains planning-only. Existing prek content checks run on every PR and
default-branch push, with the fail-closed shared required aggregate.
Run `SKIP=no-commit-to-branch prek run --all-files` locally. No application
implementation, package toolchain, runtime smoke or placeholder tests are added.

Shared actions, workflows and presets use immutable `v4.0.0` references.
Renovate is the sole ongoing dependency merge owner. Through the shared
`automerge.json` preset it arms GitHub auto-merge with the rebase strategy, and
GitHub merges only after every required CI and policy check passes on the
current head. Shared Renovate policy updates remain manual;
release-age rules, holds and repository-specific updater ownership still apply.
The legacy Actions merger and its comment commands are retired.

The separate PR policy workflow verifies Conventional Commit titles, genuine
matching author sign-offs, Renovate provenance, holds, outstanding review requests
and unresolved changes requests. After a pass, policy re-runs the other event's
older failed verdict for the same head (`actions: write`), so a withdrawn
objection clears without a manual re-run. Require its actual emitted policy context alongside
all existing application/content checks, pinned to GitHub Actions, with strict
up-to-date branch protection. Preserve stronger review requirements. Explicit CI
dispatches do not substitute for a missing metadata policy result. Review exact
head/base, full diffs and all required results before a bootstrap merge, then
verify resulting default-branch CI. Repository-specific updater ownership and
manual publication or delivery controls remain unchanged.
