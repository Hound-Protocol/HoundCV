/* HoundCV core: document model, zone layout, rendering, checks, storage.
   The CV is structured data. Blocks live in ZONES (header, left column, right column, footer).
   A zone shares its space between the blocks inside it: one block fills the zone,
   two split it, three split it in three. Blocks can also be "free" (absolute, in millimetres). */
(function () {
  "use strict";
  const HCV = (window.HCV = {});
  const MM_PX = 96 / 25.4, PT = 0.3528;
  HCV.MM_PX = MM_PX;

  HCV.FONTS = {
    sans: "'Inter','Segoe UI',system-ui,Arial,sans-serif",
    serif: "Georgia,'Times New Roman',serif",
    mono: "ui-monospace,'SF Mono',Consolas,monospace",
    condensed: "'Arial Narrow','Roboto Condensed',Arial,sans-serif"
  };
  HCV.SKINS = {
    ember:     { label: "Ember",             bg: "#121212", text: "#f2f2f2", muted: "#b3b3b3", accent: "#ff7a1a", line: "#3a3a3a" },
    olive:     { label: "Field Olive",       bg: "#14160f", text: "#f0f0e9", muted: "#b6b9ac", accent: "#c1b56a", line: "#3a4032" },
    aluminium: { label: "Brushed Aluminium", bg: "#202328", text: "#f2f4f6", muted: "#c1c6cd", accent: "#c9d0d8", line: "#454b54" },
    plain:     { label: "Plain (light)",     bg: "#ffffff", text: "#111111", muted: "#444444", accent: "#222222", line: "#bbbbbb" }
  };
  const ENTRY = ["experience", "education", "projects", "certifications"];
  const SIDE = ["skills", "languages", "certifications"];
  const HEAD = ["profile", "contact"];

  const ICONS = {
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    contact: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    summary: '<path d="M4 6h16M4 11h16M4 16h10"/>',
    experience: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/>',
    education: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
    projects: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
    certifications: '<circle cx="12" cy="9" r="5"/><path d="M8.5 13.5L7 21l5-3 5 3-1.5-7.5"/>',
    skills: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    languages: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    text: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M8 10h8M8 14h5"/>',
    line: '<path d="M3 12h18"/>',
    shape: '<rect x="4" y="5" width="16" height="14"/>'
  };
  HCV.icon = (k, s) => `<svg class="ic" viewBox="0 0 24 24" width="${s || 18}" height="${s || 18}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ""}</svg>`;

  HCV.TYPES = {
    text:           { label: "Block",          hint: "Free text. A blank line starts a new paragraph.", def: { w: 80, h: 30, title: "", text: "" } },
    profile:        { label: "Profile",        hint: "Line 1: your name. Line 2: your title. Then a short summary.", def: { w: 120, h: 40, text: "Your Full Name\nTarget Role / Professional Title\nWrite two to four concise lines about your experience, strengths and the kind of role you want." } },
    contact:        { label: "Contact",        hint: "One per line as Label: value", def: { w: 60, h: 36, title: "Contact", text: "Location: City, Country\nEmail: name@email.com\nPhone: +00 000 000 000\nLinks: linkedin.com/in/yourname" } },
    summary:        { label: "Summary",        hint: "A short paragraph about you.", def: { w: 120, h: 30, title: "Summary", text: "A short paragraph describing your strengths and goals." } },
    experience:     { label: "Experience",     hint: "Per entry: 'Job title | Dates', then the company, then lines starting with '-'. Blank line between entries.", def: { w: 120, h: 70, title: "Experience", text: "Job Title / Position | MM YYYY — Present\nCompany / Organisation · City\n- Describe a relevant responsibility or achievement and the result.\n- Add measurable outcomes when available.\n\nPrevious Job Title | MM YYYY — MM YYYY\nCompany / Organisation · City\n- Summarise your main responsibility or accomplishment." } },
    education:      { label: "Education",      hint: "Per entry: 'Degree | Years', then the school, then optional notes.", def: { w: 120, h: 34, title: "Education", text: "Degree / Qualification | YYYY — YYYY\nSchool / University · City\nOptional details such as coursework or honours." } },
    projects:       { label: "Projects",       hint: "Per entry: 'Project name | Year', then details.", def: { w: 120, h: 34, title: "Selected Projects", text: "Project Name | YEAR\nWhat you built or improved, your role and the outcome." } },
    certifications: { label: "Certifications", hint: "Per entry: 'Name | Year', then the issuer.", def: { w: 60, h: 28, title: "Certifications", text: "Certification Name | Year\nIssuing organisation" } },
    skills:         { label: "Skills",         hint: "One skill per line.", def: { w: 60, h: 40, title: "Core Skills", text: "Skill / Specialism\nCommunication\nProblem Solving" } },
    languages:      { label: "Languages",      hint: "One per line, for example: English — Native", def: { w: 60, h: 24, title: "Languages", text: "English — Native\nLanguage — Level" } },
    line:           { label: "Divider",        decorative: true, def: { w: 80, h: 2, fs: 9 } },
    shape:          { label: "Box",            decorative: true, def: { w: 50, h: 30, frame: "thin", fs: 9 } }
  };
  HCV.FRAMES = { none: "None", thin: "Thin", panel: "Panel", bracket: "Bracket", tag: "Tag" };
  HCV.isDecor = (b) => !!HCV.TYPES[b.type].decorative;
  HCV.label = (b) => b.title || HCV.TYPES[b.type].label;

  /* ---------- Zones & templates ---------- */
  HCV.ZONES = {
    header: { label: "Header", dir: "row", rank: 0 },
    left:   { label: "Left column", dir: "column", rank: 1 },
    right:  { label: "Right column", dir: "column", rank: 2 },
    footer: { label: "Footer", dir: "row", rank: 3 }
  };
  HCV.TEMPLATES = {
    classic: { label: "Header + 2 columns",  main: "left",  side: "right", areas: ["'header header'", "'left right'", "'footer footer'"], cols: true },
    sidebar: { label: "Sidebar + main",      main: "right", side: "left",  areas: ["'header header'", "'left right'", "'footer footer'"], cols: true },
    onecol:  { label: "Header + 1 column",   main: "left",  side: "left",  areas: ["'header'", "'left'", "'footer'"], cols: false }
  };
  HCV.defaultZone = (type, tpl) => {
    const t = HCV.TEMPLATES[tpl] || HCV.TEMPLATES.classic;
    if (HEAD.includes(type)) return "header";
    if (SIDE.includes(type)) return t.side;
    return t.main;
  };
  /* the zone a block actually renders in (templates without a right column use the left) */
  HCV.zoneOf = (doc, b) => {
    if (!b.zone) return null;
    if (!HCV.TEMPLATES[doc.template].cols && b.zone === "right") return "left";
    return b.zone;
  };
  HCV.zoneIds = (doc) => (HCV.TEMPLATES[doc.template].cols ? ["header", "left", "right", "footer"] : ["header", "left", "footer"]);
  /* reading order = zone order (header, left, right, footer), then order inside the zone */
  HCV.settle = (doc) => {
    const rank = (b) => { const z = HCV.zoneOf(doc, b); return z ? HCV.ZONES[z].rank : 4; };
    doc.blocks.slice().sort((a, b) => rank(a) - rank(b) || a.order - b.order).forEach((b, i) => { b.order = i; });
  };
  HCV.arrange = (doc) => {
    doc.blocks.forEach((b) => { b.zone = HCV.defaultZone(b.type, doc.template); });
    HCV.settle(doc);
  };
  HCV.placeBlock = (doc, b, zone, index) => {
    const list = HCV.ordered(doc).filter((o) => o !== b && HCV.zoneOf(doc, o) === zone);
    b.zone = zone;
    const ref = list[index];
    b.order = ref ? ref.order - 0.5 : (list.length ? list[list.length - 1].order + 0.5 : 0);
    HCV.settle(doc);
  };
  HCV.setTemplate = (doc, tpl) => {
    const old = doc.template;
    doc.blocks.forEach((b) => { if (b.zone === HCV.defaultZone(b.type, old)) b.zone = HCV.defaultZone(b.type, tpl); });
    doc.template = tpl; HCV.settle(doc);
  };

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  HCV.esc = esc;
  HCV.uid = () => "b" + Math.random().toString(36).slice(2, 8);
  const r2 = (v) => Math.round(v * 100) / 100;

  /* ---------- Model ---------- */
  HCV.newBlock = (type, over, tpl) => {
    const d = HCV.TYPES[type].def;
    return Object.assign({
      id: HCV.uid(), type, zone: HCV.defaultZone(type, tpl || "classic"), weight: 1,
      x: 10, y: 10, w: d.w, h: d.h, frame: d.frame || "none",
      title: d.title || "", text: d.text || "", fs: d.fs || 9.5, locked: false, order: 0
    }, over || {});
  };
  HCV.defaultDoc = () => {
    const doc = {
      v: 2, template: "classic", fill: "fill", split: 38,
      theme: Object.assign({ skin: "ember", font: "sans" }, HCV.SKINS.ember),
      page: { w: 210, h: 297, grid: 5, safe: 10, gap: 4, pattern: "none", frame: "none", inset: 6, corners: { tl: "", tr: "", bl: "", br: "" } },
      blocks: ["profile", "contact", "experience", "education", "skills", "languages"].map((t, i) => HCV.newBlock(t, { order: i }))
    };
    HCV.settle(doc);
    return doc;
  };
  HCV.normalize = (d) => {
    if (!d || !Array.isArray(d.blocks)) throw new Error("Not a HoundCV document");
    const base = HCV.defaultDoc();
    const out = Object.assign({}, base, d);
    if (!HCV.TEMPLATES[out.template]) out.template = "classic";
    out.theme = Object.assign({}, base.theme, d.theme || {});
    out.page = Object.assign({}, base.page, d.page || {});
    out.page.corners = Object.assign({}, base.page.corners, (d.page || {}).corners || {});
    out.blocks = d.blocks.filter((b) => HCV.TYPES[b.type]).map((b, i) => {
      const nb = HCV.newBlock(b.type, Object.assign({ order: i }, b), out.template);
      if (b.zone === undefined) nb.zone = HCV.defaultZone(b.type, out.template);   // older documents
      return nb;
    });
    out.v = 2; HCV.settle(out);
    return out;
  };
  HCV.KEY = "houndcv.doc.v1";
  HCV.load = () => { try { const s = localStorage.getItem(HCV.KEY); return s ? HCV.normalize(JSON.parse(s)) : null; } catch (e) { return null; } };
  HCV.save = (doc) => { try { localStorage.setItem(HCV.KEY, JSON.stringify(doc)); return true; } catch (e) { return false; } };
  HCV.ordered = (doc) => doc.blocks.slice().sort((a, b) => a.order - b.order);
  HCV.autoOrder = (doc) => { doc.blocks.slice().sort((a, b) => (Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x)).forEach((b, i) => { b.order = i; }); HCV.settle(doc); };
  HCV.name = (doc) => { const p = doc.blocks.find((b) => b.type === "profile"); return p ? (p.text.split("\n")[0] || "").trim() : ""; };

  /* ---------- Rendering ---------- */
  function entries(text) { return text.split(/\n\s*\n/).map((g) => g.split("\n").map((l) => l.trim()).filter(Boolean)).filter((g) => g.length); }
  function bodyLines(lines) {
    let html = "", ul = [];
    const flush = () => { if (ul.length) { html += "<ul>" + ul.map((x) => `<li>${esc(x)}</li>`).join("") + "</ul>"; ul = []; } };
    lines.forEach((l) => { if (l.startsWith("-")) ul.push(l.replace(/^-+\s*/, "")); else { flush(); html += `<p>${esc(l)}</p>`; } });
    flush(); return html;
  }
  HCV.contentHTML = (b) => {
    const t = b.type, lines = (b.text || "").split("\n");
    if (t === "line" || t === "shape") return "";
    if (t === "profile") {
      const n = lines[0] || "", j = lines[1] || "", rest = lines.slice(2).join(" ").trim();
      return `<h1>${esc(n)}</h1>${j ? `<p class="job">${esc(j)}</p>` : ""}${rest ? `<p>${esc(rest)}</p>` : ""}`;
    }
    let h = b.title ? `<h2>${esc(b.title)}</h2>` : "";
    if (t === "contact") {
      h += lines.filter((l) => l.trim()).map((l) => {
        const i = l.indexOf(":");
        return i > 0 ? `<div class="ct"><span class="l">${esc(l.slice(0, i))}</span><span>${esc(l.slice(i + 1).trim())}</span></div>` : `<div class="ct"><span>${esc(l)}</span></div>`;
      }).join("");
    } else if (ENTRY.includes(t)) {
      h += entries(b.text || "").map((g) => {
        const [head, ...rest] = g, parts = head.split("|"), name = parts[0].trim(), date = (parts[1] || "").trim();
        let org = "";
        if (rest.length && !rest[0].startsWith("-") && (t === "experience" || t === "education" || t === "certifications")) org = `<div class="org">${esc(rest.shift())}</div>`;
        return `<div class="entry"><div class="eh"><h3>${esc(name)}</h3>${date ? `<span class="date">${esc(date)}</span>` : ""}</div>${org}${bodyLines(rest)}</div>`;
      }).join("");
    } else if (t === "skills" || t === "languages") {
      h += '<ul class="plainlist">' + lines.filter((l) => l.trim()).map((l) => `<li>${esc(l)}</li>`).join("") + "</ul>";
    } else {
      h += bodyLines((b.text || "").split("\n").map((l) => l.trim()).filter(Boolean));
    }
    return h;
  };
  const isEmptyBlock = (b) => !HCV.isDecor(b) && !(b.title || "").trim() && !(b.text || "").trim();
  HCV.blockHTML = (b, o) => {
    o = o || {};
    const fs = `font-size:calc(${(b.fs * PT).toFixed(4)}*var(--mm))`;
    const cls = `blk t-${b.type} f-${b.frame}${o.zone && o.dir === "row" && b.type === "line" ? " vline" : ""}${b.locked ? " locked" : ""}${isEmptyBlock(b) ? " is-empty" : ""}`;
    if (o.zone) {
      const w = Math.max(0.2, +b.weight || 1);
      let fl;
      if (b.type === "line") fl = o.dir === "row" ? "flex:0 0 calc(2*var(--mm))" : "flex:0 0 auto;height:calc(2*var(--mm))";
      else fl = o.dir === "row" || o.fill === "equal" ? `flex:${w} 1 0%` : `flex:${w} 1 auto`;
      return `<div class="${cls} zb" data-id="${b.id}" style="${fl};${fs}">${HCV.contentHTML(b)}</div>`;
    }
    const st = o.measure ? "" : `left:calc(${r2(b.x)}*var(--mm));top:calc(${r2(b.y)}*var(--mm));width:calc(${r2(b.w)}*var(--mm));height:calc(${r2(b.h)}*var(--mm));z-index:${(o.z || 0) + 1};`;
    return `<div class="${cls}" data-id="${b.id}" style="${st}${fs}">${HCV.contentHTML(b)}</div>`;
  };
  HCV.pageVars = (doc, mm) => {
    const t = doc.theme, p = doc.page, fi = p.frame !== "none" ? p.inset : 4;
    return `--mm:${mm};--bg:${t.bg};--text:${t.text};--muted:${t.muted};--accent:${t.accent};--line:${t.line};--font:${HCV.FONTS[t.font] || HCV.FONTS.sans};--fi:${fi};--zg:${p.gap}`;
  };
  function tokens(s, doc) {
    return String(s || "").replace(/\{date\}/gi, new Date().toLocaleDateString(undefined, { year: "numeric", month: "short" }))
      .replace(/\{name\}/gi, HCV.name(doc)).replace(/\{page\}/gi, "1 / 1");
  }
  HCV.renderPage = (doc, host, o) => {
    o = o || {};
    const p = doc.page, tpl = HCV.TEMPLATES[doc.template], ui = !!o.interactive;
    let h = `<div class="page pat-${p.pattern}${ui ? " ui" : ""}" style="${HCV.pageVars(doc, o.mm || "1mm")};width:calc(${p.w}*var(--mm));height:calc(${p.h}*var(--mm))">`;
    if (p.frame !== "none") h += `<div class="pframe pf-${p.frame}"></div>`;
    const cols = tpl.cols ? `minmax(0,${100 - doc.split}fr) minmax(0,${doc.split}fr)` : "minmax(0,1fr)";
    const colsFixed = doc.template === "sidebar" ? `minmax(0,${doc.split}fr) minmax(0,${100 - doc.split}fr)` : cols;
    h += `<div class="zones${ui ? " ui" : ""}" style="left:calc(${p.safe}*var(--mm));top:calc(${p.safe}*var(--mm));right:calc(${p.safe}*var(--mm));bottom:calc(${p.safe}*var(--mm));grid-template-columns:${colsFixed};grid-template-rows:auto minmax(0,1fr) auto;grid-template-areas:${tpl.areas.join(" ")}">`;
    const ordered = HCV.ordered(doc);
    HCV.zoneIds(doc).forEach((id) => {
      const z = HCV.ZONES[id], list = ordered.filter((b) => HCV.zoneOf(doc, b) === id);
      h += `<div class="zone z-${id}${list.length ? "" : " empty"}" data-zone="${id}" data-dir="${z.dir}" style="grid-area:${id}">`;
      list.forEach((b) => { h += HCV.blockHTML(b, { zone: true, dir: z.dir, fill: doc.fill }); });
      if (ui) h += `<span class="zl">${z.label}</span><div class="dz"><b>Drop here</b><span>${z.label}</span></div>`;
      h += "</div>";
    });
    h += "</div>";
    ordered.forEach((b) => { if (!HCV.zoneOf(doc, b)) h += HCV.blockHTML(b, { z: doc.blocks.indexOf(b) }); });
    ["tl", "tr", "bl", "br"].forEach((k) => { const t = tokens(p.corners[k], doc); if (t) h += `<div class="corner c-${k}">${esc(t)}</div>`; });
    if (ui) h += `<div class="ov-safe" style="left:calc(${p.safe}*var(--mm));top:calc(${p.safe}*var(--mm));right:calc(${p.safe}*var(--mm));bottom:calc(${p.safe}*var(--mm))"></div><div class="ov-guides"></div>`;
    host.innerHTML = h + "</div>";
  };
  HCV.plainHTML = (doc) => {
    const rows = HCV.ordered(doc).filter((b) => !HCV.isDecor(b)).map((b) => `<section class="blk-plain t-${b.type}">${HCV.contentHTML(b)}</section>`).join("");
    return `<div class="plain">${rows}</div>`;
  };

  /* ---------- Measuring (free blocks only) ---------- */
  let mEl;
  HCV.measure = (doc, b, wMm) => {
    if (!mEl) { mEl = document.createElement("div"); mEl.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none"; document.body.appendChild(mEl); }
    mEl.innerHTML = `<div class="page" style="${HCV.pageVars(doc, "1mm")};width:${wMm}mm;height:auto;overflow:visible">${HCV.blockHTML(Object.assign({}, b, { w: wMm }), { measure: true })}</div>`;
    const el = mEl.querySelector(".blk");
    el.style.position = "relative"; el.style.width = wMm + "mm"; el.style.height = "auto";
    return Math.ceil(el.offsetHeight * 25.4 / 96) + 1;
  };

  /* ---------- Snapping (free blocks) ---------- */
  HCV.targets = (doc, excludeId) => {
    const p = doc.page, m = p.safe, xs = [m, p.w - m, p.w / 2], ys = [m, p.h - m, p.h / 2];
    doc.blocks.forEach((o) => { if (o.id === excludeId || HCV.zoneOf(doc, o)) return; xs.push(o.x, o.x + o.w, o.x + o.w / 2); ys.push(o.y, o.y + o.h, o.y + o.h / 2); });
    return { xs, ys };
  };
  function pick(vals, targets, thr) {
    let best = null;
    vals.forEach((v) => targets.forEach((t) => { const d = t - v; if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t }; }));
    return best;
  }
  HCV.snapMove = (doc, b, nx, ny, thr) => {
    const T = HCV.targets(doc, b.id), g = doc.page.grid, gx = [], gy = [];
    const bx = pick([nx, nx + b.w / 2, nx + b.w], T.xs, thr);
    if (bx) { nx += bx.d; gx.push(bx.t); } else nx = Math.round(nx / g) * g;
    const by = pick([ny, ny + b.h / 2, ny + b.h], T.ys, thr);
    if (by) { ny += by.d; gy.push(by.t); } else ny = Math.round(ny / g) * g;
    return { x: r2(nx), y: r2(ny), gx, gy };
  };
  HCV.snapEdge = (doc, id, v, axis, thr) => {
    const best = pick([v], HCV.targets(doc, id)[axis + "s"], thr), g = doc.page.grid;
    return best ? { v: r2(best.t), g: best.t } : { v: r2(Math.round(v / g) * g) };
  };

  /* ---------- Complete your CV (essentials) & quality checks ---------- */
  const PLACEHOLDER = /name@email\.com|Job Title \/ Position|Describe a relevant|Degree \/ Qualification|Your Full Name|A short paragraph describing|Skill \/ Specialism|Language — Level|\+00 000 000 000/;
  const filled = (b) => b && (b.text || "").trim() && !PLACEHOLDER.test(b.text);
  HCV.ESSENTIALS = [
    { id: "name", label: "Your name and title", type: "profile", test: (doc) => { const b = doc.blocks.find((x) => x.type === "profile"); return !!b && filled(b) && (b.text.split("\n")[1] || "").trim().length > 0 && !/Target Role/.test(b.text); } },
    { id: "contact", label: "Email and contact details", type: "contact", test: (doc) => { const b = doc.blocks.find((x) => x.type === "contact"); return !!b && filled(b) && /\S+@\S+\.\S+/.test(b.text); } },
    { id: "summary", label: "A short summary", type: "summary", test: (doc) => filled(doc.blocks.find((x) => x.type === "summary")) || /\S{20}/.test(((doc.blocks.find((x) => x.type === "profile") || {}).text || "").split("\n").slice(2).join(" ")) && !/Write two to four/.test((doc.blocks.find((x) => x.type === "profile") || {}).text || "") },
    { id: "experience", label: "Work experience", type: "experience", test: (doc) => filled(doc.blocks.find((x) => x.type === "experience")) },
    { id: "education", label: "Education", type: "education", test: (doc) => filled(doc.blocks.find((x) => x.type === "education")) },
    { id: "skills", label: "Skills", type: "skills", test: (doc) => filled(doc.blocks.find((x) => x.type === "skills")) },
    { id: "languages", label: "Languages", type: "languages", test: (doc) => filled(doc.blocks.find((x) => x.type === "languages")) }
  ];
  HCV.essentials = (doc) => HCV.ESSENTIALS.map((e) => ({ id: e.id, label: e.label, type: e.type, done: !!e.test(doc), exists: doc.blocks.some((b) => b.type === e.type) }));

  HCV.check = (doc, host) => {
    const out = [], push = (level, msg) => out.push({ level, msg });
    const real = doc.blocks.filter((b) => !HCV.isDecor(b));
    real.forEach((b) => { if (b.fs < 8) push("info", `"${HCV.label(b)}" uses very small text (${b.fs} pt).`); });
    const free = real.filter((b) => !HCV.zoneOf(doc, b)), p = doc.page, m = p.safe;
    free.forEach((b) => { if (b.x < m - .01 || b.y < m - .01 || b.x + b.w > p.w - m + .01 || b.y + b.h > p.h - m + .01) push("warn", `"${HCV.label(b)}" is outside the safe zone.`); });
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const a = free[i], c = free[j];
      if (a.x < c.x + c.w - .5 && c.x < a.x + a.w - .5 && a.y < c.y + c.h - .5 && c.y < a.y + a.h - .5) push("error", `"${HCV.label(a)}" overlaps "${HCV.label(c)}".`);
    }
    if (host) {
      host.querySelectorAll(".zone").forEach((z) => {
        if (z.dataset.dir === "column" && z.scrollHeight > z.clientHeight + 2) push("error", `The ${HCV.ZONES[z.dataset.zone].label.toLowerCase()} is too full. Remove a block, shorten text or use a smaller size.`);
      });
      host.querySelectorAll(".blk").forEach((el) => {
        const b = doc.blocks.find((x) => x.id === el.dataset.id);
        if (b && !HCV.isDecor(b) && el.scrollHeight > el.clientHeight + 2) push("error", `"${HCV.label(b)}" text is cut off. Use Fit height or enlarge the block.`);
      });
    }
    return out;
  };
})();
