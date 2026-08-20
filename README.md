# Obsidian Hugo Exporter

Exports notes and images from your vault to a [Hugo](https://gohugo.io/) site using Hugo's [Page Bundles](https://gohugo.io/content-management/page-bundles/) structure.

---

## Features

-   **One-click Export**: Export the current note to your Hugo project with a single click.
-   **Page Bundle Structure**: Automatically creates a Page Bundle for each exported note (e.g., `content/posts/my-note/index.md`).
-   **Frontmatter Processing**: Processes YAML frontmatter, adding required Hugo fields like `title`, `date`, and `draft` while preserving your own metadata.
-   **Link Conversion**: Converts Obsidian `[[wikilinks]]` to Hugo-friendly relative links and local image embeds to standard Markdown image links.
-   **Image Handling**: Copies local images into the Page Bundle and gives them stable SHA-256-based names to avoid filename conflicts.
-   **Daily Note Names**: Removes a valid leading `YYYY-MM-DD ` date from the exported directory and default title.
-   **Word Replacements**: Applies configurable, ordered text replacement rules during export.
-   **Conflict-safe Export**: Creates `title1`, `title2`, and so on when an export directory already exists, without overwriting old content.
-   **Configurable Paths**: Allows you to set the path to your Hugo project and the content directory.

## How to Use

1.  **Installation**: Install the plugin from the Obsidian Community Plugins browser.
2.  **Configuration**:
    -   Open the plugin settings for "Obsidian Hugo Exporter".
    -   Set the **Hugo Path**: This is the absolute path to the root directory of your Hugo project.
    -   Set the **Content Path**: This is the path within your Hugo project where you want your posts to be saved. The default is `content/posts`.
    -   Add any **Word Replacements** you want to apply to exported body text, titles, directory names, and string frontmatter values.
    -   **Permalink Configuration**: Additionally, ensure that in your `hugo.toml` file, you change `[permalinks] posts = "/posts/:year/:month/:title/"` to `[permalinks] posts = "/posts/:title/"`.
3.  **Exporting**:
    -   Open the note you want to export.
    -   Click the "Publish to Hugo" (send icon) button in the left ribbon.
    -   The plugin will process the note and images, then save them to your Hugo directory. A notification will appear upon success or failure.

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

- It reads only the active note and local image files referenced by that note through the Obsidian Vault API.
- It writes the generated `index.md` and copied images only to the Hugo project directory configured in the plugin settings.
- It does not make network requests, collect analytics, or transmit note contents, filenames, or settings.
- Export directories are never overwritten or deleted. If a directory already exists, a numbered directory is created instead.

## Release provenance

Official release assets are built by GitHub Actions from the tagged source and include GitHub artifact attestations. This allows users to verify that `main.js`, `manifest.json`, and `styles.css` came from this repository's release workflow.
