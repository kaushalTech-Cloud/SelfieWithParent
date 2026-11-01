// Shared site header (top bar + main menu) — edit the menu here and every page updates.
// Each page has <div id="siteHeader"></div> followed by <script src="js/nav.js"></script>,
// so the header is in place before translation and page scripts run.
(function () {
  "use strict";

  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var onHome = page === "index.html" || page === "";
  var params = new URLSearchParams(location.search);

  // Home-page sections: plain anchors on the home page, full links elsewhere
  function home(hash) { return (onHome ? "" : "index.html") + hash; }

  var MENU = [
    { label: "Home", href: home("#home"), match: onHome },
    { label: "About", match: ["about.html", "founder.html", "journey.html", "what-we-do.html"].indexOf(page) > -1, items: [
      { label: "About Us", href: "about.html" },
      { label: "Our Founder", href: "founder.html" },
      { label: "Our Journey", href: "journey.html" },
      { label: "What We Do", href: "what-we-do.html" }
    ] },
    { label: "Selfie", match: page === "upload.html", items: [
      { label: "Upload a Selfie", href: "upload.html" },
      { label: "Upload a Family Photo / Video", href: "upload.html?kind=family" },
      // On the home page this opens the quick upload pop-up; elsewhere it opens the form in AI mode
      onHome
        ? { label: "Create an AI Selfie", href: "#", attrs: 'data-bs-toggle="modal" data-bs-target="#uploadModal" data-mode="ai"' }
        : { label: "Create an AI Selfie", href: "upload.html?kind=ai" },
      { label: "Latest Selfies", href: "selfies.html" }
    ] },
    { label: "Selfies", href: "selfies.html", match: page === "selfies.html" },
    { label: "Winners", href: "winners.html", match: page === "winners.html" },
    { label: "Impact", href: "impact.html", match: page === "impact.html" },
    { label: "Community", match: ["then-now.html", "memories.html", "tree.html", "story.html"].indexOf(page) > -1, items: [
      { label: "Featured Stories", href: home("#gallery") },
      { label: "Then & Now", href: "then-now.html" },
      { label: "Memory Wall", href: "memories.html" },
      { label: "Family Tree", href: "tree.html" },
      { label: "Campaign Map", href: "impact.html#map" },
      { label: "School Challenge", href: "impact.html#schools" },
      { label: "Adopt a Grandparent", href: "impact.html#adopt" }
    ] },
    { label: "Contact", href: home("#contact") }
  ];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function item(m) {
    var active = m.match ? " active" : "";
    var current = m.match ? ' aria-current="page"' : "";
    if (!m.items) {
      return '<li class="nav-item"><a class="nav-link' + active + '" href="' + esc(m.href) + '"' + current + ">" + esc(m.label) + "</a></li>";
    }
    return '<li class="nav-item dropdown">' +
      '<a class="nav-link dropdown-toggle' + active + '" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">' + esc(m.label) + "</a>" +
      '<ul class="dropdown-menu">' + m.items.map(function (s) {
        return '<li><a class="dropdown-item" href="' + esc(s.href) + '"' + (s.attrs ? " " + s.attrs : "") + ">" + esc(s.label) + "</a></li>";
      }).join("") + "</ul></li>";
  }

  var ctaActive = page === "upload.html" && !params.get("kind") ? " active" : "";

  // Account: "Sign in" for visitors, name + menu once signed in (js/auth.js)
  var user = window.Auth && Auth.user();
  var accountItem = user
    ? '<li class="nav-item dropdown user-menu ms-lg-2">' +
        '<a class="nav-link dropdown-toggle' + (page === "account.html" ? " active" : "") + '" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">' +
          '<span class="avatar-sm" aria-hidden="true">' + esc(Auth.initials(user)) + "</span>" +
          '<span class="user-name">' + esc((user.name || "My account").split(" ")[0]) + "</span>" +
        "</a>" +
        '<ul class="dropdown-menu dropdown-menu-end">' +
          '<li><a class="dropdown-item" href="account.html#profile"><i class="bi bi-person me-2"></i>My account</a></li>' +
          '<li><a class="dropdown-item" href="account.html#uploads"><i class="bi bi-images me-2"></i>My uploads</a></li>' +
          '<li><a class="dropdown-item" href="account.html#family"><i class="bi bi-people me-2"></i>My family</a></li>' +
          '<li><hr class="dropdown-divider"></li>' +
          '<li><button class="dropdown-item" type="button" id="navSignOut"><i class="bi bi-box-arrow-right me-2"></i>Sign out</button></li>' +
        "</ul></li>"
    : '<li class="nav-item ms-lg-1"><a class="nav-link nav-signin' + (page === "login.html" ? " active" : "") + '" href="login.html' +
        (page && page !== "login.html" && page !== "index.html" ? "?next=" + encodeURIComponent(page + location.search) : "") +
        '"><i class="bi bi-person-circle"></i> Sign in</a></li>';

  var html =
    // First thing keyboard / screen-reader users reach: jump past the menu
    '<a class="skip-link" href="#main">Skip to content</a>' +
    '<div class="topbar">' +
      '<div class="container d-flex justify-content-end gap-4">' +
        '<a href="mailto:hello@selfiewithparent.org"><i class="bi bi-envelope"></i> hello@selfiewithparent.org</a>' +
        '<a href="tel:+910000000000" class="d-none d-sm-inline"><i class="bi bi-telephone"></i> +91-00000-00000</a>' +
      "</div>" +
    "</div>" +
    // expand-xl: below 1200px the full menu doesn't fit, so it collapses behind the menu button
    '<nav class="navbar navbar-expand-xl sticky-top main-nav">' +
      '<div class="container">' +
        '<a class="navbar-brand" href="' + home("#home") + '"><img src="img/logo.svg" alt="Selfie with Parent" height="52"></a>' +
        '<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainMenu" aria-controls="mainMenu" aria-expanded="false" aria-label="Toggle menu">' +
          '<i class="bi bi-list"></i>' +
        "</button>" +
        '<div class="collapse navbar-collapse" id="mainMenu">' +
          '<ul class="navbar-nav ms-auto align-items-lg-center">' +
            MENU.map(item).join("") +
            accountItem +
            '<li class="nav-item ms-lg-2"><a class="btn btn-accent btn-sm nav-cta' + ctaActive + '" href="upload.html"><i class="bi bi-upload"></i> Share a Selfie</a></li>' +
          "</ul>" +
        "</div>" +
      "</div>" +
    "</nav>";

  var slot = document.getElementById("siteHeader");
  if (slot) slot.outerHTML = html;

  // Make sure every page's main content can be reached by the skip link
  document.addEventListener("DOMContentLoaded", function () {
    var main = document.querySelector("main");
    if (main && !main.id) main.id = "main";
    if (main && !main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    var skip = document.querySelector(".skip-link");
    if (skip && main) skip.setAttribute("href", "#" + main.id);
    var out = document.getElementById("navSignOut");
    if (out) out.addEventListener("click", function () { Auth.signOut(); location.href = "index.html"; });
  });

  // Close the mobile menu after a link is picked (pages without main.js need this too)
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("#mainMenu a:not(.dropdown-toggle)");
    var menu = document.getElementById("mainMenu");
    if (a && menu && menu.classList.contains("show") && window.bootstrap) bootstrap.Collapse.getOrCreateInstance(menu).hide();
  });
})();
