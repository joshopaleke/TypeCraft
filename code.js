// ============================================================
// TypeCraft code.js (Figma plugin main thread)
//
// All scale maths lives in ui.html so the preview, the code export and
// the generated styles always match. This file only:
//   1. sends the installed fonts + saved settings to the UI
//   2. creates or updates text styles from the list the UI sends
//   3. draws an optional documentation frame on the canvas
// ============================================================

figma.showUI(__html__, { width: 440, height: 700, themeColors: true });

const SETTINGS_KEY = "typecraft-settings-v2";
const DOC_MARKER = "typecraft-doc";

// ---------- Startup: fonts + saved settings ----------
async function sendInit() {
    let fonts = {};
    try {
        const list = await figma.listAvailableFontsAsync();
        for (const f of list) {
            const fam = f.fontName.family;
            if (!fonts[fam]) fonts[fam] = [];
            fonts[fam].push(f.fontName.style);
        }
    } catch (_err) {
        fonts = { Inter: ["Regular", "Medium", "Semi Bold", "Bold"] };
    }

    let settings = null;
    try {
        settings = await figma.clientStorage.getAsync(SETTINGS_KEY);
    } catch (_err) {
        settings = null;
    }

    figma.ui.postMessage({ type: "init", fonts, settings });
}

// ---------- Font loading with graceful fallbacks ----------
// fontCache is per-run ("family|style" -> Promise<FontName>) so each run reports its own warnings.
function loadFontSafe(family, style, warnings, fontCache) {
    const key = family + "|" + style;
    if (!fontCache.has(key)) {
        fontCache.set(key, (async () => {
            const candidates = [
                { family, style },
                { family, style: "Regular" },
                { family: "Inter", style: "Regular" },
            ];
            for (const font of candidates) {
                try {
                    await figma.loadFontAsync(font);
                    if (font.family !== family || font.style !== style) {
                        warnings.push(`${family} ${style} → ${font.family} ${font.style}`);
                    }
                    return font;
                } catch (_err) {
                    // try next candidate
                }
            }
            throw new Error(`Couldn't load ${family} ${style}`);
        })());
    }
    return fontCache.get(key);
}

// ---------- Variables with a mode per screen ----------
// Variable names can't contain "." "{" or "}".
const varName = (name) => name.replace(/[.{}]/g, "-");

async function setupVariables(styles, options) {
    const platforms = options.platforms;
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    let collection = collections.find((c) => c.name === options.collectionName);
    const isNew = !collection;
    if (isNew) collection = figma.variables.createVariableCollection(options.collectionName);

    // Find or create one mode per screen. A brand-new collection starts with
    // a single "Mode 1", which we rename to the first screen.
    const modeIds = {};
    const untouchedDefault = collection.modes.length === 1 && collection.modes[0].name === "Mode 1";
    if (isNew || untouchedDefault) {
        collection.renameMode(collection.modes[0].modeId, platforms[0]);
    }
    for (const p of platforms) {
        const existing = collection.modes.find((m) => m.name === p);
        if (existing) {
            modeIds[p] = existing.modeId;
            continue;
        }
        try {
            modeIds[p] = collection.addMode(p);
        } catch (_err) {
            if (isNew) collection.remove();
            throw new Error(
                `Couldn't add a "${p}" mode to the "${options.collectionName}" collection. ` +
                "Your Figma plan may limit modes per collection: turn off some screens or choose \"Styles per screen\"."
            );
        }
    }

    const existingVars = (await figma.variables.getLocalVariablesAsync("FLOAT"))
        .filter((v) => v.variableCollectionId === collection.id);
    const byName = new Map(existingVars.map((v) => [v.name, v]));
    let createdVars = 0;

    function upsert(name, scopes, codeSyntax, valueFor) {
        let v = byName.get(name);
        if (!v) {
            v = figma.variables.createVariable(name, collection, "FLOAT");
            byName.set(name, v);
            createdVars++;
        }
        v.scopes = scopes;
        v.setVariableCodeSyntax("WEB", codeSyntax);
        for (const p of platforms) v.setValueForMode(modeIds[p], valueFor(p));
        return v;
    }

    const bindings = new Map(); // style name -> { fontSize, lineHeight }
    for (const s of styles) {
        const base = varName(s.name);
        const fontSize = upsert(`${base}/font-size`, ["FONT_SIZE"], `var(${s.cssToken}-size)`, (p) => s.values[p].fontSize);
        const lineHeight = options.bindLineHeight
            ? upsert(`${base}/line-height`, ["LINE_HEIGHT"], `var(${s.cssToken}-line-height)`, (p) => s.values[p].lineHeightPx)
            : null;
        bindings.set(s.name, { fontSize, lineHeight });
    }

    return { collection, modeIds, bindings, createdVars, totalVars: bindings.size * (options.bindLineHeight ? 2 : 1) };
}

// ---------- Create / update text styles ----------
async function applyStyles(styles, options, warnings, vars) {
    const byName = new Map();
    if (options.updateExisting) {
        const existing = await figma.getLocalTextStylesAsync();
        for (const s of existing) byName.set(s.name, s);
    }

    const fontCache = new Map();
    let created = 0;
    let updated = 0;
    const results = [];

    for (const s of styles) {
        const font = await loadFontSafe(s.family, s.style, warnings, fontCache);

        let textStyle = byName.get(s.name);
        if (textStyle) {
            // The style's current font must be loaded before it can be edited.
            try {
                await figma.loadFontAsync(textStyle.fontName);
            } catch (_err) {
                // Missing font: setting fontName below still replaces it.
            }
            updated++;
        } else {
            textStyle = figma.createTextStyle();
            textStyle.name = s.name;
            byName.set(s.name, textStyle);
            created++;
        }

        textStyle.fontName = font;
        textStyle.fontSize = s.fontSize;
        textStyle.lineHeight = s.lineHeight;
        textStyle.letterSpacing = s.letterSpacing;

        const bound = textStyle.boundVariables || {};
        const binding = vars ? vars.bindings.get(s.name) : null;
        if (binding) {
            textStyle.setBoundVariable("fontSize", binding.fontSize);
            if (binding.lineHeight) textStyle.setBoundVariable("lineHeight", binding.lineHeight);
            else if (bound.lineHeight) textStyle.setBoundVariable("lineHeight", null);
            const sizes = options.platforms.map((p) => `${p} ${s.values[p].fontSize}px`).join(", ");
            textStyle.description = `${sizes}. Sizes come from the "${options.collectionName}" variables. Generated by TypeCraft`;
        } else {
            // Re-running in "styles per screen" mode: drop bindings from an earlier variables run.
            if (bound.fontSize) textStyle.setBoundVariable("fontSize", null);
            if (bound.lineHeight) textStyle.setBoundVariable("lineHeight", null);
            textStyle.description = `${s.fontSize}px / ${s.lineHeight.unit === "PIXELS" ? s.lineHeight.value + "px" : s.lineHeight.value + "%"}, generated by TypeCraft`;
        }

        results.push(Object.assign({}, s, { font, styleId: textStyle.id }));
    }

    return { created, updated, results };
}

// ---------- Documentation frame ----------
function makeAutoLayout(name, direction, spacing) {
    const f = figma.createFrame();
    f.name = name;
    f.layoutMode = direction;
    f.primaryAxisSizingMode = "AUTO";
    f.counterAxisSizingMode = "AUTO";
    f.itemSpacing = spacing;
    f.fills = [];
    return f;
}

function makeLabel(text, size, style, gray) {
    const t = figma.createText();
    t.fontName = { family: "Inter", style };
    t.fontSize = size;
    t.characters = text;
    t.fills = [{ type: "SOLID", color: { r: gray, g: gray, b: gray } }];
    return t;
}

async function createDocFrame(results, sampleText, vars) {
    await Promise.all([
        figma.loadFontAsync({ family: "Inter", style: "Bold" }),
        figma.loadFontAsync({ family: "Inter", style: "Regular" }),
    ]);

    // Replace a frame from a previous run instead of piling up copies.
    let position = null;
    for (const node of figma.currentPage.children) {
        if (node.getPluginData(DOC_MARKER) === "1") {
            if (!position) position = { x: node.x, y: node.y };
            node.remove();
        }
    }

    const frame = makeAutoLayout("Typography System", "VERTICAL", 48);
    frame.setPluginData(DOC_MARKER, "1");
    frame.paddingTop = frame.paddingBottom = frame.paddingLeft = frame.paddingRight = 56;
    frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    frame.cornerRadius = 8;
    frame.appendChild(makeLabel("Typography System", 28, "Bold", 0.1));

    const platforms = [];
    for (const r of results) if (platforms.indexOf(r.platform) === -1) platforms.push(r.platform);

    for (const platform of platforms) {
        const section = makeAutoLayout(platform, "VERTICAL", 24);
        if (vars) {
            // Same styles in every section; the section's variable mode sets the sizes.
            section.setExplicitVariableModeForCollection(vars.collection, vars.modeIds[platform]);
        }
        section.appendChild(makeLabel(vars ? `${platform} mode` : `${platform} styles`, 16, "Bold", 0.35));

        const platformStyles = results.filter((r) => r.platform === platform);
        const categories = [];
        for (const r of platformStyles) if (categories.indexOf(r.category) === -1) categories.push(r.category);

        for (const category of categories) {
            const group = makeAutoLayout(category, "VERTICAL", 0);
            group.appendChild(makeLabel(category.toUpperCase(), 11, "Bold", 0.6));

            for (const s of platformStyles.filter((r) => r.category === category)) {
                const row = makeAutoLayout(s.shortName, "HORIZONTAL", 32);
                row.counterAxisAlignItems = "CENTER";
                row.paddingTop = row.paddingBottom = 16;

                const sample = figma.createText();
                sample.fontName = s.font;
                sample.characters = s.role === "mono" ? "const size = scale(step);" : sampleText;
                await sample.setTextStyleIdAsync(s.styleId); // linked, so edits to the style show up here

                const meta = makeLabel(
                    `${s.name}\n${s.font.family} ${s.font.style}  •  ${s.fontSize}px / ${s.lineHeightPx}px` +
                    (s.letterSpacing.value ? `  •  ${s.letterSpacing.value}%` : ""),
                    11, "Regular", 0.5
                );
                meta.lineHeight = { value: 160, unit: "PERCENT" };

                row.appendChild(sample);
                row.appendChild(meta);
                group.appendChild(row);

                const divider = figma.createRectangle();
                divider.name = "Divider";
                divider.resize(100, 1);
                divider.fills = [{ type: "SOLID", color: { r: 0.92, g: 0.92, b: 0.92 } }];
                group.appendChild(divider);
                divider.layoutAlign = "STRETCH";
            }
            section.appendChild(group);
        }
        frame.appendChild(section);
    }

    figma.currentPage.appendChild(frame);

    if (position) {
        frame.x = position.x;
        frame.y = position.y;
    } else {
        // Place it to the right of everything on the page so nothing overlaps.
        let maxX = null;
        let minY = null;
        for (const node of figma.currentPage.children) {
            if (node === frame) continue;
            maxX = Math.max(maxX === null ? -Infinity : maxX, node.x + node.width);
            minY = Math.min(minY === null ? Infinity : minY, node.y);
        }
        frame.x = maxX === null ? Math.round(figma.viewport.center.x - frame.width / 2) : Math.round(maxX + 200);
        frame.y = minY === null ? Math.round(figma.viewport.center.y - frame.height / 2) : Math.round(minY);
    }

    return frame;
}

// ---------- Message handling ----------
figma.ui.onmessage = async (msg) => {
    if (msg.type === "ready") {
        await sendInit();
        return;
    }

    if (msg.type === "save-settings") {
        try {
            await figma.clientStorage.setAsync(SETTINGS_KEY, msg.settings);
        } catch (_err) {
            // Settings are a convenience; never fail on them.
        }
        return;
    }

    if (msg.type === "generate") {
        const warnings = [];
        try {
            const useVars = msg.options.responsive === "variables";
            const vars = useVars ? await setupVariables(msg.styles, msg.options) : null;
            const { created, updated, results } = await applyStyles(msg.styles, msg.options, warnings, vars);

            if (msg.options.docFrame) {
                // In variables mode, show every style once per mode with that mode's sizes.
                const docResults = useVars
                    ? msg.options.platforms.reduce((all, p) => all.concat(results.map((r) => Object.assign({}, r, {
                        platform: p,
                        fontSize: r.values[p].fontSize,
                        lineHeightPx: r.values[p].lineHeightPx,
                    }))), [])
                    : results;
                const frame = await createDocFrame(docResults, msg.options.sampleText, vars);
                figma.viewport.scrollAndZoomIntoView([frame]);
            }

            const uniqueWarnings = Array.from(new Set(warnings));
            const variables = vars ? {
                collection: msg.options.collectionName,
                modes: msg.options.platforms.length,
                created: vars.createdVars,
                total: vars.totalVars,
            } : null;
            figma.ui.postMessage({ type: "generate-done", created, updated, warnings: uniqueWarnings, variables });

            const parts = [];
            if (created) parts.push(`created ${created}`);
            if (updated) parts.push(`updated ${updated}`);
            let note = `TypeCraft: ${parts.join(", ")} text styles`;
            if (variables) note += ` + ${variables.total} variables (${variables.modes} modes)`;
            figma.notify(note);
        } catch (err) {
            const message = err && err.message ? err.message : String(err);
            figma.ui.postMessage({ type: "generate-error", message });
            figma.notify("Something went wrong: " + message, { error: true });
        }
        return;
    }

    if (msg.type === "close") {
        figma.closePlugin();
    }
};
