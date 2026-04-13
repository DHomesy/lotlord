# Contributing & Release Process

This document covers how to make changes, cut releases, and keep the project tidy over time.

---

## Semantic Versioning

This project follows [Semantic Versioning](https://semver.org) — `MAJOR.MINOR.PATCH`:

| Increment | When to use | Example |
|---|---|---|
| `PATCH` | Bug fixes, copy changes, minor style tweaks — nothing new | `1.0.0` → `1.0.1` |
| `MINOR` | New features that are backwards-compatible (new page, new endpoint, new field) | `1.0.0` → `1.1.0` |
| `MAJOR` | Breaking changes — DB schema breaking, auth flow redesign, API contract change | `1.0.0` → `2.0.0` |

**Pre-release labels** (optional): `1.1.0-beta.1`, `2.0.0-alpha.2`

---

## Branching Convention

```
main          — production-ready code; only updated via merged PRs
dev           — integration branch; all feature branches merge here first
feature/<name> — new feature work (e.g. feature/ai-agent)
fix/<name>     — bug fixes (e.g. fix/duplicate-charge)
chore/<name>   — housekeeping with no user-visible change (e.g. chore/update-deps)
release/<ver>  — optional: staging branch for QA before merging to main (e.g. release/1.1.0)
```

---

## Commit Message Convention

Use the [Conventional Commits](https://www.conventionalcommits.org) format. This keeps `git log` readable and makes generating changelogs straightforward:

```
<type>(<scope>): <short description>

[optional longer body]

[optional footer: BREAKING CHANGE: ..., Closes #123]
```

**Types:**

| Type | When |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Maintenance, dependency updates, tooling |
| `docs` | Documentation only |
| `refactor` | Code restructure with no behaviour change |
| `test` | Adding or updating tests |
| `style` | Formatting, whitespace (no logic change) |
| `perf` | Performance improvement |

**Examples:**
```
feat(charges): add pending status via LATERAL join
fix(tenant): prevent duplicate payment intent creation
chore(deps): bump stripe-js to 8.9.0
docs(readme): document audit log build step 32
```

---

## Release Checklist

Follow this sequence every time you cut a release:

### 1. Update CHANGELOG.md
Move everything from `[Unreleased]` into a new versioned section at the top:

```markdown
## [1.1.0] — YYYY-MM-DD

### Added
- ...

### Fixed
- ...
```

Update the comparison links at the bottom of the file:
```markdown
[Unreleased]: https://github.com/your-org/property-manager/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/your-org/property-manager/compare/v1.0.0...v1.1.0
```

### 2. Bump the version number

Update **both** package.json files to the new version. They should always match:

```bash
# In the repo root
npm version 1.1.0 --no-git-tag-version

# In the frontend folder
cd frontend && npm version 1.1.0 --no-git-tag-version
```

### 3. Commit the release
```bash
git add CHANGELOG.md package.json frontend/package.json
git commit -m "chore(release): v1.1.0"
```

### 4. Tag the release
```bash
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin main --tags
```

### 5. (Optional) Create a GitHub Release
On GitHub → Releases → Draft a new release → select the tag → paste the CHANGELOG section for this version as the release notes.

---

## What Goes in CHANGELOG vs README

| File | Purpose |
|---|---|
| `CHANGELOG.md` | **What changed and when** — per-release history for users and developers |
| `README.md` | **What it is and how to use it** — stable reference; Build Order section is append-only |
| `ROADMAP.md` | **What's coming** — planned features and architecture decisions |
| `Future-Changes.txt` | **Working notes** — informal scratch pad for ideas and in-progress bugs |

---

## Adding a New Build Step

When a significant feature set is complete:

1. Add a `[x] **N. Feature name**` entry to the **Build Order** section in `README.md`
2. If the feature was in `ROADMAP.md`, update its section header to `✅ IMPLEMENTED (Build Step N)`
3. Move any related items in `Future-Changes.txt` to the "Implemented features" section
4. Add the changes to the `[Unreleased]` section of `CHANGELOG.md`
5. When ready to release, follow the Release Checklist above

---

## Database Migration Naming

Migrations are numbered sequentially and never edited after being applied:

```
migrations/
  001_create_users.sql
  002_create_properties_and_units.sql
  ...
  020_create_audit_log.sql   ← always append, never edit an existing file
  021_<description>.sql
```

If you need to alter a table that already has a migration, create a **new** migration file for the change.

---

## Environment Setup

See `README.md` → **Getting Started** for the full list of required environment variables.

Both `src/config/env.js` (API) and `frontend/.env` (Vite) must be populated before running the app.
