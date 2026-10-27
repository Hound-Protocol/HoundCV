/* HoundCV landing behaviour + Hound Helper.
   The helper flies around, points at things, opens a chat, and shows a demo window
   that is attached to him. Help topics live in TOPICS below: add a gif path to `demo`
   (for example "assets/demos/start.gif") and it will loop in the demo window. */
(function () {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);

  /* ---------- Login modal ---------- */
  const login = $("login");
  $("login-open").addEventListener("click", () => login.classList.add("open"));
  $("login-close").addEventListener("click", () => login.classList.remove("open"));
  login.addEventListener("click", (e) => { if (e.target === login) login.classList.remove("open"); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") { login.classList.remove("open"); closeChat(); } });

  /* ---------- Scroll reveal ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en, i) => { if (en.isIntersecting) { setTimeout(() => en.target.classList.add("in"), i * 90); io.unobserve(en.target); } });
  }, { threshold: .15 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  /* ---------- Hound Helper ---------- */
  const helper = $("helper"), face = $("h-face"), hand = $("h-hand");
  const bubble = $("h-bubble"), demo = $("h-demo"), demoBody = $("h-demo-body");
  const chat = $("helper-chat"), chatBody = $("chat-body"), SIZE = 76;
  let pos = { x: innerWidth - 140, y: innerHeight - 160 };
  let busy = false, wanderTimer;

  const TOPICS = [
    { id: "start", label: "How do I start?", target: "#start", demo: null,
      title: "Start", text: "Press Start building. You can build without an account and your CV saves in this browser." },
    { id: "blocks", label: "How do blocks work?", target: ".stage", demo: null,
      title: "Blocks", text: "In Advanced mode, drag a block onto the page. It snaps to the grid. Right-click it to change type, frame and style." },
    { id: "export", label: "How do I export?", target: ".features", demo: null,
      title: "Export", text: "Download a PDF with selectable text, a picture version, or a plain version for applicant tracking systems. All free." },
    { id: "login", label: "Do I need to log in?", target: "#login-open", demo: null,
      title: "Login", text: "No. Logging in is optional and only adds sync across devices." },
  ];

  function place(x, y, instant) {
    pos.x = Math.max(8, Math.min(innerWidth - SIZE - 8, x));
    pos.y = Math.max(70, Math.min(innerHeight - SIZE - 8, y));
    if (instant) helper.style.transition = "none";
    helper.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    helper.classList.toggle("left", pos.x > innerWidth / 2);
    if (instant) { void helper.offsetWidth; helper.style.transition = ""; }
  }

  function say(text, ms) {
    bubble.textContent = text; bubble.classList.add("show");
    clearTimeout(say.t); if (ms) say.t = setTimeout(() => bubble.classList.remove("show"), ms);
  }

  function setDemo(topic) {
    if (!topic) { demo.classList.remove("show"); return; }
    $("h-demo-title").textContent = topic.title;
    $("h-demo-cap").textContent = topic.text;
    demoBody.innerHTML = topic.demo
      ? `<img alt="Looping demo: ${topic.title}" src="${topic.demo}">`
      : '<div class="demo-ph"><i></i></div>';
    demo.classList.add("show");
  }

  function pointAt(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      const toRight = r.left + r.width / 2 < innerWidth / 2;
      const x = toRight ? r.right + 24 : r.left - SIZE - 24;
      place(x, r.top + r.height / 2 - SIZE / 2);
      setTimeout(() => {
        const hr = helper.getBoundingClientRect();
        const ang = Math.atan2(r.top + r.height / 2 - (hr.top + SIZE / 2), r.left + r.width / 2 - (hr.left + SIZE / 2));
        hand.style.setProperty("--angle", (ang * 180 / Math.PI) + "deg");
        helper.classList.add("pointing");
        el.animate([{ outlineColor: "transparent" }, { outlineColor: "#5be3c0" }, { outlineColor: "transparent" }],
          { duration: 1400, iterations: 2 });
        el.style.outline = "2px solid transparent"; el.style.outlineOffset = "6px";
      }, reduce ? 0 : 1300);
    }, reduce ? 0 : 500);
  }

  function showTopic(t) {
    busy = true; clearTimeout(wanderTimer);
    addMsg(t.label, true);
    addMsg(t.text);
    closeChat();
    helper.classList.remove("pointing");
    setDemo(null);
    pointAt(t.target);
    setTimeout(() => { say(t.text); setDemo(t); }, reduce ? 0 : 1500);
  }

  function resetHelper() {
    helper.classList.remove("pointing"); setDemo(null); bubble.classList.remove("show");
    busy = false; wander();
  }

  function wander() {
    clearTimeout(wanderTimer);
    if (reduce) return;
    wanderTimer = setTimeout(() => {
      if (!busy && !chat.classList.contains("open")) {
        place(40 + Math.random() * (innerWidth - 160), 90 + Math.random() * (innerHeight - 220));
      }
      wander();
    }, 5200 + Math.random() * 2500);
  }

  /* Eyes follow the cursor */
  addEventListener("pointermove", (e) => {
    const r = face.getBoundingClientRect();
    const a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    const dx = Math.cos(a) * 3.2, dy = Math.sin(a) * 3.2;
    ["pl", "pr"].forEach((id) => { $(id).style.transform = `translate(${dx}px, ${dy}px)`; });
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
    const hit = TOPICS.find((t) => q.includes(t.id) || t.label.toLowerCase().split(" ").some((w) => w.length > 4 && q.includes(w)));
    setTimeout(() => hit ? showTopic(hit) : addMsg("I only know a few things for now. Pick a topic above. Smarter answers are coming."), 350);
  });
  document.addEventListener("click", (e) => {
    if (busy && !helper.contains(e.target) && !chat.contains(e.target)) resetHelper();
  });

  /* ---------- Start ---------- */
  place(innerWidth - 150, -80, true);
  setTimeout(() => { place(innerWidth - 150, innerHeight - 170); say("Hi! Click me if you need help.", 4500); wander(); }, 900);
  addEventListener("resize", () => place(pos.x, pos.y));
})();
