# Changelog

## 1.2.3 - 2026-08-26

### Fixes

- Validate export paths and cross-platform directory names before writing outside the vault.
- Stage page bundle files, publish `index.md` last, and remove newly created directories after normal filesystem failures.

### Refactor

- Require Obsidian 1.13.0 and remove the duplicate legacy settings interface.
- Move export orchestration out of the plugin lifecycle entry point and enable full TypeScript strict mode.
- Stop tracking generated JavaScript and remove the unused stylesheet release asset.

### Tests

- Cover path containment, filename portability, image warnings, hash collisions, conflict suffixes, commit ordering, rollback behavior, and locale parity.

## 1.2.2 - 2026-08-20

### Fixes

- Remove the redundant product name from the plugin description to satisfy the Community directory manifest check.
- Adopt the current official Obsidian lint and type-checking stack and resolve all reported type-safety warnings.
- Add searchable declarative settings for Obsidian 1.13 while retaining the legacy settings interface for older supported versions.

### Build

- Build releases with GitHub Actions and generate provenance attestations for plugin assets.

## 1.2.1 - 2026-08-20

### Fixes

- Remove use of metadata APIs newer than the declared minimum Obsidian version.
- Update the manifest description to satisfy Community directory requirements.
- Replace control-character placeholders and remove obsolete dependency usage flagged by automated review.

### Documentation

- Document required filesystem access and confirm that the plugin makes no network requests or collects user data.

## 1.2.0 - 2026-08-20

### Features

- Rename exported images with stable SHA-256-based filenames and deduplicate identical assets.
- Add configurable ordered word replacement rules for body text, titles, directory names, and frontmatter string values.
- Remove valid `YYYY-MM-DD ` prefixes from daily note export names.
- Create numbered export directories and titles when an article directory already exists.

### Fixes

- Generate valid Markdown image syntax for Obsidian and standard Markdown image embeds.
- Preserve unresolved image references while continuing the remaining export.
- Convert aliased Wiki links using their actual target instead of their display text.

### Documentation

- Document image naming, daily note handling, replacement rules, and conflict-safe exports.
