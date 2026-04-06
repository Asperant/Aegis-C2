# Screenshot and Demo Media Guide

Use this folder for all README media used on the GitHub homepage.

## Recommended File Names

- `01-login.png`
- `02-analytics-dashboard.png`
- `03-command-terminal.png`
- `04-tactical-map-hud.png`
- `demo.gif` (optional short animated walkthrough)

## Capture Guidelines

- Prefer `PNG` for static UI screenshots.
- Use width around `1400-1800px` for clear GitHub rendering.
- Keep language, theme, and sample data consistent across screenshots.
- Remove or blur secrets, real credentials, and sensitive identifiers.

## How to Add Images to README

1. Place image in `docs/screenshots/`.
2. Commit the image file.
3. Reference it with a relative path in `README.md`.

Example:

```md
![Login Screen](docs/screenshots/01-login.png)
```

Centered and width-controlled example:

```html
<p align="center">
  <img src="docs/screenshots/02-analytics-dashboard.png" alt="Aegis dashboard" width="1000" />
</p>
```

## GIF and Video Notes

- GIF works directly in Markdown:

```md
![Demo](docs/screenshots/demo.gif)
```

- For long demos, prefer linking to an external video page (YouTube, Vimeo, etc.) to keep repo size reasonable.
