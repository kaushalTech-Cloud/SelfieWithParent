// Then & Now — compare sliders, gallery and a side-by-side download (all in the browser)
(function () {
  "use strict";
  function $(i) { return document.getElementById(i); }
  var t = Features.t;

  function wire(compare) {
    var range = compare.querySelector("input[type=range]");
    range.addEventListener("input", function () { compare.style.setProperty("--pos", range.value + "%"); });
  }

  // Gallery
  (window.THEN_NOW || []).forEach(function (p, i) {
    var col = document.createElement("div");
    col.className = "col-sm-6 col-lg-3";
    col.innerHTML =
      '<article class="compare-card">' +
        '<div class="compare" style="--pos:50%">' +
          '<img alt=""><img alt="" class="then-layer">' +
          '<span class="tag then"></span><span class="tag now"></span>' +
          '<div class="divider"></div><div class="knob"><i class="bi bi-arrows"></i></div>' +
          '<input type="range" min="0" max="100" value="50">' +
        "</div>" +
        '<div class="info"><div><h3></h3><small></small></div><span class="heart-slot"></span></div>' +
      "</article>";
    var imgs = col.querySelectorAll("img");
    imgs[0].src = p.b; imgs[0].alt = p.name + " — " + p.now;
    imgs[1].src = p.a; imgs[1].alt = p.name + " — " + p.then;
    col.querySelector(".tag.then").textContent = p.then;
    col.querySelector(".tag.now").textContent = p.now;
    col.querySelector("input").setAttribute("aria-label", t("Compare then and now") + " — " + p.name);
    col.querySelector("h3").textContent = p.name;
    col.querySelector("small").textContent = p.city;
    col.querySelector(".heart-slot").appendChild(Features.heartButton("tn-" + i));
    wire(col.querySelector(".compare"));
    $("pairGrid").appendChild(col);
  });

  // Make your own
  var maker = $("makeCompare");
  wire(maker);
  var picked = { then: null, now: null };

  function slot(which, slotId, fileId, imgId) {
    $(slotId).addEventListener("click", function () { $(fileId).click(); });
    $(fileId).addEventListener("change", function () {
      var f = this.files[0];
      if (!f || !/^image\//.test(f.type)) return;
      var url = URL.createObjectURL(f);
      picked[which] = url;
      $(imgId).src = url;
      var s = $(slotId);
      s.innerHTML = "";
      var im = document.createElement("img");
      im.src = url; im.alt = "";
      s.appendChild(im);
      this.value = "";
    });
  }
  slot("then", "slotThen", "fileThen", "makeThen");
  slot("now", "slotNow", "fileNow", "makeNow");

  $("yearThen").addEventListener("input", function () { this.value = this.value.replace(/\D/g, ""); $("tagThen").textContent = this.value || t("Then"); });
  $("yearNow").addEventListener("input", function () { this.value = this.value.replace(/\D/g, ""); $("tagNow").textContent = this.value || t("Now"); });

  function cover(ctx, img, x, y, w, h) {
    var r = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / r, sh = h / r;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }

  $("downloadPair").addEventListener("click", function () {
    var W = 1600, H = 1100, c = document.createElement("canvas");
    c.width = W; c.height = H;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#0a3d3e"; ctx.fillRect(0, 0, W, H);
    var a = $("makeThen"), b = $("makeNow");
    ctx.save(); ctx.filter = "sepia(55%)"; cover(ctx, a, 60, 60, 720, 880); ctx.restore();
    cover(ctx, b, 820, 60, 720, 880);
    ctx.fillStyle = "#f4b942"; ctx.font = "700 46px 'Playfair Display', Georgia, serif"; ctx.textAlign = "center";
    ctx.fillText($("tagThen").textContent, 420, 1015);
    ctx.fillText($("tagNow").textContent, 1180, 1015);
    ctx.fillStyle = "#ffffff"; ctx.font = "500 30px Poppins, Arial, sans-serif";
    ctx.fillText("#SelfieWithParent · Then & Now", W / 2, 1070);
    c.toBlob(function (blob) {
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "then-and-now.png";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    }, "image/png");
  });
})();
