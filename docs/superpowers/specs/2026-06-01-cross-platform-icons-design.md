# Cross-Platform App Icons — Design Spec

**Date:** 2026-06-01
**Status:** Approved

## Problem

The app icon works on Windows but is missing or blank on Ubuntu and macOS shortcuts/launchers:

- **Linux (Ubuntu):** AppImage doesn't integrate with the system icon theme. Pinned GNOME shortcuts can't find `Icon=ai-pad` in the XDG theme because no multi-size PNG set is installed. `build/icons/` directory is absent.
- **macOS:** electron-builder requires `build/icon.icns`. Without it, the `.app` bundle falls back to the default Electron icon.
- **Windows:** Works because NSIS installer embeds the icon into Start Menu shortcuts directly.

## Approach

Node.js script (`scripts/generate-icons.mjs`) that reads the existing 1024×1024 source PNG and outputs all three platform-specific formats. Outputs are committed to `build/` so electron-builder picks them up automatically.

**Dependencies added to `apps/desktop/package.json` devDependencies:**
- `sharp` — image resizing (industry standard)
- `png-to-ico` — ICO encoder
- `icns-lib` — ICNS encoder

## Script

**Path:** `scripts/generate-icons.mjs`  
**Source:** `apps/desktop/build/icon.png` (1024×1024 PNG, already exists)  
**Invocation:** `pnpm icons` (workspace root) or `node scripts/generate-icons.mjs`

Paths are resolved relative to the repo root via `import.meta.url`. Exits non-zero with a clear message on any failure.

## Outputs

| File | Purpose | Sizes |
|------|---------|-------|
| `build/icons/16x16.png` … `1024x1024.png` | Linux AppImage + deb | 16, 32, 48, 64, 128, 256, 512, 1024 |
| `build/icon.ico` | Windows NSIS installer | 16, 24, 32, 48, 64, 128, 256 |
| `build/icon.icns` | macOS DMG | 16, 32, 64, 128, 256, 512, 1024 |

electron-builder auto-discovers all outputs via `buildResources: "build"` — no `electron-builder.json` changes needed for icon paths.

## electron-builder.json Changes

Add `"deb"` to the Linux targets so Ubuntu gets a properly integrated package (installs icons to `/usr/share/icons/`, creates a `.desktop` file) in addition to the AppImage:

```json
"linux": {
  "target": ["AppImage", "deb"],
  "category": "Development"
}
```

## Files Changed

| File | Action |
|------|--------|
| `scripts/generate-icons.mjs` | Create |
| `apps/desktop/build/icons/*.png` | Create (generated, committed) |
| `apps/desktop/build/icon.ico` | Create (generated, committed) |
| `apps/desktop/build/icon.icns` | Create (generated, committed) |
| `apps/desktop/build/generate-icon.ps1` | Delete (retired) |
| `apps/desktop/electron-builder.json` | Edit — add `"deb"` to linux targets |
| `apps/desktop/package.json` | Edit — add 3 devDeps |
| `package.json` (root) | Edit — add `"icons"` script |

## Workflow Going Forward

1. Designer updates `apps/desktop/build/icon.png`
2. Run `pnpm icons` from repo root
3. Commit updated `build/` assets
4. `scripts/build.ps1` / `build.sh` pick up new icons automatically on next platform build
