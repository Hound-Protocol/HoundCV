/* Landing page behaviour: login window and scroll reveal. */
(function () {
  "use strict";
  const login = document.getElementById("login");
  document.getElementById("login-open").addEventListener("click", () => login.classList.add("open"));
  document.getElementById("login-close").addEventListener("click", () => login.classList.remove("open"));
  login.addEventListener("click", (e) => { if (e.target === login) login.classList.remove("open"); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") login.classList.remove("open"); });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((en, i) => { if (en.isIntersecting) { setTimeout(() => en.target.classList.add("in"), i * 90); io.unobserve(en.target); } });
  }, { threshold: .15 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
})();
