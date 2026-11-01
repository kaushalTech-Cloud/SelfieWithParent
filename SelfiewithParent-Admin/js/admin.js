// Admin dashboard (separate admin site) — design preview. Approve / reject / feature only change what's on screen.
(function () {
  "use strict";
  function $(i) { return document.getElementById(i); }

  var queue = (window.ADMIN_QUEUE || []).map(function (q) { return Object.assign({ status: "pending" }, q); });
  var filter = "all", q = "";
  var rejectModal = new bootstrap.Modal($("rejectModal"));
  var rejecting = null;

  function counts() {
    var pending = queue.filter(function (x) { return x.status === "pending"; }).length;
    $("kPending").textContent = pending;
    $("queueBadge").textContent = pending;
  }

  function matches(x) {
    if (filter === "video" && x.media.indexOf("video") < 0) return false;
    if (filter !== "all" && filter !== "video" && x.kind !== filter) return false;
    if (q && (x.name + " " + x.ref).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }

  function render() {
    var list = $("queueList");
    list.innerHTML = "";
    var shown = queue.filter(matches);
    shown.forEach(function (x) {
      var row = document.createElement("div");
      row.className = "queue-item" + (x.status !== "pending" ? " done" : "");
      row.innerHTML =
        '<img alt="">' +
        '<div><div class="fw-semibold"></div><div class="meta"></div><div class="mt-1 pills"></div></div>' +
        '<div class="acts">' +
          '<button class="btn btn-sm btn-success" data-act="approve" type="button"><i class="bi bi-check-lg"></i> Approve</button>' +
          '<button class="btn btn-sm btn-outline-warning" data-act="feature" type="button"><i class="bi bi-star"></i> Feature</button>' +
          '<button class="btn btn-sm btn-outline-danger" data-act="reject" type="button"><i class="bi bi-x-lg"></i></button>' +
        "</div>";
      row.querySelector("img").src = x.photo;
      row.querySelector("img").alt = x.name;
      row.querySelector(".fw-semibold").textContent = x.name + " · " + x.ref;
      row.querySelector(".meta").textContent = x.city + " · " + x.at;
      var pills = row.querySelector(".pills");
      [x.kind, x.media === "photo+video" ? "Photo + video" : x.media === "video" ? "Video" : "Photo"].forEach(function (p) {
        var s = document.createElement("span"); s.className = "pill"; s.textContent = p; pills.appendChild(s);
      });
      if (x.status !== "pending") {
        var chip = document.createElement("span");
        chip.className = "status-chip " + (x.status === "rejected" ? "no" : "ok");
        chip.textContent = x.status === "featured" ? "★ Featured" : x.status === "approved" ? "Approved" : "Rejected";
        pills.appendChild(chip);
      }
      row.querySelectorAll("[data-act]").forEach(function (b) {
        b.addEventListener("click", function () {
          var act = b.dataset.act;
          if (act === "reject") { rejecting = x; rejectModal.show(); return; }
          x.status = act === "feature" ? "featured" : "approved";
          render(); fillWinners();
        });
      });
      list.appendChild(row);
    });
    $("queueEmpty").hidden = queue.some(function (x) { return x.status === "pending"; });
    counts();
  }

  $("confirmReject").addEventListener("click", function () {
    if (rejecting) rejecting.status = "rejected";
    rejecting = null; rejectModal.hide(); render(); fillWinners();
  });

  document.querySelectorAll("[data-kind]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("[data-kind]").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active"); filter = b.dataset.kind; render();
    });
  });
  $("adminSearch").addEventListener("input", function () { q = this.value.trim().toLowerCase(); render(); });

  // Activity chart (sample)
  var days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], vals = [142, 168, 155, 201, 188, 264, 239];
  var peak = Math.max.apply(null, vals);
  days.forEach(function (d, i) {
    var bar = document.createElement("div");
    bar.style.height = Math.round(vals[i] / peak * 100) + "%";
    bar.title = d + ": " + vals[i];
    bar.innerHTML = "<span></span>";
    bar.querySelector("span").textContent = d;
    $("bars").appendChild(bar);
  });

  // Winners: approved + featured (sample past winners included so the picker isn't empty)
  function fillWinners() {
    var pool = queue.filter(function (x) { return x.status === "approved" || x.status === "featured"; })
      .map(function (x) { return x.name + " (" + x.ref + ")"; })
      .concat(window.PAST_WINNERS || []);
    document.querySelectorAll(".winner-pick").forEach(function (sel, i) {
      var keep = sel.value;
      sel.innerHTML = "";
      sel.add(new Option("Choose…", ""));
      pool.forEach(function (p) { sel.add(new Option(p, p)); });
      sel.value = pool.indexOf(keep) > -1 ? keep : "";
    });
  }
  $("announce").addEventListener("click", function () {
    var picks = ["w1", "w2", "w3"].map(function (id) { return $(id).value; });
    var note = $("announceNote");
    if (picks.some(function (p) { return !p; })) { note.className = "small mt-2 text-danger"; note.textContent = "Choose all three places first."; return; }
    if (new Set(picks).size < 3) { note.className = "small mt-2 text-danger"; note.textContent = "Each place needs a different winner."; return; }
    note.className = "small mt-2 text-success";
    note.textContent = "Preview ready: 🥇 " + picks[0] + " · 🥈 " + picks[1] + " · 🥉 " + picks[2] + ". (Publishing comes with the backend.)";
  });

  // Sidebar highlight
  document.querySelectorAll(".admin-side a.link[href^='#']").forEach(function (a) {
    a.addEventListener("click", function () {
      document.querySelectorAll(".admin-side a.link").forEach(function (x) { x.classList.remove("active"); });
      a.classList.add("active");
    });
  });

  // "View public site" goes to the separate public website
  $("publicLink").href = (window.ADMIN_CONFIG && ADMIN_CONFIG.publicSiteUrl) || "/";

  render(); fillWinners();
})();
