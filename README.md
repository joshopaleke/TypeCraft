# TypeCraft

TypeCraft is a Figma plugin that builds a complete, customizable typography system as native Figma text styles. Choose your fonts, tune a modular scale for each screen size, edit every style, preview the result and generate it. You can also export it as CSS or design tokens.

## Features

- **Searchable font pickers** for Headings, Body and an optional Code (monospace) font.
- **Per-screen scales**: turn on Mobile, Tablet and/or Desktop, each with its own base size and ratio (Minor Third, Golden Ratio, or any custom value).
- **Two ways to go responsive**:
  - *Styles per screen*: separate sets such as `Mobile/Heading/H1` and `Desktop/Heading/H1`.
  - *Variable modes*: one set of styles (`Heading/H1`) whose font size and line height are linked to number variables in a collection with a Mobile, Tablet and Desktop mode. Switch a frame's mode and all its text resizes. The variables carry CSS code syntax (`var(--text-heading-h1-size)`) that matches the export. Needs a paid Figma plan for more than one mode.
- **Fully editable styles**: rename, add or remove styles, and set each one's font role, scale step, weight, line height and letter spacing. Presets: Standard, Compact, Marketing.
- **Smart weight matching**: picks the closest real style in each font ("Semi Bold", "Demibold", "600"…) and flags any fallback.
- **Live preview** of every style before you generate.
- **Re-run safely**: existing styles with the same name are updated rather than duplicated, and the documentation frame is replaced in place.
- **Linked documentation frame**: its samples use the generated styles, so editing a style updates the frame.
- **Output options**: naming pattern (`{platform}/{category}/{name}`), size rounding (1px, 0.5px, even, 4px grid), pixel or percent line heights, 4px line-height snapping, and extra body weights (e.g. `Body/Base/Bold`).
- **Export as code**: CSS custom properties with responsive media queries, or W3C design-tokens JSON.
- **Remembers your settings** between runs, and follows Figma's light and dark theme.

## How to use

1. Open a Figma Design file and run **TypeCraft**.
2. Pick your fonts, turn on the screen sizes you need and adjust their scale.
3. Edit the style list or load a preset, then check the preview.
4. Click **Generate text styles**.

## Development

The plugin is plain JavaScript with no build step:

- `code.js` runs in Figma's plugin sandbox. It creates and updates styles and draws the documentation frame.
- `ui.html` contains the interface plus all the scale maths, preview and export logic.

To try it locally, open the Figma desktop app, go to **Plugins → Development → Import plugin from manifest…** and select `manifest.json`. Run `npm run check` for a quick syntax check of `code.js`.
