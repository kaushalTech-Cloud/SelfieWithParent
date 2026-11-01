// Photo frames — draws a photo + caption onto a canvas. All designs are original to Selfie with Parent.
(function () {
  "use strict";

  var W = 1080, H = 1350;

  function cover(ctx, img, x, y, w, h) {
    var r = Math.max(w / img.width, h / img.height);
    var sw = w / r, sh = h / r;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function heart(ctx, x, y, s, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + s * .3);
    ctx.bezierCurveTo(x, y, x - s * .5, y, x - s * .5, y + s * .3);
    ctx.bezierCurveTo(x - s * .5, y + s * .6, x, y + s * .8, x, y + s);
    ctx.bezierCurveTo(x, y + s * .8, x + s * .5, y + s * .6, x + s * .5, y + s * .3);
    ctx.bezierCurveTo(x + s * .5, y, x, y, x, y + s * .3);
    ctx.fill();
    ctx.restore();
  }

  function fitText(ctx, text, maxW, size, weight, family) {
    do { ctx.font = weight + " " + size + "px " + family; size -= 2; } while (ctx.measureText(text).width > maxW && size > 20);
  }

  function tr(text) { return window.I18N ? I18N.t(text) : text; }
  function serif() { return (window.I18N ? I18N.fontStack : "") + "'Playfair Display', Georgia, serif"; }
  function sans() { return (window.I18N ? I18N.fontStack : "") + "Poppins, Arial, sans-serif"; }

  var FRAMES = [
    {
      id: "classic", label: "Classic",
      draw: function (ctx, img, name) {
        ctx.fillStyle = "#f6f1ea"; ctx.fillRect(0, 0, W, H);
        cover(ctx, img, 60, 60, W - 120, 1000);
        ctx.fillStyle = "#0f5b5c"; ctx.fillRect(0, 1090, W, 260);
        ctx.fillStyle = "#f4b942"; ctx.fillRect(0, 1090, W, 10);
        ctx.fillStyle = "#fff"; ctx.textAlign = "center";
        fitText(ctx, name, W - 160, 64, "700", serif());
        ctx.fillText(name, W / 2, 1200);
        ctx.font = "500 34px " + sans(); ctx.fillStyle = "#f4b942";
        ctx.fillText("#SelfieWithParent", W / 2, 1275);
      }
    },
    {
      id: "sunrise", label: "Sunrise",
      draw: function (ctx, img, name) {
        var g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, "#f06543"); g.addColorStop(1, "#f4b942");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.save(); roundRect(ctx, 90, 110, W - 180, 960, 60); ctx.clip(); cover(ctx, img, 90, 110, W - 180, 960); ctx.restore();
        ctx.lineWidth = 12; ctx.strokeStyle = "#fff"; roundRect(ctx, 90, 110, W - 180, 960, 60); ctx.stroke();
        heart(ctx, 120, 40, 60, "#fff"); heart(ctx, W - 130, 1020, 80, "#fff"); heart(ctx, W - 210, 50, 40, "rgba(255,255,255,.7)");
        ctx.fillStyle = "#fff"; ctx.textAlign = "center";
        fitText(ctx, name, W - 160, 70, "700", serif());
        ctx.fillText(name, W / 2, 1185);
        ctx.font = "italic 600 36px " + serif();
        ctx.fillText(tr("They held my hand first"), W / 2, 1260);
      }
    },
    {
      id: "polaroid", label: "Snapshot",
      draw: function (ctx, img, name) {
        ctx.fillStyle = "#d5ecea"; ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.translate(W / 2, H / 2); ctx.rotate(-0.035); ctx.translate(-W / 2, -H / 2);
        ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
        ctx.fillStyle = "#fff"; ctx.fillRect(110, 90, W - 220, H - 180);
        ctx.shadowColor = "transparent";
        cover(ctx, img, 150, 130, W - 300, 860);
        ctx.fillStyle = "#1f2a2e"; ctx.textAlign = "center";
        fitText(ctx, name, W - 340, 60, "italic 700", serif());
        ctx.fillText(name, W / 2, 1100);
        ctx.font = "500 30px " + sans(); ctx.fillStyle = "#5d6b70";
        ctx.fillText("Selfie with Parent · " + new Date().getFullYear(), W / 2, 1165);
        ctx.restore();
        ctx.fillStyle = "rgba(244,185,66,.85)"; ctx.save(); ctx.translate(W / 2, 95); ctx.rotate(0.05);
        ctx.fillRect(-110, -28, 220, 56); ctx.restore();
      }
    },
    {
      id: "festive", label: "Festive",
      draw: function (ctx, img, name) {
        ctx.fillStyle = "#0a3d3e"; ctx.fillRect(0, 0, W, H);
        var colors = ["#f4b942", "#f06543", "#2a9d8f", "#ffffff"];
        for (var i = 0; i < 90; i++) {
          ctx.fillStyle = colors[i % 4]; ctx.globalAlpha = .7;
          ctx.beginPath(); ctx.arc((i * 137) % W, (i * 89) % H, 6 + (i % 4) * 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.save(); ctx.beginPath(); ctx.arc(W / 2, 560, 400, 0, Math.PI * 2); ctx.clip();
        cover(ctx, img, W / 2 - 400, 160, 800, 800); ctx.restore();
        ctx.lineWidth = 16; ctx.strokeStyle = "#f4b942"; ctx.beginPath(); ctx.arc(W / 2, 560, 408, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#f4b942"; ctx.textAlign = "center";
        ctx.font = "600 34px " + sans(); ctx.fillText(tr("CELEBRATING"), W / 2, 1080);
        ctx.fillStyle = "#fff";
        fitText(ctx, name, W - 160, 72, "700", serif());
        ctx.fillText(name, W / 2, 1170);
        ctx.font = "500 32px " + sans(); ctx.fillStyle = "#d5ecea";
        ctx.fillText("#SelfieWithParent", W / 2, 1245);
      }
    }
  ];

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  window.Frames = {
    list: FRAMES,
    width: W,
    height: H,
    render: function (canvas, img, frameId, name) {
      canvas.width = W; canvas.height = H;
      var f = FRAMES.find(function (x) { return x.id === frameId; }) || FRAMES[0];
      f.draw(canvas.getContext("2d"), img, name || "");
    },
    loadImage: loadImage
  };
})();
