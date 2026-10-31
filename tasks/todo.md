# Tasks: `secrets`

The spec is [docs/SPEC-secrets.md](../docs/SPEC-secrets.md), and the plan is [plan.md](plan.md).
One PR: branch `feat/secrets`, title `feat(secrets): encrypt stored secrets, ported from
obzorarr`, two commits (more from review are fine): `feat(secrets): port obzorarr's secrets code
and tests`, then `docs(secrets): close the secrets work stream`.

- [ ] **1. Copy** the 14 paths from obzorarr `b9b4737` with the renames in [plan.md](plan.md).
  Declared exceptions, nothing else:
  - `cipher.test.ts` line 237: `placeData(keyId, "comradarr")` becomes
    `placeData(keyId, "obzorarr")`, so the "another app" test binds another app's name.
  - `keyring-test-` (the keyring test's temp prefix) holds no app name and stays as is.
  - If a leak test fails only because a renamed temp-folder prefix (`comradarr-secret-key-`,
    `comradarr-e2e-`) shares 6 characters with what it checks, use a prefix without the app name
    and declare it.
- [ ] **2. Prove the copy.** For each path,
  `diff <(git -C /home/str3d/github/edbfi/obzorarr show b9b4737:$f | sed '<renames>') $f` prints
  nothing beyond the declared exceptions, and
  `git diff --stat origin/main -- src tests playwright.config.ts` lists only the 14 paths. The
  command and its output go in the PR body.
- [ ] **3. Close the work stream** as obzorarr #283's last commit did:
  - `README.md`: obzorarr's "Master key" section with comradarr's names, and its own backup text
    (`pg_dump` of the database, restored with the key; D17, D18).
  - `AGENTS.md` repo section: status and structure.
  - `docs/SPEC.md`: `secrets` built.
  - `docs/SPEC-secrets.md`: cut to what code and tests can't say, as obzorarr's `b9b4737` copy is,
    keeping comradarr's differences (its stored secrets, PostgreSQL, backups, the D17 sentence). Its
    Status points to this repo's own pre-cut commit. The PR body carries the preservation table
    (cleanup procedure 4), reusing obzorarr #283's rows.
  - `docs/decisions.md`: fold in a durable outcome only if the cut leaves it without a home.
  - Delete `tasks/`.
  - `docs/product/legacy-spec.md` stays untouched: a later PR retires the whole file. The PR body
    quotes the owner's retirement instruction where cleanup procedure 2's legacy clause would apply.
- [ ] **4. Gates.** Before each commit: `check`, `test`, `lint` and
  `prek run --all-files --hook-stage manual`. Before pushing: a keyless `build` and `smoke`. By
  hand: the built server with no key exits 1 before listening and prints the fix naming Comradarr.
- [ ] **5. PR body:** the reference and its commit, the copy proof, the declared exceptions, the
  preservation table, the checks and the review outcome.
- [ ] **6. Review:** shepherd the PR until it is ready, then squash-merge and clean up. A finding
  that reopens a point obzorarr settled is REJECTED, citing the obzorarr PR. A real bug stops the
  port: fix it in obzorarr first (its own PR), then port the fix.
