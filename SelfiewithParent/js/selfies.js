// Latest selfies — tabs, grid, pagination, share and frame studio
(function () {
  "use strict";

  var PER_PAGE = 12;
  var TABS = [
    { id: "parent", label: "Selfie with Parent", icon: "bi-camera" },
    { id: "grand", label: "With Grandparents", icon: "bi-people" },
    { id: "ai", label: "AI Selfies", icon: "bi-stars" },
    { id: "family", label: "Family", icon: "bi-people-fill" },
    { id: "video", label: "Videos", icon: "bi-camera-video" }
  ];

  var all = window.SELFIES || [];
  var params = new URLSearchParams(location.search);
  var tab = TABS.some(function (t) { return t.id === params.get("tab"); }) ? params.get("tab") : TABS[0].id;
  var items = all.filter(function (s) { return s.tab === tab; });
  var pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  var page = Math.min(Math.max(parseInt(params.get("page"), 10) || 1, 1), pages);

  var toast = new bootstrap.Toast(document.getElementById("copyToast"), { delay: 1800 });

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function link(t, p) { return "selfies.html?tab=" + t + "&page=" + p; }

  // Tabs
  var tabsEl = document.getElementById("catTabs");
  TABS.forEach(function (t) {
    var a = el("a", t.id === tab ? "active" : "");
    a.href = link(t.id, 1);
    a.setAttribute("role", "tab");
    a.setAttribute("aria-selected", t.id === tab ? "true" : "false");
    a.innerHTML = '<i class="bi ' + t.icon + '"></i>';
    a.appendChild(document.createTextNode(t.label + " "));
    a.appendChild(el("span", "badge rounded-pill", String(all.filter(function (s) { return s.tab === t.id; }).length)));
    tabsEl.appendChild(a);
  });

  var current = TABS.find(function (t) { return t.id === tab; });
  document.getElementById("gridTitle").textContent = current.label;
  var start = (page - 1) * PER_PAGE;
  function showCount() {
    document.getElementById("gridCount").textContent = items.length
      ? I18N.t("Showing {from}–{to} of {total}", { from: start + 1, to: Math.min(start + PER_PAGE, items.length), total: items.length })
      : "";
  }
  showCount();

  // Share helpers
  function shareUrl(s) { return location.origin + location.pathname.replace(/[^/]*$/, "") + link(s.tab, page) + "#s-" + s.id; }
  function copy(url) {
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast.show(); });
    else window.prompt(I18N.t("Copy this link"), url);
  }
  function shareMenu(s) {
    var u = encodeURIComponent(shareUrl(s)), t = encodeURIComponent(s.name + " — Selfie with Parent");
    var ul = el("ul", "dropdown-menu dropdown-menu-end share-menu");
    [
      ["WhatsApp", "bi-whatsapp", "https://wa.me/?text=" + t + "%20" + u],
      ["Facebook", "bi-facebook", "https://www.facebook.com/sharer/sharer.php?u=" + u],
      ["X", "bi-twitter-x", "https://twitter.com/intent/tweet?text=" + t + "&url=" + u]
    ].forEach(function (x) {
      var li = el("li"), a = el("a", "dropdown-item");
      a.href = x[2]; a.target = "_blank"; a.rel = "noopener";
      a.innerHTML = '<i class="bi ' + x[1] + '"></i>';
      a.appendChild(document.createTextNode(x[0]));
      li.appendChild(a); ul.appendChild(li);
    });
    var li = el("li"), b = el("button", "dropdown-item");
    b.type = "button";
    b.innerHTML = '<i class="bi bi-link-45deg"></i>Copy link';
    b.addEventListener("click", function () { copy(shareUrl(s)); });
    li.appendChild(b); ul.appendChild(li);
    return ul;
  }

  // Grid
  var grid = document.getElementById("selfieGrid");
  var slice = items.slice(start, start + PER_PAGE);
  if (!slice.length) grid.appendChild(el("p", "text-center text-muted py-5", "No selfies here yet — be the first to share one!"));
  slice.forEach(function (s) {
    var col = el("div", "col-6 col-md-4 col-lg-3");
    col.id = "s-" + s.id;
    var card = el("article", "selfie-tile");

    var ph = el("div", "tile-photo");
    var img = el("img");
    img.src = s.photo; img.alt = s.name; img.loading = "lazy";
    // Photo opens the story page
    var photoLink = el("a", "tile-link");
    photoLink.href = "story.html?id=" + s.id;
    photoLink.setAttribute("aria-label", s.name);
    photoLink.appendChild(img);
    ph.appendChild(photoLink);
    if (s.tab === "ai") ph.appendChild(el("span", "tile-tag", "AI"));
    if (s.video !== undefined) {
      var play = el("button", "tile-play");
      play.type = "button";
      play.setAttribute("aria-label", "Play video");
      play.innerHTML = '<i class="bi bi-play-fill"></i>';
      play.addEventListener("click", function () { openVideo(s); });
      ph.appendChild(play);
      ph.appendChild(el("span", "tile-tag", Math.floor(s.duration / 60) + ":" + ("0" + (s.duration % 60)).slice(-2)));
    }

    var dd = el("div", "dropdown");
    var sb = el("button", "tile-share");
    sb.type = "button";
    sb.setAttribute("aria-label", "Share " + s.name);
    sb.innerHTML = '<i class="bi bi-share-fill"></i>';
    sb.addEventListener("click", function (e) {
      if (navigator.share) {
        e.stopPropagation();
        navigator.share({ title: s.name, url: shareUrl(s) }).catch(function () {});
      } else {
        bootstrap.Dropdown.getOrCreateInstance(sb).toggle();
      }
    });
    dd.appendChild(sb);
    dd.appendChild(shareMenu(s));
    ph.appendChild(dd);
    card.appendChild(ph);

    var body = el("div", "tile-body");
    var h = el("h3");
    var hl = el("a", null, s.name);
    hl.href = "story.html?id=" + s.id;
    h.appendChild(hl);
    var top = el("div", "tile-top");
    top.appendChild(h);
    if (window.Features) top.appendChild(Features.heartButton("s-" + s.id));
    body.appendChild(top);
    body.appendChild(el("small", null, s.city));
    var btn = el("button", "btn btn-outline-accent btn-sm");
    btn.type = "button";
    if (s.video !== undefined && s.tab === "video") {
      btn.innerHTML = '<i class="bi bi-play-circle"></i> Watch';
      btn.addEventListener("click", function () { openVideo(s); });
    } else {
      btn.innerHTML = '<i class="bi bi-palette"></i> Frames &amp; Download';
      btn.addEventListener("click", function () { openStudio(s.photo, s.name); });
    }
    if (s.tab === "family" && s.video !== undefined) {
      // family post with both: keep the frame button, add a separate watch button
      var watch = el("button", "btn btn-light btn-sm");
      watch.type = "button";
      watch.innerHTML = '<i class="bi bi-play-circle"></i> Watch';
      watch.addEventListener("click", function () { openVideo(s); });
      body.appendChild(watch);
    }
    body.appendChild(btn);
    card.appendChild(body);

    col.appendChild(card);
    grid.appendChild(col);
  });

  // Pager: « 1 2 3 … N »
  var pager = document.getElementById("pager");
  function pageItem(label, p, cls) {
    var li = el("li"), node;
    if (cls === "gap") node = el("span", "gap", "…");
    else {
      node = el("a", cls || "", label);
      node.href = link(tab, p);
      if (cls === "current") node.setAttribute("aria-current", "page");
    }
    li.appendChild(node); pager.appendChild(li);
  }
  if (pages > 1) {
    pageItem("‹", page - 1, page === 1 ? "disabled" : "");
    var shown = [1, page - 1, page, page + 1, pages].filter(function (p, i, a) { return p >= 1 && p <= pages && a.indexOf(p) === i; }).sort(function (a, b) { return a - b; });
    shown.forEach(function (p, i) {
      if (i && p - shown[i - 1] > 1) pageItem("", 0, "gap");
      pageItem(String(p), p, p === page ? "current" : "");
    });
    pageItem("›", page + 1, page === pages ? "disabled" : "");
  }

  // Video player
  var videoModalEl = document.getElementById("videoModal");
  var videoModal = new bootstrap.Modal(videoModalEl);
  var player = document.getElementById("videoPlayer");
  function openVideo(s) {
    document.getElementById("videoTitle").textContent = s.name;
    document.getElementById("videoCity").textContent = s.city;
    player.poster = s.photo;
    document.getElementById("videoNote").hidden = !!s.video;
    if (s.video) { player.src = s.video; player.hidden = false; }
    else { player.removeAttribute("src"); player.load(); }
    videoModal.show();
    if (s.video) player.play().catch(function () {});
  }
  videoModalEl.addEventListener("hidden.bs.modal", function () { player.pause(); });

  // Frame studio
  var modal = new bootstrap.Modal(document.getElementById("frameModal"));
  var canvas = document.getElementById("frameCanvas");
  var caption = document.getElementById("captionInput");
  var picker = document.getElementById("framePicker");
  var studio = { img: null, frame: Frames.list[0].id };

  function redraw() {
    if (!studio.img) return;
    Frames.render(canvas, studio.img, studio.frame, caption.value.trim());
  }

  function buildPicker() {
    picker.innerHTML = "";
    Frames.list.forEach(function (f) {
      var b = el("button", f.id === studio.frame ? "active" : "");
      b.type = "button";
      b.setAttribute("aria-pressed", f.id === studio.frame ? "true" : "false");
      var c = el("canvas");
      Frames.render(c, studio.img, f.id, caption.value.trim());
      b.appendChild(c);
      b.appendChild(document.createTextNode(f.label));
      b.addEventListener("click", function () { studio.frame = f.id; buildPicker(); redraw(); });
      picker.appendChild(b);
    });
  }

  function openStudio(src, name) {
    Frames.loadImage(src).then(function (img) {
      studio.img = img;
      caption.value = name || "";
      buildPicker();
      redraw();
      modal.show();
    });
  }

  var t;
  caption.addEventListener("input", function () {
    redraw();
    clearTimeout(t);
    t = setTimeout(buildPicker, 300);
  });

  function fileName() {
    return "selfie-with-parent-" + (caption.value.trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "frame") + ".png";
  }

  document.getElementById("downloadBtn").addEventListener("click", function () {
    canvas.toBlob(function (blob) {
      var a = el("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }, "image/png");
  });

  document.getElementById("shareImgBtn").addEventListener("click", function () {
    canvas.toBlob(function (blob) {
      var file = new File([blob], fileName(), { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: "Selfie with Parent" }).catch(function () {});
      } else {
        document.getElementById("downloadBtn").click();
      }
    }, "image/png");
  });

  // Upload your own photo (stays in the browser)
  document.getElementById("ownPhoto").addEventListener("change", function (e) {
    var f = e.target.files[0];
    if (!f) return;
    openStudio(URL.createObjectURL(f), "");
    e.target.value = "";
  });

  // Language switched: refresh the count and the frame text (fonts may still be loading)
  document.addEventListener("i18n:change", function () {
    showCount();
    var redrawAll = function () { if (studio.img) { buildPicker(); redraw(); } };
    redrawAll();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redrawAll);
  });

  // Highlight a shared selfie
  if (location.hash) {
    var target = document.querySelector(location.hash);
    if (target) setTimeout(function () { target.scrollIntoView({ behavior: "smooth", block: "center" }); }, 200);
  }

  var backTop = document.querySelector(".back-top");
  window.addEventListener("scroll", function () { backTop.classList.toggle("show", window.scrollY > 500); });
  document.getElementById("year").textContent = new Date().getFullYear();
})();
