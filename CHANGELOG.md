# Changelog

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
