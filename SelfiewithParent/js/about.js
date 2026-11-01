// About pages: gentle reveal on scroll, count-up numbers, and the journey timeline's progress line.
// Everything is visible without JavaScript; this only adds motion (and skips it when the visitor prefers less motion).
(function () {
  "use strict";
  var calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  // Reveal blocks as they scroll into view
  if (!calm && "IntersectionObserver" in window) {
    document.documentElement.classList.add("js-reveal");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -10% 0px" });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  }

  // Count-up numbers: <span data-count="25000">25,000</span> (the real number is in the HTML already)
  function fmt(n) { return Math.round(n).toLocaleString(document.documentElement.lang || "en-IN"); }
  var nums = document.querySelectorAll("[data-count]");
  if (!calm && nums.length && "IntersectionObserver" in window) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        co.unobserve(e.target);
        var el = e.target, end = +el.getAttribute("data-count"), t0 = null;
        (function tick(t) {
          t0 = t0 || t;
          var p = Math.min(1, (t - t0) / 1200);
          el.textContent = fmt(end * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
        })(performance.now());
      });
    }, { threshold: .5 });
    nums.forEach(function (el) { co.observe(el); });
  }

  // Journey: the timeline line fills as you scroll through it
  var line = document.querySelector(".timeline");
  var bar = line && line.querySelector(".tl-progress");
  if (line && bar) {
    var update = function () {
      var r = line.getBoundingClientRect(), h = window.innerHeight;
      var p = Math.min(1, Math.max(0, (h * .6 - r.top) / r.height));
      bar.style.height = (p * 100) + "%";
    };
    if (calm) bar.style.height = "100%";
    else { addEventListener("scroll", update, { passive: true }); addEventListener("resize", update); update(); }
  }
})();
