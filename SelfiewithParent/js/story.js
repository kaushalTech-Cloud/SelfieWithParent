// Story page — one selfie with its message, voice note, hearts, sharing and certificate
(function () {
  "use strict";

  var TAB_LABEL = { parent: "Selfie with Parent", grand: "With Grandparents", ai: "AI Selfies", family: "Family", video: "Videos" };
  var SAMPLE_MESSAGES = [
    "She taught me to read before I went to school, and to listen before I speak.",
    "Every Sunday he still calls to ask if I've eaten. Today I called him first.",
    "Nani's hands smell of cardamom and coconut oil. This is how home smells.",
    "Three generations, one sofa, a hundred stories.",
    "We recreated the photo from my first birthday. Papa still makes the same face."
  ];

  var all = window.SELFIES || [];
  var id = +new URLSearchParams(location.search).get("id") || (all[0] && all[0].id);
  var s = all.find(function (x) { return x.id === id; }) || all[0];
  if (!s) return;
  var t = Features.t;
  function $(i) { return document.getElementById(i); }

  // Media: video if the post has one, otherwise the photo
  var media = $("storyMedia");
  if (s.video) {
    var v = document.createElement("video");
    v.controls = true; v.playsInline = true; v.poster = s.photo; v.src = s.video;
    media.appendChild(v);
  } else {
    var img = document.createElement("img");
    img.src = s.photo; img.alt = s.name;
    media.appendChild(img);
  }

  document.title = s.name + " | Selfie with Parent";
  // Per-story share tags. Note: WhatsApp/Facebook don't run JavaScript, so the backend must
  // write these into the HTML for each story; this keeps the browser view consistent meanwhile.
  function meta(prop, val) { var m = document.querySelector('meta[property="' + prop + '"]'); if (m) m.setAttribute("content", val); }
  meta("og:title", document.title);
  meta("og:url", location.href.split("#")[0]);
  $("crumbTab").textContent = TAB_LABEL[s.tab] || "";
  $("crumbTab").href = "selfies.html?tab=" + s.tab;
  $("crumbName").textContent = s.name;
  $("storyTab").textContent = TAB_LABEL[s.tab] || "";
  $("storyName").textContent = s.name;
  $("storyCity").textContent = s.city;
  var posted = new Date(Date.now() - (s.id % 40) * 86400000);
  $("storyDate").textContent = posted.toLocaleDateString(window.I18N ? I18N.locale : "en-IN", { day: "numeric", month: "short", year: "numeric" });
  $("storyMessage").textContent = "“" + SAMPLE_MESSAGES[s.id % SAMPLE_MESSAGES.length] + "”";
  $("frameLink").href = "selfies.html?tab=" + s.tab + "#s-" + s.id;
  $("heartSlot").appendChild(Features.heartButton("s-" + s.id));

  // Voice note preview — animates the waveform as if playing
  var wave = $("wave"), bars = [];
  for (var i = 0; i < 38; i++) {
    var b = document.createElement("span");
    b.style.height = (20 + Math.abs(Math.sin(i * 1.7 + s.id)) * 80) + "%";
    wave.appendChild(b); bars.push(b);
  }
  var playing = null, pos = 0, LEN = 28;
  $("voicePlay").addEventListener("click", function () {
    var btn = this;
    if (playing) { clearInterval(playing); playing = null; btn.innerHTML = '<i class="bi bi-play-fill"></i>'; return; }
    btn.innerHTML = '<i class="bi bi-pause-fill"></i>';
    btn.setAttribute("aria-label", t("Pause voice note"));
    playing = setInterval(function () {
      pos = (pos + 0.25) % (LEN + 0.25);
      $("voiceTime").textContent = "0:" + ("0" + Math.floor(pos)).slice(-2);
      var on = Math.round(pos / LEN * bars.length);
      bars.forEach(function (b, k) { b.classList.toggle("on", k < on); });
      if (pos >= LEN) { clearInterval(playing); playing = null; pos = 0; btn.innerHTML = '<i class="bi bi-play-fill"></i>'; }
    }, 250);
  });

  // Share
  var url = location.href.split("#")[0];
  var u = encodeURIComponent(url), txt = encodeURIComponent(s.name + " — Selfie with Parent");
  var toast = new bootstrap.Toast($("copyToast"), { delay: 1800 });
  [
    ["WhatsApp", "bi-whatsapp", "https://wa.me/?text=" + txt + "%20" + u],
    ["Facebook", "bi-facebook", "https://www.facebook.com/sharer/sharer.php?u=" + u],
    ["X", "bi-twitter-x", "https://twitter.com/intent/tweet?text=" + txt + "&url=" + u]
  ].forEach(function (x) {
    var li = document.createElement("li"), a = document.createElement("a");
    a.className = "dropdown-item"; a.href = x[2]; a.target = "_blank"; a.rel = "noopener";
    a.innerHTML = '<i class="bi ' + x[1] + '"></i> ';
    a.appendChild(document.createTextNode(x[0]));
    li.appendChild(a); $("shareMenu").appendChild(li);
  });
  var li = document.createElement("li"), cp = document.createElement("button");
  cp.type = "button"; cp.className = "dropdown-item";
  cp.innerHTML = '<i class="bi bi-link-45deg"></i> ';
  cp.appendChild(document.createTextNode("Copy link"));
  cp.addEventListener("click", function () {
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast.show(); });
    else window.prompt(t("Copy this link"), url);
  });
  li.appendChild(cp); $("shareMenu").appendChild(li);

  // Certificate
  $("certNames").textContent = s.name;
  $("certDate").textContent = new Date().toLocaleDateString(window.I18N ? I18N.locale : "en-IN", { day: "numeric", month: "long", year: "numeric" });

  // More stories from the same tab
  var more = all.filter(function (x) { return x.tab === s.tab && x.id !== s.id; }).slice(0, 4);
  more.forEach(function (m) {
    var col = document.createElement("div");
    col.className = "col-6 col-md-3";
    col.innerHTML = '<a class="selfie-tile text-decoration-none" href="story.html?id=' + m.id + '"><div class="tile-photo"><img alt="" loading="lazy"></div><div class="tile-body"><h3></h3><small></small></div></a>';
    col.querySelector("img").src = m.photo;
    col.querySelector("img").alt = m.name;
    col.querySelector("h3").textContent = m.name;
    col.querySelector("small").textContent = m.city;
    $("moreGrid").appendChild(col);
  });
})();
