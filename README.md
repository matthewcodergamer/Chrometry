# Chrometry

Chrometry is a browser-first **game palette / colorimetry analyzer**. Give it a screenshot from a game and it extracts a perceptually clustered palette, estimates useful scene roles, and exports colors ready for CSS or Three.js.

## Features

- Runs directly in the browser — no build step required.
- Local screenshot analysis using **CIELAB** color-space k-means clustering.
- Dominant color coverage percentages.
- Heuristic scene roles for sky, vegetation/grass, terrain, light, shadow, water, neutrals, and accents.
- Tap any pixel in the screenshot to sample its exact HEX/RGB value.
- Export as JSON, CSS custom properties, or a Three.js palette snippet.
- Optional AI Vision through Puter.js to identify the scene/game and semantically map measured colors.
- Responsive iPhone UI, dark mode, installable PWA, offline shell caching.

## GitHub Pages

This repository is intentionally static. GitHub Pages can deploy it directly from the root or through the included Pages workflow.

Expected site URL:

`https://matthewcodergamer.github.io/Chrometry/`

If Pages has never been enabled for this repository, open **Settings → Pages → Build and deployment → Source → GitHub Actions** once. After that, pushes to `main` deploy automatically.

## Privacy

Normal palette extraction happens locally in the browser. The screenshot is only sent to an external AI service if the user presses **Analyze scene with AI**.

## AI

The optional AI feature loads Puter.js and uses its user-pays AI API, so this repo contains no developer API key. The local color engine does not depend on Puter or AI.
