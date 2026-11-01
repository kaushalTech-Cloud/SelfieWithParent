// Impact page — tile map, leaderboards, pledge and volunteer forms (design preview, sample data)
(function () {
  "use strict";
  function $(i) { return document.getElementById(i); }
  var t = Features.t;
  var loc = window.I18N ? I18N.locale : "en-IN";
  function fmt(n) { return n.toLocaleString(loc); }

  var states = window.STATE_COUNTS || [];
  var world = window.WORLD_COUNTS || [];
  var schools = window.SCHOOLS || [];
  var max = Math.max.apply(null, states.map(function (s) { return s[2]; }));

  // KPIs
  $("kTotal").textContent = fmt(states.reduce(function (a, s) { return a + s[2]; }, 0));
  $("kWorld").textContent = fmt(world.reduce(function (a, s) { return a + s[1]; }, 0));
  $("kStates").textContent = states.length;
  $("kSchools").textContent = fmt(schools.length * 37);

  // Colour scale: light teal → dark teal
  function colour(n) {
    var p = Math.sqrt(n / max);
    var from = [213, 236, 234], mid = [42, 157, 143], to = [10, 61, 62];
    var a = p < .5 ? from : mid, b = p < .5 ? mid : to, k = p < .5 ? p * 2 : (p - .5) * 2;
    return "rgb(" + a.map(function (v, i) { return Math.round(v + (b[i] - v) * k); }).join(",") + ")";
  }

  // Tile map
  var map = $("tileMap");
  var rows = 9, cols = 11, cells = {};
  states.forEach(function (s) { var p = window.STATE_TILES[s[1]]; if (p) cells[p[0] + "," + p[1]] = s; });
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var s = cells[c + "," + r];
      if (!s) { map.appendChild(document.createElement("span")); continue; }
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tile";
      b.textContent = s[1];
      b.style.background = colour(s[2]);
      if (s[2] / max < .25) b.style.color = "#0a3d3e";
      b.setAttribute("aria-label", s[0] + ": " + fmt(s[2]));
      b.title = s[0];
      (function (st, btn) {
        btn.addEventListener("click", function () {
          map.querySelectorAll(".tile.sel").forEach(function (x) { x.classList.remove("sel"); });
          btn.classList.add("sel");
          var rank = states.indexOf(st) + 1;
          $("stateDetail").innerHTML = "<strong></strong><span class=\"text-muted\"></span>";
          $("stateDetail").querySelector("strong").textContent = st[0];
          $("stateDetail").querySelector("span").textContent = t("{n} selfies · rank #{r}", { n: fmt(st[2]), r: rank });
        });
      })(s, b);
      map.appendChild(b);
    }
  }

  function rankList(el, items, label) {
    var top = items[0] ? items[0].v : 1;
    el.innerHTML = "";
    items.forEach(function (it) {
      var li = document.createElement("li");
      li.innerHTML = "<div><b></b><br><small></small></div><span class=\"fw-semibold\"></span><div class=\"meter\"><span></span></div>";
      li.querySelector("b").textContent = it.name;
      li.querySelector("small").textContent = it.sub || "";
      li.querySelector(".fw-semibold").textContent = fmt(it.v);
      li.querySelector(".meter span").style.width = Math.round(it.v / top * 100) + "%";
      el.appendChild(li);
    });
  }
  rankList($("topStates"), states.slice(0, 5).map(function (s) { return { name: s[0], v: s[2] }; }));
  rankList($("topWorld"), world.slice(0, 5).map(function (s) { return { name: s[0], v: s[1] }; }));

  // Schools with filter
  function showSchools(f) {
    var list = schools.filter(function (s) { return f === "all" || s.type === f; });
    rankList($("schoolList"), list.map(function (s) { return { name: s.name, sub: s.city + " · " + t(s.type), v: s.count }; }));
  }
  document.querySelectorAll("[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("[data-filter]").forEach(function (b) { b.className = "btn btn-sm btn-outline-accent"; });
      btn.className = "btn btn-sm btn-accent";
      showSchools(btn.dataset.filter);
    });
  });
  showSchools("all");

  // Pledge
  var base = 48213;
  var mine = Features.store("swp-pledge", null);
  function paintPledge() {
    $("pledgeCount").textContent = fmt(base + (mine ? 1 : 0));
    $("pledgeDone").hidden = !mine;
    $("pledgeBtn").disabled = !!mine;
    $("pledgeBtn").innerHTML = mine ? '<i class="bi bi-check2"></i> ' + t("Pledged") : '<i class="bi bi-hand-thumbs-up"></i> ' + t("I pledge");
    if (mine) {
      var r = document.querySelector("input[name=pledge][value=" + mine + "]");
      if (r) r.checked = true;
    }
  }
  $("pledgeBtn").addEventListener("click", function () {
    mine = document.querySelector("input[name=pledge]:checked").value;
    Features.save("swp-pledge", mine);
    paintPledge();
  });
  paintPledge();

  // Forms (preview: validate and show a thank-you)
  function previewForm(form, ok, after) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var note = form.querySelector(".form-note");
      if (!form.checkValidity()) {
        form.classList.add("was-validated");
        note.className = "form-note err";
        note.textContent = t("Please fill in the required fields.");
        return;
      }
      note.className = "form-note ok";
      note.textContent = t(ok);
      if (after) after();
      form.classList.remove("was-validated");
    });
  }
  previewForm($("adoptForm"), "Thank you! Our team will match you with an elder near you.", function () { $("adoptForm").reset(); });
  previewForm($("schoolForm"), "Registered! Share this code with your students.", function () {
    var name = $("sName").value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4) || "SWP";
    $("codeValue").textContent = name + "-" + Math.floor(1000 + Math.random() * 9000);
    $("classCode").hidden = false;
  });
})();
