// Shared helpers for the new feature designs: hearts, theme of the month, footer bits.
// Design preview only — hearts and other choices are kept in this browser, not on a server.
(function () {
  "use strict";

  function store(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }
  var t = function (s, v) { return window.I18N ? I18N.t(s, v) : s; };

  // ---------- Hearts ----------
  // Base counts are made up from the id so every card looks "lived in" in the preview
  function baseCount(id) {
    var h = 0, s = String(id);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
    return 12 + h % 380;
  }
  function liked() { return store("swp-hearts", {}); }

  function heartButton(id) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "heart-btn";
    function paint() {
      var on = !!liked()[id];
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.setAttribute("aria-label", t(on ? "Remove heart" : "Send a heart"));
      b.innerHTML = '<i class="bi ' + (on ? "bi-heart-fill" : "bi-heart") + '"></i> ' + (baseCount(id) + (on ? 1 : 0)).toLocaleString(window.I18N ? I18N.locale : "en-IN");
    }
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      var l = liked();
      if (l[id]) delete l[id]; else l[id] = 1;
      save("swp-hearts", l);
      paint();
    });
    paint();
    return b;
  }

  // ---------- Theme of the month ----------
  function currentTheme() {
    var list = window.THEMES || [];
    var m = new Date().getMonth();
    return list.find(function (x) { return x.month === m; }) || list[0];
  }

  function renderThemeBanners() {
    var th = currentTheme();
    if (!th) return;
    document.querySelectorAll("[data-theme-banner]").forEach(function (slot) {
      slot.className = "theme-banner";
      slot.innerHTML =
        '<div class="theme-icon"><i class="bi ' + th.icon + '"></i></div>' +
        '<div class="theme-text"><small></small><h3></h3><p></p></div>' +
        '<a class="btn btn-accent" href="upload.html"><i class="bi bi-upload"></i> <span></span></a>';
      slot.querySelector("small").textContent = t("Theme of the month");
      slot.querySelector("h3").textContent = th.title;
      slot.querySelector("p").textContent = th.text;
      slot.querySelector("a span").textContent = t("Join this month's theme");
    });
  }

  window.Features = { heartButton: heartButton, currentTheme: currentTheme, store: store, save: save, t: t };

  document.addEventListener("DOMContentLoaded", function () {
    renderThemeBanners();
    var y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
    var backTop = document.querySelector(".back-top");
    if (backTop) window.addEventListener("scroll", function () { backTop.classList.toggle("show", window.scrollY > 500); });
  });
})();
