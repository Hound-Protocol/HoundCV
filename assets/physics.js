/* HoundCV physics: tethered cards on elastic cords.
   A body is pulled toward a target by a damped spring. While grabbed it follows the pointer
   with a little lag and tilts with its speed. Released, it springs back to its origin and wobbles.
   The cord is a curve from the origin to the body: it sags when slack and trembles when pulled. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("id", "cords"); svg.setAttribute("aria-hidden", "true");
  const bodies = new Set();
  let raf = 0, last = 0;
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(svg));
  if (document.body) document.body.appendChild(svg);

  const MODES = { grab: { k: 300, c: 28 }, back: { k: 150, c: 11 }, fly: { k: 420, c: 34 } };

  /* o: { el, bx, by (centre where el is positioned), ox, oy (cord origin), onDone } */
  function add(o) {
    const b = Object.assign({ x: o.bx, y: o.by, vx: 0, vy: 0, tx: o.bx, ty: o.by, mode: "grab", age: 0, phase: Math.random() * 6.28, scale: 1.06 }, o);
    b.path = document.createElementNS(NS, "path"); b.pin = document.createElementNS(NS, "circle"); b.pin.setAttribute("r", "4.5");
    svg.append(b.path, b.pin); bodies.add(b); kick(); return b;
  }
  function remove(b) { b.path.remove(); b.pin.remove(); bodies.delete(b); }
  function setMode(b, mode, tx, ty, done) { b.mode = mode; b.tx = tx; b.ty = ty; b.age = 0; b.finish = done; if (mode === "back") b.scale = 1; kick(); }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  function frame(ts) {
    const dt = Math.min(0.033, (ts - last) / 1000 || 0.016); last = ts;
    bodies.forEach((b) => {
      b.age += dt;
      const m = MODES[b.mode];
      if (reduce) { b.x = b.tx; b.y = b.ty; b.vx = b.vy = 0; }
      else {
        b.vx += (m.k * (b.tx - b.x) - m.c * b.vx) * dt; b.vy += (m.k * (b.ty - b.y) - m.c * b.vy) * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
      }
      const tilt = Math.max(-16, Math.min(16, b.vx * 0.035));
      b.el.style.transform = `translate(${b.x - b.bx}px, ${b.y - b.by}px) rotate(${tilt}deg) scale(${b.mode === "grab" ? b.scale : 1})`;
      /* cord */
      const dx = b.x - b.ox, dy = b.y - b.oy, dist = Math.hypot(dx, dy) || 1, speed = Math.hypot(b.vx, b.vy);
      const amp = Math.min(12, speed * 0.016) * Math.sin(ts / 1000 * 22 + b.phase), slack = Math.max(0, 90 - dist) * 0.55;
      const mx = (b.ox + b.x) / 2 - (dy / dist) * amp, my = (b.oy + b.y) / 2 + (dx / dist) * amp + slack;
      b.path.setAttribute("d", `M${b.ox.toFixed(1)} ${b.oy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
      b.pin.setAttribute("cx", b.ox.toFixed(1)); b.pin.setAttribute("cy", b.oy.toFixed(1));
      /* settle */
      if (b.mode !== "grab") {
        const d = Math.hypot(b.tx - b.x, b.ty - b.y), v = speed;
        const done = b.mode === "fly" ? d < 14 || b.age > 0.9 : (d < 1.2 && v < 14) || b.age > 2.2;
        if (done) { const f = b.finish; remove(b); if (f) f(); }
      }
    });
    raf = bodies.size ? requestAnimationFrame(frame) : 0;
  }
  window.HCVPhys = { add, remove, setMode };
})();
