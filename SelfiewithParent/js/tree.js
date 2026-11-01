// Family tree builder — draws three generations on a canvas; nothing leaves the browser
(function () {
  "use strict";
  function $(i) { return document.getElementById(i); }
  var t = Features.t;
  var W = 1600, H = 1200;

  // Layout: row 0 = grandparents, row 1 = parents, row 2 = you
  var MEMBERS = [
    { id: "pgf", role: "Grandfather", side: "Father's side", x: 230, y: 250 },
    { id: "pgm", role: "Grandmother", side: "Father's side", x: 530, y: 250 },
    { id: "mgf", role: "Grandfather", side: "Mother's side", x: 1070, y: 250 },
    { id: "mgm", role: "Grandmother", side: "Mother's side", x: 1370, y: 250 },
    { id: "fa", role: "Father", side: "", x: 380, y: 610 },
    { id: "mo", role: "Mother", side: "", x: 1220, y: 610 },
    { id: "me", role: "You", side: "", x: 800, y: 960 }
  ];
  var state = {};
  MEMBERS.forEach(function (m) { state[m.id] = { name: "", img: null }; });

  var canvas = $("treeCanvas"), ctx = canvas.getContext("2d");
  var SERIF = "'Playfair Display', Georgia, serif", SANS = "Poppins, Arial, sans-serif";
  function font() { return window.I18N ? I18N.fontStack : ""; }

  function cover(img, cx, cy, r) {
    var s = Math.max((r * 2) / img.naturalWidth, (r * 2) / img.naturalHeight);
    var w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  }

  function node(m) {
    var r = m.id === "me" ? 110 : 92, st = state[m.id];
    ctx.save();
    ctx.beginPath(); ctx.arc(m.x, m.y, r + 10, 0, Math.PI * 2);
    ctx.fillStyle = m.id === "me" ? "#f06543" : "#f4b942"; ctx.fill();
    ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = "#f6f1ea"; ctx.fill(); ctx.clip();
    if (st.img) cover(st.img, m.x, m.y, r);
    else {
      ctx.fillStyle = "#d8cbbb";
      ctx.beginPath(); ctx.arc(m.x, m.y - r * .2, r * .35, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(m.x, m.y + r * .75, r * .62, r * .5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.textAlign = "center";
    ctx.fillStyle = "#0a3d3e";
    ctx.font = "700 36px " + font() + SERIF;
    ctx.fillText(st.name || t(m.role), m.x, m.y + r + 58, 300);
    ctx.fillStyle = "#5d6b70";
    ctx.font = "500 24px " + font() + SANS;
    var sub = st.name ? t(m.role) : "";
    if (m.side) sub = (sub ? sub + " · " : "") + t(m.side);
    if (sub) ctx.fillText(sub, m.x, m.y + r + 94, 320);
  }

  function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#fffaf3"); g.addColorStop(1, "#f6f1ea");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#e3d9cc"; ctx.lineWidth = 16; ctx.strokeRect(8, 8, W - 16, H - 16);

    ctx.fillStyle = "#0a3d3e"; ctx.textAlign = "center";
    ctx.font = "700 56px " + font() + SERIF;
    ctx.fillText($("familyTitle").value.trim() || t("Our Family Tree"), W / 2, 95, W - 200);

    // branches
    ctx.strokeStyle = "#c9b79f"; ctx.lineWidth = 6; ctx.lineCap = "round";
    line(230, 250, 530, 250); line(380, 250, 380, 500);
    line(1070, 250, 1370, 250); line(1220, 250, 1220, 500);
    line(380, 610, 1220, 610); line(800, 610, 800, 840);

    MEMBERS.forEach(node);
    ctx.fillStyle = "#f06543"; ctx.font = "600 26px " + font() + SANS;
    ctx.fillText("#SelfieWithParent", W / 2, H - 40);
  }

  // Form rows
  var wrap = $("members");
  MEMBERS.forEach(function (m) {
    var row = document.createElement("div");
    row.className = "member";
    row.innerHTML =
      '<button type="button" class="pic"><i class="bi bi-camera"></i></button>' +
      '<div><small></small><input type="text" class="form-control" maxlength="30"></div>' +
      '<input type="file" accept="image/*" hidden>';
    var label = t(m.role) + (m.side ? " · " + t(m.side) : "");
    row.querySelector("small").textContent = label;
    var input = row.querySelector("input[type=text]");
    input.placeholder = t("Name");
    input.setAttribute("aria-label", label + " — " + t("Name"));
    row.querySelector(".pic").setAttribute("aria-label", t("Add photo") + ": " + label);
    var file = row.querySelector("input[type=file]");
    row.querySelector(".pic").addEventListener("click", function () { file.click(); });
    file.addEventListener("change", function () {
      var f = file.files[0];
      if (!f || !/^image\//.test(f.type)) return;
      var img = new Image();
      img.onload = function () {
        state[m.id].img = img;
        var pic = row.querySelector(".pic");
        pic.innerHTML = "";
        var thumb = document.createElement("img");
        thumb.src = img.src; thumb.alt = "";
        pic.appendChild(thumb);
        draw();
      };
      img.src = URL.createObjectURL(f);
      file.value = "";
    });
    input.addEventListener("input", function () { state[m.id].name = input.value.trim(); draw(); });
    wrap.appendChild(row);
  });

  $("familyTitle").addEventListener("input", draw);
  $("treeReset").addEventListener("click", function () {
    MEMBERS.forEach(function (m) { state[m.id] = { name: "", img: null }; });
    $("treeForm").reset();
    wrap.querySelectorAll(".pic").forEach(function (p) { p.innerHTML = '<i class="bi bi-camera"></i>'; });
    draw();
  });
  $("treeDownload").addEventListener("click", function () {
    canvas.toBlob(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "family-tree.png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }, "image/png");
  });

  draw();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  document.addEventListener("i18n:change", draw);
})();
