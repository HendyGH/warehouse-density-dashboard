# App icon

The app uses a navy warehouse silhouette with white and teal inventory blocks. The master asset is `src/assets/warehouse-icon.png`; Windows bundle assets are `src-tauri/icons/icon.ico` and `src-tauri/icons/icon.png`.

Generated with the built-in image generation tool, then converted into app formats with:

```sh
npm run tauri -- icon src/assets/warehouse-icon.png --output src-tauri/icons
```

Generation prompt:

> Create one polished Windows desktop application icon for Warehouse Dashboard. Square 1024x1024 PNG. A bold simple white warehouse roof and frame enclosing three stacked inventory blocks forming a rising density chart, two white blocks and one bright teal block. Deep navy rounded square background, subtle restrained depth, crisp geometric silhouette, generous padding, strong legibility at 32 pixels. No words, no letters, no numbers, no watermark, no extra objects. This is a finished app icon asset, not a presentation or mockup.
