/* Hound Helper: a floating assistant that flies around, points with a hand,
   opens a chat window and shows a demo window attached to him.
   Pages configure him before loading this file:
     window.HELPER_TOPICS = [{ id, label, target (CSS selector), title, text, demo (gif path or null) }]
     window.HELPER_OPTS   = { wander: true|false }
   To show a looping GIF for a topic, set demo: "assets/demos/<name>.gif". */
(function () {
  "use strict";
  const OPTS = Object.assign({ wander: true }, window.HELPER_OPTS || {});
  const TOPICS = window.HELPER_TOPICS || [];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SIZE = 76;

  /* ---------- Inject markup ---------- */
  const root = document.createElement("div");
  root.innerHTML = `
  <div id="helper" role="complementary" aria-label="Hound Helper">
    <div class="bubble" id="h-bubble"></div>
    <div class="demo" id="h-demo" aria-hidden="true">
      <div class="demo-head"><span>Demo</span><span id="h-demo-title"></span></div>
      <div class="demo-body" id="h-demo-body"></div>
      <div class="demo-cap" id="h-demo-cap"></div>
    </div>
    <div class="float">
      <div class="hand" id="h-hand">
        <svg viewBox="0 0 64 36" aria-hidden="true">
          <!-- glove pointing right: cuff, palm, curled fingers, thumb, extended index finger -->
          <rect x="1.5" y="9" width="10" height="19" rx="3.5" fill="#ff7a1a" stroke="#120a02" stroke-width="2"/>
          <rect x="30" y="10.5" width="31" height="8.5" rx="4.25" fill="#f6f3ec" stroke="#120a02" stroke-width="2"/>
          <path d="M11 11 H31 Q37 11 37 17 V26 Q37 31 32 31 H14 Q11 31 11 28 Z" fill="#f6f3ec" stroke="#120a02" stroke-width="2" stroke-linejoin="round"/>
          <rect x="29" y="19.5" width="12" height="4.6" rx="2.3" fill="#f6f3ec" stroke="#120a02" stroke-width="1.8"/>
          <rect x="29" y="24" width="11" height="4.6" rx="2.3" fill="#f6f3ec" stroke="#120a02" stroke-width="1.8"/>
          <path d="M15 12 Q16 3.5 25 5.5 Q30 6.8 29 12.5 Z" fill="#f6f3ec" stroke="#120a02" stroke-width="2" stroke-linejoin="round"/>
          <path d="M34 14.7 H57" stroke="#d8d3c6" stroke-width="1.6" stroke-linecap="round" fill="none"/>
        </svg>
      </div>
      <svg class="face" id="h-face" viewBox="0 0 100 100" tabindex="0" role="button" aria-label="Open Hound Helper chat">
        <defs><radialGradient id="hg" cx="35%" cy="28%" r="78%"><stop offset="0" stop-color="#ffab66"/><stop offset="1" stop-color="#f26500"/></radialGradient></defs>
        <circle cx="50" cy="50" r="46" fill="url(#hg)" stroke="#120a02" stroke-width="4"/>
        <ellipse cx="33" cy="25" rx="14" ry="6.5" fill="#fff" opacity=".22" transform="rotate(-25 33 25)"/>
        <g class="blink"><circle cx="35" cy="46" r="9.5" fill="#fff" stroke="#120a02" stroke-width="2"/><circle cx="65" cy="46" r="9.5" fill="#fff" stroke="#120a02" stroke-width="2"/></g>
        <circle class="pupil" id="pl" cx="35" cy="46" r="4.6" fill="#120a02"/>
        <circle class="pupil" id="pr" cx="65" cy="46" r="4.6" fill="#120a02"/>
        <path d="M31 65 Q50 83 69 65" fill="none" stroke="#120a02" stroke-width="4.5" stroke-linecap="round"/>
      </svg>
    </div>
  </div>
  <section id="helper-chat" aria-label="Hound Helper chat">
    <div class="chat-head"><span>Hound Helper</span><button class="icon-btn" id="chat-close" aria-label="Close chat">×</button></div>
    <div class="chat-body" id="chat-body"></div>
    <form class="chat-input" id="chat-form">
      <input id="chat-text" placeholder="Ask me anything…" autocomplete="off" aria-label="Ask the Hound Helper">
      <button class="btn" style="padding:8px 12px" type="submit">Send</button>
    </form>
  </section>`;
  while (root.firstChild) document.body.appendChild(root.firstChild);

  const $ = (id) => document.getElementById(id);
  const helper = $("helper"), face = $("h-face"), hand = $("h-hand");
  const bubble = $("h-bubble"), demo = $("h-demo"), demoBody = $("h-demo-body");
  const chat = $("helper-chat"), chatBody = $("chat-body");
  let pos = { x: 0, y: 0 }, busy = false, wanderTimer;

  function place(x, y, instant) {
    pos.x = Math.max(8, Math.min(innerWidth - SIZE - 8, x));
    pos.y = Math.max(60, Math.min(innerHeight - SIZE - 8, y));
    if (instant) helper.style.transition = "none";
    helper.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    helper.classList.toggle("left", pos.x > innerWidth / 2);
    helper.classList.toggle("edge", pos.x < 150);
    if (instant) { void helper.offsetWidth; helper.style.transition = ""; }
  }
  function say(text, ms) {
    bubble.textContent = text; bubble.classList.add("show");
    clearTimeout(say.t); if (ms) say.t = setTimeout(() => bubble.classList.remove("show"), ms);
  }
  function setDemo(topic) {
    if (!topic) { demo.classList.remove("show"); return; }
    $("h-demo-title").textContent = topic.title || "";
    $("h-demo-cap").textContent = topic.text || "";
    demoBody.innerHTML = topic.demo
      ? `<img alt="Looping demo: ${topic.title || ""}" src="${topic.demo}">`
      : '<div class="demo-ph"><i></i></div>';
    demo.classList.add("show");
  }
  function pointAt(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      const onLeft = r.left > innerWidth - r.right;          // more room on the left side?
      const x = onLeft ? r.left - SIZE - 34 : r.right + 34;
      const y = Math.min(Math.max(r.top + Math.min(r.height / 2, 120) - SIZE / 2, 70), innerHeight - 200);
      place(x, y);
      setTimeout(() => {
        const hr = helper.getBoundingClientRect(), cx = hr.left + SIZE / 2, cy = hr.top + SIZE / 2;
        const tx = Math.min(Math.max(cx, r.left), r.right), ty = Math.min(Math.max(cy, r.top), r.bottom); // nearest point on the target
        const deg = Math.atan2(ty - cy, tx - cx) * 180 / Math.PI;
        hand.style.setProperty("--angle", deg + "deg");
        hand.style.setProperty("--flip", Math.abs(deg) > 90 ? -1 : 1);   // keep the glove right-side up
        helper.classList.add("pointing");
        const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff7a1a";
        el.style.outline = "2px solid transparent"; el.style.outlineOffset = "6px";
        el.animate([{ outlineColor: "transparent" }, { outlineColor: accent }, { outlineColor: "transparent" }], { duration: 1400, iterations: 2 });
      }, reduce ? 0 : 1300);
    }, reduce ? 0 : 500);
  }
  function showTopic(t) {
    busy = true; clearTimeout(wanderTimer);
    addMsg(t.label, true); addMsg(t.text);
    closeChat(); helper.classList.remove("pointing"); setDemo(null);
    if (t.target) pointAt(t.target);
    setTimeout(() => { say(t.text); setDemo(t); }, reduce ? 0 : 1500);
  }
  function resetHelper() {
    helper.classList.remove("pointing"); setDemo(null); bubble.classList.remove("show");
    busy = false; wander();
  }
  function wander() {
    clearTimeout(wanderTimer);
    if (reduce || !OPTS.wander) return;
    wanderTimer = setTimeout(() => {
      if (!busy && !chat.classList.contains("open")) place(40 + Math.random() * (innerWidth - 160), 90 + Math.random() * (innerHeight - 220));
      wander();
    }, 5200 + Math.random() * 2500);
  }

  addEventListener("pointermove", (e) => {
    const r = face.getBoundingClientRect();
    const a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    ["pl", "pr"].forEach((id) => { $(id).style.transform = `translate(${Math.cos(a) * 3.2}px, ${Math.sin(a) * 3.2}px)`; });
  });

  /* ---------- Chat ---------- */
  function addMsg(text, me) {
    const d = document.createElement("div");
    d.className = "msg" + (me ? " me" : ""); d.textContent = text;
    chatBody.appendChild(d); chatBody.scrollTop = chatBody.scrollHeight;
  }
  function openChat() {
    chat.classList.add("open"); busy = true; clearTimeout(wanderTimer);
    if (!chatBody.children.length) {
      addMsg("Hi, I'm the Hound Helper. What do you want to know?");
      const chips = document.createElement("div"); chips.className = "chips";
      TOPICS.forEach((t) => {
        const b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.textContent = t.label;
        b.addEventListener("click", () => showTopic(t)); chips.appendChild(b);
      });
      chatBody.appendChild(chips);
    }
  }
  function closeChat() { chat.classList.remove("open"); }
  face.addEventListener("click", () => { chat.classList.contains("open") ? (closeChat(), resetHelper()) : openChat(); });
  face.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); face.dispatchEvent(new Event("click")); } });
  $("chat-close").addEventListener("click", () => { closeChat(); resetHelper(); });
  $("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("chat-text").value.trim(); if (!v) return;
    addMsg(v, true); $("chat-text").value = "";
    const q = v.toLowerCase();
    const hit = TOPICS.find((t) => q.includes(t.id) || t.label.toLowerCase().split(/\W+/).some((w) => w.length > 4 && q.includes(w)));
    setTimeout(() => hit ? showTopic(hit) : addMsg("I only know a few things for now. Pick a topic above. Smarter answers are coming."), 350);
  });
  document.addEventListener("click", (e) => { if (busy && !helper.contains(e.target) && !chat.contains(e.target)) resetHelper(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") { closeChat(); if (busy) resetHelper(); } });

  /* ---------- Start ---------- */
  const home = OPTS.home === "bottom-left" ? [16, innerHeight - 110] : [innerWidth - 150, innerHeight - 170];
  place(home[0], -80, true);
  setTimeout(() => { place(home[0], home[1]); say("Hi! Click me if you need help.", 4500); wander(); }, 900);
  addEventListener("resize", () => place(pos.x, pos.y));
})();
