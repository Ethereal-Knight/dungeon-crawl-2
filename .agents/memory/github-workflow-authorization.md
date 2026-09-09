---
name: GitHub workflow authorization
description: Why automatic GitHub Pages publishing is intentionally omitted.
---

Do not reintroduce a GitHub Actions deployment workflow until the credential used to push has GitHub's `workflow` scope.

**Why:** GitHub accepted normal repository authentication but rejected every push containing workflow changes because the OAuth token only had repository scope.

**How to apply:** Restore automatic Pages publishing only after confirming the pushing credential has workflow permission and a normal push containing the workflow succeeds.