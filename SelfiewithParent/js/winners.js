// Winners / Hall of Fame — renders window.WINNERS grouped by year
(function () {
  "use strict";

  var winners = (window.WINNERS || []).slice();
  var root = document.getElementById("winnersRoot");
  var tabs = document.getElementById("yearTabs");
  var search = document.getElementById("winnerSearch");
  var modal = new bootstrap.Modal(document.getElementById("winnerModal"));
  var toast = new bootstrap.Toast(document.getElementById("copyToast"), { delay: 1800 });

  var RANK_LABEL = { 1: "1st Place", 2: "2nd Place", 3: "3rd Place" };
  var RANK_ICON = { 1: "bi-trophy-fill", 2: "bi-award-fill", 3: "bi-award" };

  var years = Array.from(new Set(winners.map(function (w) { return w.year; }))).sort(function (a, b) { return b - a; });
  var state = { year: "all", q: "" };

  // Allow deep links: winners.html?year=2025#w-2025-1
  var params = new URLSearchParams(location.search);
  if (params.get("year") && years.indexOf(+params.get("year")) > -1) state.year = +params.get("year");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fmtDate(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString(window.I18N ? I18N.locale : "en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function idOf(w) { return "w-" + w.year + "-" + w.rank; }

  function shareUrl(w) {
    return location.origin + location.pathname + "?year=" + w.year + "#" + idOf(w);
  }

  function shareText(w) {
    return w.name + " — " + RANK_LABEL[w.rank] + ", Selfie with Parent " + w.year;
  }

  function shareLinks(w) {
    var u = encodeURIComponent(shareUrl(w));
    var t = encodeURIComponent(shareText(w));
    return [
      { label: "WhatsApp", icon: "bi-whatsapp", href: "https://wa.me/?text=" + t + "%20" + u },
      { label: "Facebook", icon: "bi-facebook", href: "https://www.facebook.com/sharer/sharer.php?u=" + u },
      { label: "X", icon: "bi-twitter-x", href: "https://twitter.com/intent/tweet?text=" + t + "&url=" + u },
      { label: "LinkedIn", icon: "bi-linkedin", href: "https://www.linkedin.com/sharing/share-offsite/?url=" + u }
    ];
  }

  function copyLink(w) {
    var url = shareUrl(w);
    var done = function () { toast.show(); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done);
    else { window.prompt(I18N.t("Copy this link"), url); }
  }

  function share(w) {
    // Native share sheet on phones; dropdown fallback elsewhere
    if (navigator.share) {
      navigator.share({ title: shareText(w), url: shareUrl(w) }).catch(function () {});
      return true;
    }
    return false;
  }

  function metaList(w) {
    var ul = el("ul", "meta-list");
    [
      ["bi-megaphone", "Campaign", w.campaign],
      ["bi-geo-alt", "From", [w.city, w.country].filter(Boolean).join(", ")],
      ["bi-calendar-event", "Announced", fmtDate(w.date)]
    ].forEach(function (m) {
      var li = el("li");
      li.appendChild(el("i", "bi " + m[0]));
      var span = el("span");
      span.appendChild(el("b", null, m[1] + ": "));
      span.appendChild(document.createTextNode(m[2]));
      li.appendChild(span);
      ul.appendChild(li);
    });
    return ul;
  }

  function card(w) {
    var col = el("div", "col-md-6 col-lg-4 rank-" + w.rank);
    col.id = idOf(w);
    col.setAttribute("data-aos", "fade-up");
    col.setAttribute("data-aos-delay", String((w.rank - 1) * 100));

    var c = el("article", "winner-card");

    var photoBtn = el("button", "winner-photo");
    photoBtn.type = "button";
    photoBtn.setAttribute("aria-label", "View " + w.name);
    var img = el("img");
    img.src = w.photo || "img/selfie-1.svg";
    img.alt = w.name;
    img.loading = "lazy";
    photoBtn.appendChild(img);
    var medal = el("span", "medal");
    medal.appendChild(el("i", "bi " + RANK_ICON[w.rank]));
    medal.appendChild(document.createTextNode(RANK_LABEL[w.rank]));
    photoBtn.appendChild(medal);
    photoBtn.addEventListener("click", function () { openDetail(w); });
    c.appendChild(photoBtn);

    var body = el("div", "winner-body");
    body.appendChild(el("h3", null, w.name));
    body.appendChild(metaList(w));

    var actions = el("div", "card-actions");
    var view = el("button", "btn btn-outline-accent", "View story");
    view.type = "button";
    view.addEventListener("click", function () { openDetail(w); });
    actions.appendChild(view);

    var dd = el("div", "dropdown");
    var shareBtn = el("button", "btn btn-outline-accent");
    shareBtn.type = "button";
    shareBtn.innerHTML = '<i class="bi bi-share"></i> Share';
    shareBtn.setAttribute("data-bs-toggle", "dropdown");
    shareBtn.setAttribute("aria-expanded", "false");
    shareBtn.addEventListener("click", function (e) {
      if (share(w)) { e.stopPropagation(); bootstrap.Dropdown.getOrCreateInstance(shareBtn).hide(); }
    });
    var menu = el("ul", "dropdown-menu share-menu");
    shareLinks(w).forEach(function (s) {
      var li = el("li");
      var a = el("a", "dropdown-item");
      a.href = s.href; a.target = "_blank"; a.rel = "noopener";
      a.innerHTML = '<i class="bi ' + s.icon + '"></i>';
      a.appendChild(document.createTextNode(s.label));
      li.appendChild(a);
      menu.appendChild(li);
    });
    var liCopy = el("li");
    var copy = el("button", "dropdown-item");
    copy.type = "button";
    copy.innerHTML = '<i class="bi bi-link-45deg"></i>Copy link';
    copy.addEventListener("click", function () { copyLink(w); });
    liCopy.appendChild(copy);
    menu.appendChild(liCopy);
    dd.appendChild(shareBtn);
    dd.appendChild(menu);
    actions.appendChild(dd);

    body.appendChild(actions);
    c.appendChild(body);
    col.appendChild(c);
    return col;
  }

  function openDetail(w) {
    document.getElementById("wmPhoto").src = w.photo || "img/selfie-1.svg";
    document.getElementById("wmPhoto").alt = w.name;
    document.getElementById("wmRank").textContent = I18N.t(RANK_LABEL[w.rank]) + " · " + w.year;
    document.getElementById("wmName").textContent = w.name;
    var meta = document.getElementById("wmMeta");
    meta.replaceWith(Object.assign(metaList(w), { id: "wmMeta" }));
    document.getElementById("wmStory").textContent = w.story || "";

    var row = document.getElementById("wmShare");
    row.innerHTML = "";
    shareLinks(w).forEach(function (s) {
      var a = el("a");
      a.href = s.href; a.target = "_blank"; a.rel = "noopener";
      a.setAttribute("aria-label", "Share on " + s.label);
      a.innerHTML = '<i class="bi ' + s.icon + '"></i>';
      row.appendChild(a);
    });
    var cp = el("button");
    cp.type = "button";
    cp.setAttribute("aria-label", "Copy link");
    cp.innerHTML = '<i class="bi bi-link-45deg"></i>';
    cp.addEventListener("click", function () { copyLink(w); });
    row.appendChild(cp);

    modal.show();
  }

  function renderTabs() {
    tabs.innerHTML = "";
    ["all"].concat(years).forEach(function (y) {
      var b = el("button", y === state.year ? "active" : "", y === "all" ? "All years" : String(y));
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", y === state.year ? "true" : "false");
      b.addEventListener("click", function () {
        state.year = y;
        var url = new URL(location.href);
        if (y === "all") url.searchParams.delete("year"); else url.searchParams.set("year", y);
        url.hash = "";
        history.replaceState(null, "", url);
        renderTabs();
        render();
      });
      tabs.appendChild(b);
    });
  }

  function matches(w) {
    if (state.year !== "all" && w.year !== state.year) return false;
    if (!state.q) return true;
    var hay = [w.name, w.campaign, w.city, w.country, String(w.year)].join(" ").toLowerCase();
    return hay.indexOf(state.q) > -1;
  }

  function render() {
    root.innerHTML = "";
    var container = el("div", "container");
    var shown = 0;

    years.forEach(function (y) {
      var list = winners.filter(function (w) { return w.year === y && matches(w); })
                        .sort(function (a, b) { return a.rank - b.rank; });
      if (!list.length) return;
      shown += list.length;

      var block = el("section", "year-block");
      var head = el("div", "year-heading");
      var h2 = el("h2", null, y + " ");
      h2.appendChild(el("span", null, "Winners"));
      head.appendChild(h2);
      block.appendChild(head);

      var row = el("div", "row g-4 podium justify-content-center");
      list.forEach(function (w) { row.appendChild(card(w)); });
      block.appendChild(row);
      container.appendChild(block);
    });

    if (!shown) {
      var empty = el("div", "empty-state");
      empty.innerHTML = '<i class="bi bi-emoji-frown"></i>';
      empty.appendChild(el("p", "mt-3", "No winners match your search."));
      container.appendChild(empty);
    }

    root.appendChild(container);
    if (window.AOS) AOS.refreshHard();
  }

  var t;
  search.addEventListener("input", function () {
    clearTimeout(t);
    t = setTimeout(function () { state.q = search.value.trim().toLowerCase(); render(); }, 150);
  });

  AOS.init({ once: true, duration: 700, offset: 40, disable: window.matchMedia("(prefers-reduced-motion: reduce)").matches });
  renderTabs();
  render();
  document.addEventListener("i18n:change", render); // dates follow the chosen language

  // Scroll to and highlight a shared winner
  if (location.hash) {
    var target = document.querySelector(location.hash);
    if (target) {
      setTimeout(function () { target.scrollIntoView({ behavior: "smooth", block: "center" }); }, 300);
      var w = winners.find(function (x) { return idOf(x) === location.hash.slice(1); });
      if (w) setTimeout(function () { openDetail(w); }, 900);
    }
  }

  var backTop = document.querySelector(".back-top");
  window.addEventListener("scroll", function () { backTop.classList.toggle("show", window.scrollY > 500); });
  document.getElementById("year").textContent = new Date().getFullYear();
})();
