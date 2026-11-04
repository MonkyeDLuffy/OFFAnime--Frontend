# OFFANIME font files

## Fornire Light — heading typeface (active)

Used for **ALL headings and titles** across OFFANIME: page titles, section
headings, anime/movie titles used as headings, card titles, detail/watch
headings, empty- and error-state headings.

- **Typeface:** Fornire by Jehoo Creative (Anwar Patihan), 2021 — editorial
  Didone/minimal serif typeface ("MINIMAL · SERIF · TYPEFACE", personal-use
  reference, published on DaFont / MyFonts).
- **Version / weight:** single free weight — Fornire Light
  (`usWeightClass: 300`, shipped exactly as cut). No other weights ship with
  the free release; requesting 400+/bold would trigger synthetic bolding, so
  heading text resolves to 300 only. The full Light/Regular/Medium/Bold family
  is a commercial upgrade from the author.
- **Files:** `Fornire-Light.woff2` (~52 KB, web-optimised) and
  `Fornire-Light.otf` (~300 KB fallback).
- **Source:** author-distributed free package on DaFont
  (https://www.dafont.com/fornire.font, "100% Free" category — free including
  commercial use), linked from the author's MyFonts page
  https://www.myfonts.com/fonts/jehoo-creative/fornire/light.
- **License (free weight):** `Free License Agreement, Jehoo Creative`. The
  weight is free to use; do not **resell, redistribute or alter** the font
  files without the consent of Jehoo Creative. These files live in
  `public/fonts/` only as the project's own web assets; they are NOT
  redistributed apart from the site itself.

## Glyph coverage

Fornire Light covers 445 glyphs (A–Z, digits, common punctuation, accented
Latin). Verified missing: middle dot `·` (U+00B7) and star `★` (U+2605) —
those characters never appear inside headings (body copy keeps Inter and
falls back gracefully), so they never render from the heading stack.

## Usage

Registered in `src/app/globals.css` via `@font-face` under the family name
**"Fornire"** at weight **300 only**.

Consumers reference it through the `--font-heading` theme token plus the
shared classes `.type-display` and `.type-heading` (family + weight pinned to
300) in globals.css.

## Body type (unchanged)

Ordinary text — descriptions, metadata, labels, buttons, controls, inputs,
forms — stays in the original Inter sans stack (`--font-body` / `--font-sans`
via `next/font`).

## Historical note — Aalto Display (removed)

`AaltoDisplay.woff2` / `AaltoDisplay.ttf` remain in this folder but are no
longer referenced anywhere in the project. The previous free cut was a
personal-use redistributed mirror release; for any future commercial use of
Aalto, purchase the web licence from https://www.iframefonts.com and
re-register it here if the heading face ever changes back.
