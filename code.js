// ============================================================
// TypeCraft code.js (Figma plugin main thread)
// ============================================================

figma.showUI(__html__, { width: 380, height: 580, themeColors: true });

// ---------- Font list for the UI dropdowns ----------
async function sendFontList() {
    try {
        const fonts = await figma.listAvailableFontsAsync();
        const families = Array.from(new Set(fonts.map((f) => f.fontName.family))).sort();
        figma.ui.postMessage({ type: "font-list", fonts: families });
    } catch (err) {
        // Fallback list in case listAvailableFontsAsync fails
        figma.ui.postMessage({
            type: "font-list",
            fonts: ["Inter", "Roboto", "Helvetica Neue", "Poppins", "Work Sans"],
        });
    }
}
sendFontList();

// ---------- Typography scale settings ----------
// A slightly gentler ratio for mobile keeps headings from feeling oversized
// on small screens; desktop gets a bit more room to breathe.
const SCALES = {
    mobile: { base: 16, ratio: 1.2 },
    desktop: { base: 16, ratio: 1.25 },
};

// step = how many "jumps" away from the 16px body size on the scale.
// Fractional steps (0.5, -0.5) just give us one extra size between
// body and the next full step, which is common in real type systems.
const STYLE_DEFS = [
    { name: "Display", step: 5, weight: "Bold", lineHeightPct: 110, category: "Heading" },
    { name: "H1", step: 4, weight: "Bold", lineHeightPct: 115, category: "Heading" },
    { name: "H2", step: 3, weight: "Bold", lineHeightPct: 120, category: "Heading" },
    { name: "H3", step: 2, weight: "SemiBold", lineHeightPct: 125, category: "Heading" },
    { name: "H4", step: 1, weight: "SemiBold", lineHeightPct: 130, category: "Heading" },
    { name: "Large", step: 0.5, weight: "Regular", lineHeightPct: 150, category: "Body" },
    { name: "Base", step: 0, weight: "Regular", lineHeightPct: 150, category: "Body" },
    { name: "Small", step: -0.5, weight: "Regular", lineHeightPct: 145, category: "Body" },
    { name: "Caption", step: -1, weight: "Regular", lineHeightPct: 140, category: "Body" },
];

function calcSize(base, ratio, step) {
    const size = base * Math.pow(ratio, step);
    return Math.round(size * 2) / 2; // round to nearest 0.5px for clean values
}

// Try the requested weight, then fall back gracefully so the plugin
// never crashes on a font that doesn't have every weight installed.
async function loadFontSafe(family, style) {
    try {
        await figma.loadFontAsync({ family, style });
        return { family, style };
    } catch (err) {
        try {
            await figma.loadFontAsync({ family, style: "Regular" });
            return { family, style: "Regular" };
        } catch (err2) {
            await figma.loadFontAsync({ family: "Inter", style: "Regular" });
            return { family: "Inter", style: "Regular" };
        }
    }
}

// ---------- Generate native Figma Text Styles ----------
async function generateStylesForPlatform(platform, headingFont, bodyFont) {
    const { base, ratio } = SCALES[platform];
    const platformLabel = platform === "mobile" ? "Mobile" : "Desktop";
    const results = [];

    for (const def of STYLE_DEFS) {
        const fontFamily = def.category === "Heading" ? headingFont : bodyFont;
        const loaded = await loadFontSafe(fontFamily, def.weight);
        const fontSize = calcSize(base, ratio, def.step);
        const lineHeightValue = Math.round(fontSize * (def.lineHeightPct / 100));

        const styleName = `${platformLabel}/${def.category}/${def.name}`;

        const textStyle = figma.createTextStyle();
        textStyle.name = styleName;
        textStyle.fontName = { family: loaded.family, style: loaded.style };
        textStyle.fontSize = fontSize;
        textStyle.lineHeight = { value: lineHeightValue, unit: "PIXELS" };

        results.push({
            name: styleName,
            shortName: def.name,
            family: loaded.family,
            weight: loaded.style,
            fontSize,
            lineHeight: lineHeightValue,
            category: def.category,
            platform: platformLabel,
        });
    }

    return results;
}

// ---------- Build the on-canvas documentation frame ----------
async function createDocFrame(allStyles, platforms) {
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });

    const frame = figma.createFrame();
    frame.name = "Typography System";
    frame.layoutMode = "VERTICAL";
    frame.primaryAxisSizingMode = "AUTO";
    frame.counterAxisSizingMode = "AUTO";
    frame.paddingTop = 56;
    frame.paddingBottom = 56;
    frame.paddingLeft = 56;
    frame.paddingRight = 56;
    frame.itemSpacing = 40;
    frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    frame.cornerRadius = 8;

    const title = figma.createText();
    title.fontName = { family: "Inter", style: "Bold" };
    title.characters = "Typography System";
    title.fontSize = 28;
    frame.appendChild(title);

    for (const platform of platforms) {
        const platformLabel = platform === "mobile" ? "Mobile" : "Desktop";

        const section = figma.createFrame();
        section.name = platformLabel;
        section.layoutMode = "VERTICAL";
        section.primaryAxisSizingMode = "AUTO";
        section.counterAxisSizingMode = "AUTO";
        section.itemSpacing = 20;
        section.fills = [];

        const sectionTitle = figma.createText();
        sectionTitle.fontName = { family: "Inter", style: "Bold" };
        sectionTitle.characters = `${platformLabel} Styles`;
        sectionTitle.fontSize = 16;
        sectionTitle.fills = [{ type: "SOLID", color: { r: 0.35, g: 0.35, b: 0.35 } }];
        section.appendChild(sectionTitle);

        const platformStyles = allStyles.filter((s) => s.platform === platformLabel);
        const categories = ["Heading", "Body"];

        for (const category of categories) {
            const categoryStyles = platformStyles.filter((s) => s.category === category);
            if (categoryStyles.length === 0) continue;

            const categoryGroup = figma.createFrame();
            categoryGroup.name = category;
            categoryGroup.layoutMode = "VERTICAL";
            categoryGroup.primaryAxisSizingMode = "AUTO";
            categoryGroup.counterAxisSizingMode = "AUTO";
            categoryGroup.itemSpacing = 4;
            categoryGroup.fills = [];

            const categoryLabel = figma.createText();
            categoryLabel.fontName = { family: "Inter", style: "Bold" };
            categoryLabel.characters = category;
            categoryLabel.fontSize = 11;
            categoryLabel.fills = [{ type: "SOLID", color: { r: 0.65, g: 0.65, b: 0.65 } }];
            categoryLabel.textAutoResize = "WIDTH_AND_HEIGHT";
            categoryGroup.appendChild(categoryLabel);

            for (const s of categoryStyles) {
                const row = figma.createFrame();
                row.name = s.shortName;
                row.layoutMode = "HORIZONTAL";
                row.primaryAxisSizingMode = "AUTO";
                row.counterAxisSizingMode = "AUTO";
                row.counterAxisAlignItems = "CENTER";
                row.itemSpacing = 32;
                row.paddingTop = 16;
                row.paddingBottom = 16;
                row.fills = [];

                // Sample text rendered in the actual generated style
                const sample = figma.createText();
                await figma.loadFontAsync({ family: s.family, style: s.weight });
                sample.fontName = { family: s.family, style: s.weight };
                sample.fontSize = s.fontSize;
                sample.lineHeight = { value: s.lineHeight, unit: "PIXELS" };
                sample.textAutoResize = "WIDTH_AND_HEIGHT";
                sample.characters = "The quick brown fox";

                // Metadata label: full style path, family, weight, size/line-height
                const meta = figma.createText();
                meta.fontName = { family: "Inter", style: "Regular" };
                meta.fontSize = 12;
                meta.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }];
                meta.textAutoResize = "WIDTH_AND_HEIGHT";
                meta.characters = `${s.name}  •  ${s.family} ${s.weight}  •  ${s.fontSize}px / ${s.lineHeight}px`;

                row.appendChild(sample);
                row.appendChild(meta);
                categoryGroup.appendChild(row);

                // Thin divider under each row
                const divider = figma.createRectangle();
                divider.resize(600, 1);
                divider.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
                categoryGroup.appendChild(divider);
            }

            section.appendChild(categoryGroup);
        }

        frame.appendChild(section);
    }

    figma.currentPage.appendChild(frame);
    frame.x = figma.viewport.center.x - frame.width / 2;
    frame.y = figma.viewport.center.y - frame.height / 2;

    return frame;
}

// ---------- Message handling ----------
figma.ui.onmessage = async (msg) => {
    if (msg.type === "get-fonts") {
        sendFontList();
        return;
    }

    if (msg.type === "generate") {
        const { headingFont, bodyFont, screenSize } = msg;

        try {
            const platforms = screenSize === "both" ? ["mobile", "desktop"] : [screenSize];
            let allStyles = [];

            for (const platform of platforms) {
                const styles = await generateStylesForPlatform(platform, headingFont, bodyFont);
                allStyles = allStyles.concat(styles);
            }

            const frame = await createDocFrame(allStyles, platforms);
            figma.viewport.scrollAndZoomIntoView([frame]);

            figma.ui.postMessage({ type: "generate-success", count: allStyles.length });
            figma.notify(`Created ${allStyles.length} text styles ✅`);
        } catch (err) {
            figma.ui.postMessage({ type: "generate-error", message: err.message });
            figma.notify("Something went wrong: " + err.message, { error: true });
        }
        return;
    }

    if (msg.type === "close") {
        figma.closePlugin();
    }
};