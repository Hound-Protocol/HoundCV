# HoundCV – Product spec (draft 1)

A Hound Protocol tool. **Free to create and export. No account required, no watermark, no paywalled export.**

## Principles
- Simple by default, powerful when needed. Two modes over one shared CV document.
- User owns their content. Browser-local save plus JSON backup and restore.
- Automate, but never fabricate: suggestions only reword, never invent jobs, dates or metrics.
- Beautiful and ATS-readable: reading order and extracted text are testable.
- Sponsor strip only outside the editor and the CV. Never in exports.

## Screens
1. **Landing:** one "Start building" button, "Log into HoundCV" top right, sponsor strip at the bottom.
2. **Mode choice:** Simple or Advanced.
3. **Simple mode:** guided form + live preview. The editor fills in layout, type and spacing.
4. **Advanced mode:** block designer (below).
5. **Export:** preview, PDF, PNG, plain ATS PDF, JSON backup.

## Login (optional)
Core use needs no account. Login only adds sync and multiple saved CVs.
Providers: Google, GitHub, Discord, Microsoft, Apple, LinkedIn, email magic link, passkeys.
Implementation: a hosted auth service, added after the editor works.

## Advanced mode
- Page measured in millimetres, visible grid (default 5 mm), snap to grid, edges and centres, with guides.
- Blocks are dragged from a toolbox onto the page; resize handles snap too.
- **Right-click a block:** change type, frame style (none, thin, bracket, panel, ...), duplicate, delete, lock, layer order.
- **Block types:** Profile/header, Contact, Summary, Experience, Education, Skills, Projects, Certifications, Languages, Custom text; decorative: Line, Divider, Shape, Image, Frame.
- **Document panel (right):** background, outer frame, safe zone (guide + warning), corner details (date, page number, initials), page size, margins.
- **Reading order:** each block has an order (auto top-to-bottom, left-to-right, user override). Exports use this order, not screen position.
- Decorative blocks are flagged; the plain export removes them.

## Data model
`{ version, profile, sections[], blocks[{id,type,x,y,w,h,order,frame,style,content}], page{size,margins,background,frame,safeZone,corners}, theme }`
The CV is stored as structured data, never only as rendered HTML. Mode switching never forks the document.

## Export
| Format | Notes |
|---|---|
| PDF (primary) | Vector graphics + real selectable text. Decorations are a background layer under real text. Avoid blur/blend effects in skins (flattened by PDF). |
| PNG | 2–3x raster of the page. Exact look, not for applications. |
| Plain PDF | Decorative layer removed, conservative layout, ATS-friendly. |
| JSON | Backup and restore. |
| SVG | Later. Text needs embedded fonts or outlines. |

Never claim universal ATS compatibility. Provide a text-extraction preview and explainable warnings.

## Hound Helper
A floating smiley that flies around, points with a hand at the thing being explained, and offers a chat window. A small demo window attached to him shows a looping GIF of the task (for example "how to change a block's frame"). Topics are data in `assets/helper.js`; add `demo: "assets/demos/<name>.gif"` to a topic. Later: connect an optional AI backend for free-form questions (must disclose what leaves the browser).

## Look
High-tech, modern, sleek, sharp. Dark interface, teal signal accent, angled corners, smooth transitions, responsive. Everything animates except the CV document itself. `prefers-reduced-motion` is respected. The MGS-inspired skin is to be renamed to an original name before launch.

## Skins (CV)
Field Olive (renamed MGS), Brushed Aluminium, plain light ATS skin.

## Phases
1. **Foundation:** document model, autosave, undo/redo, Simple mode, PDF export without clipping.
2. **Advanced mode:** block engine, snapping, context menu, document panel.
3. **Automation:** import PDF/DOCX/text, writing suggestions, job-description comparison, layout repair.
4. **ATS + export validation:** text-extraction preview, DOCX, SVG.
5. **Accounts:** optional login and sync.

## Open decisions
- Framework for the editor (proposal: Svelte + Vite).
- PDF generation: browser print for Phase 1; headless Chromium later for exact output.
- Languages beyond English.
- GDPR review before ads or analytics go live.
