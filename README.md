# TypeCraft

TypeCraft is a Figma plugin that allows you to instantly build a full, ready-to-use text style system tailored to your design needs. Pick your desired fonts and target screen sizes, and TypeCraft will generate standard, labeled text styles right inside your Figma file.

## Features

- **Font Selection**: Pick separate fonts for your Headings and Body text.
- **Screen Size Optimization**: Generate typography styles tailored for **Mobile**, **Desktop**, or **Both**.
- **Automated Text Styles**: If you select "Both", TypeCraft automatically creates distinct, clearly labeled text styles (e.g., `Mobile/Heading 1`, `Desktop/Heading 1`) allowing you to design responsively with ease.

## How to Use

1. Open a Figma document and run the **TypeCraft** plugin.
2. Select your desired **Heading font** and **Body font** from the dropdowns.
3. Choose your target **Screen size** (Mobile, Desktop, or Both).
4. Click **Generate Typography System**.
5. Your new typography styles will immediately become available in your Figma file's local text styles!

## Development

This plugin template uses TypeScript and NPM. To modify or build the plugin locally:

1. Make sure you have [Node.js](https://nodejs.org/) installed.
2. Clone or download this repository.
3. Install dependencies by running:
   ```bash
   npm install
   ```
4. Compile the TypeScript files into JavaScript:
   ```bash
   npm run build
   ```
   *To automatically rebuild as you make changes, run `npm run watch`.*

### Setting up in Figma
1. Open the Figma desktop app.
2. Go to **Plugins** > **Development** > **Import plugin from manifest...**
3. Select the `manifest.json` file in this directory.
4. You can now run the plugin locally and test your changes!
