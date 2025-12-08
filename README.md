# Obsidian Hugo Exporter

An Obsidian plugin to export notes to a [Hugo](https://gohugo.io/) static site generator, designed to work with Hugo's [Page Bundles](https://gohugo.io/content-management/page-bundles/) structure.

---

## Features

-   **One-click Export**: Export the current note to your Hugo project with a single click.
-   **Page Bundle Structure**: Automatically creates a Page Bundle for each exported note (e.g., `content/posts/my-note/index.md`).
-   **Frontmatter Processing**: Processes YAML frontmatter, adding required Hugo fields like `title`, `date`, and `draft` while preserving your own metadata.
-   **Link Conversion**: Converts Obsidian `[[wikilinks]]` to Hugo-friendly relative links and `![[image.png]]` embeds to standard Markdown image links.
-   **Image Handling**: Automatically copies linked images from your vault to the note's corresponding Page Bundle directory.
-   **Configurable Paths**: Allows you to set the path to your Hugo project and the content directory.

## How to Use

1.  **Installation**: Install the plugin from the Obsidian Community Plugins browser.
2.  **Configuration**:
    -   Open the plugin settings for "Obsidian Hugo Exporter".
    -   Set the **Hugo Path**: This is the absolute path to the root directory of your Hugo project.
    -   Set the **Content Path**: This is the path within your Hugo project where you want your posts to be saved. The default is `content/posts`.
    -   **Permalink Configuration**: Additionally, ensure that in your `hugo.toml` file, you change `[permalinks] posts = "/posts/:year/:month/:title/"` to `[permalinks] posts = "/posts/:title/"`.
3.  **Exporting**:
    -   Open the note you want to export.
    -   Click the "Publish to Hugo" (send icon) button in the left ribbon.
    -   The plugin will process the note and images, then save them to your Hugo directory. A notification will appear upon success or failure.

## How it Works

When you export a file, the plugin performs the following actions:

-   **Frontmatter**: It reads the note's frontmatter. It ensures `title` (defaults to the filename), `date` (defaults to the file's modification time), and `draft: false` are present. Any existing frontmatter you have (like `tags` or `categories`) is preserved.
-   **Link Conversion**:
    -   `[[My Other Note]]` is converted to `[My Other Note](../my-other-note/)`.
    -   `![[my-image.png]]` is converted to `![my-image.png](my-image.png)`.
-   **File Structure**: For a note named `My Awesome Note.md`, the plugin creates the following structure in your Hugo project, which is known as a Page Bundle:
    ```
    hugo-project/
    └── content/
        └── posts/
            └── my-awesome-note/
                ├── index.md
                └── my-image.png
    ```

## License

MIT