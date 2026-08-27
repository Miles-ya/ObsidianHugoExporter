# Obsidian Hugo Exporter

Exports notes and images from your vault to a [Hugo](https://gohugo.io/) site using Hugo's [Page Bundles](https://gohugo.io/content-management/page-bundles/) structure.

Requires Obsidian 1.13.0 or later.

---

## Features

-   **One-click Export**: Export the current note to your Hugo project with a single click.
-   **Page Bundle Structure**: Automatically creates a Page Bundle for each exported note (e.g., `content/posts/my-note/index.md`).
-   **Frontmatter Processing**: Processes YAML frontmatter, adding required Hugo fields like `title`, `date`, and `draft` while preserving your own metadata.
-   **Link Conversion**: Converts Obsidian `[[wikilinks]]` to Hugo-friendly relative links and local image embeds to standard Markdown image links.
-   **Image Handling**: Copies local images into the Page Bundle and gives them stable SHA-256-based names to avoid filename conflicts.
-   **Local Metadata Cleaning**: Removes privacy metadata from referenced JPEG, PNG, WebP, GIF, and SVG images before hashing and copying, while preserving orientation and color profiles. BMP files are copied unchanged.
-   **AI Publishing Review**: Reviews the current article's final Markdown for sensitive topics, personally identifiable information, and location data using a configurable OpenAI-compatible service.
-   **Review Before Export**: Sorts important findings first, follows Obsidian's interface language, and presents editable AI suggestions in a compact review table.
-   **Copy-only Fixes**: Applies only the suggestions explicitly marked **Replace**; ignored or untouched findings preserve the original text, and the source note is never changed.
-   **Daily Note Names**: Removes a valid leading `YYYY-MM-DD ` date from the exported directory and default title.
-   **Word Replacements**: Applies configurable, ordered text replacement rules during export.
-   **Conflict-safe Export**: Creates `title1`, `title2`, and so on when an export directory already exists, without overwriting old content.
-   **Validated Paths**: Requires an absolute Hugo project path and keeps the relative content path inside that project.
-   **Failure-safe Writes**: Publishes `index.md` only after all assets are ready and removes an incomplete export after a normal filesystem error.

## How to Use

1.  **Installation**: Install the plugin from the Obsidian Community Plugins browser.
2.  **Configuration**:
    -   Open the plugin settings for "Obsidian Hugo Exporter".
    -   Set the **Hugo Path**: This is the absolute path to the root directory of your Hugo project.
    -   Set the **Content Path**: This must be a relative path within your Hugo project. The default is `content/posts`; absolute paths and paths containing `..` that escape the project are rejected.
    -   Add any **Word Replacements** you want to apply to exported body text, titles, directory names, and string frontmatter values.
    -   AI review is enabled by default. Configure an OpenAI-compatible **API Base URL** and **Model**, plus an API key from Obsidian **SecretStorage** when the service requires one. Use **Test Connection** to verify the configuration without sending a note.
    -   The plugin uses the OpenAI Chat Completions request format. Official OpenAI endpoints use JSON Schema when available; DeepSeek, compatible gateways, Ollama, LM Studio, and similar services automatically use or fall back to simpler JSON response modes.
    -   Review output follows Obsidian's current interface language. Invalid structured responses are parsed conservatively and retried once before the export reports an error.
    -   To restore direct export, turn off **Enable AI Review** and confirm once. Image metadata cleaning remains active.
    -   **Permalink Configuration**: Additionally, ensure that in your `hugo.toml` file, you change `[permalinks] posts = "/posts/:year/:month/:title/"` to `[permalinks] posts = "/posts/:title/"`.
3.  **Exporting**:
    -   Open the note you want to export.
    -   Click the "Publish to Hugo" (send icon) button in the left ribbon.
    -   The plugin prepares the final export copy, cleans image metadata locally, and reviews the final Markdown when AI review is enabled. When findings exist, select **Replace** for each suggestion you want applied, edit the suggested text if needed, then select **Export**. Findings left untouched or marked **Ignore** preserve the original text.

## How it Works

When you export a file, the plugin performs the following actions:

-   **Frontmatter**: It reads the note's frontmatter. It ensures `title` (defaults to the filename), `date` (defaults to the file's modification time), and `draft: false` are present. Any existing frontmatter you have (like `tags` or `categories`) is preserved.
-   **Link Conversion**:
    -   `[[My Other Note]]` is converted to `[My Other Note](../My%20Other%20Note/)`.
    -   `![[my-image.png]]` is converted to a standard Markdown image link such as `![](a3f29c8d92e1b472.png)`.
-   **Safe Output Names**: A note named `2025-11-23 My Note.md` exports as `My Note`. If that directory exists, the plugin creates `My Note1` and updates the exported title to match.
-   **File Structure**: For a note named `My Awesome Note.md`, the plugin creates the following structure in your Hugo project, which is known as a Page Bundle:
    ```
    hugo-project/
    └── content/
        └── posts/
            └── My Awesome Note/
                ├── index.md
                └── a3f29c8d92e1b472.png
    ```

## License

MIT

## File access and privacy

Hugo Exporter is a desktop-only plugin because exporting requires access to a Hugo project outside the Obsidian vault.

- It reads only the active note and local image files referenced by that note through the Obsidian Vault API. It never scans Git or the rest of the vault for review purposes.
- It writes the generated `index.md` and copied images only to the Hugo project directory configured in the plugin settings.
- When AI review is enabled, it sends the complete final Markdown for the current export to the OpenAI-compatible endpoint configured by the user. It never sends image bytes, image metadata, or the Obsidian source file.
- API keys are referenced through Obsidian SecretStorage and are not stored in the plugin's `data.json`. A key may be omitted for local services that do not require authentication.
- It does not collect analytics and does not retain review results, content hashes, article content, or review history. The configured provider's own retention, privacy, and billing policies still apply.
- Review suggestions marked **Replace** affect only the export copy. Editing a suggestion does not apply it by itself, and the source note is never modified.
- Image metadata cleaning runs locally even when AI review is disabled. If cleaning fails, the original image is retained only after a prominent warning and explicit confirmation.
- Existing export directories are never overwritten or deleted. If a directory already exists, a numbered directory is created instead. A new directory created by a failed export is removed automatically.

## Release provenance

Official release assets are built by GitHub Actions from the tagged source and include GitHub artifact attestations. This allows users to verify that `main.js`, `manifest.json`, and `styles.css` came from this repository's release workflow.
