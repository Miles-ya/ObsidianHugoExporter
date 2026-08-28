# Changelog

## 1.3.1 - 2026-08-28

### Fixes

- Explicitly load Node.js and modern ECMAScript types so external source scanners can correctly type-check filesystem, path, and cryptography APIs.
- Use `Uint8Array` instead of the Node.js `Buffer` global when writing and hashing exported image data.

## 1.3.0 - 2026-08-27

### Features

- Review the complete final Markdown for sensitive topics, personally identifiable information, and location data with a configurable OpenAI-compatible endpoint before publishing.
- Automatically adapt structured output for OpenAI, DeepSeek, compatible gateways, and local model services.
- Follow Obsidian's interface language for AI-generated titles, reasons, and replacement suggestions.
- Present important findings first in a responsive table with editable replacements and explicit **Replace** or **Ignore** actions.
- Strip privacy metadata from referenced images locally while preserving orientation and color profiles.

### Fixes

- Accept JSON wrapped in code fences or explanatory text and retry one genuinely invalid AI response.
- Preserve original text unless the user explicitly selects **Replace** for that finding.

### Safety

- Send only the current article's final Markdown to the configured AI provider; images and image metadata never leave the device.
- Keep all review fixes isolated to the export copy and retain no review history, result hashes, or article content.
- Roll back the newly claimed export directory after cancellation, review failure, invalid fixes, or filesystem errors.

### Refactor

- Split the export workflow, AI client, review fixes, review UI, and metadata cleaner into independently testable modules.
- Keep AI review globally enabled by default and retain local metadata cleaning when review is disabled.
- Move word-replacement controls above AI settings and consolidate their layout into one maintainable settings group.

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
