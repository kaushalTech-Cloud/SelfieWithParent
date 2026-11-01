// My account — profile, family, uploads, reminders, privacy (design preview, saved in this browser)
(function () {
  "use strict";
  var u = Auth.user();
  if (!u) return;
  function $(i) { return document.getElementById(i); }
  var t = function (s, v) { return window.I18N ? I18N.t(s, v) : s; };
  var params = new URLSearchParams(location.search);
  var next = params.get("next") || "";
  if (!/^[a-z0-9\-]+\.html(\?[^#]*)?$/i.test(next)) next = "";

  var STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
    "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
    "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra",
    "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];
  var COUNTRIES = "IN AE US GB CA AU SG SA QA KW OM BH NP BD LK MY NZ DE FR ES IT NL IE ZA KE NG JP".split(" ");

  // ----- Header -----
  function paintHead() {
    u = Auth.user();
    $("avatar").textContent = Auth.initials(u);
    $("helloName").textContent = u.name ? t("Hello, {name}", { name: u.name.split(" ")[0] }) : t("My account");
    $("signedInAs").textContent = u.method === "google"
      ? t("Signed in with Google")
      : t("Signed in with mobile {n}", { n: (u.dial || "+91") + " ••••• " + (u.mobileLast4 || "") });
  }
  paintHead();
  if (params.get("welcome") || !Auth.profileComplete()) $("welcomeBox").hidden = false;

  // ----- Profile -----
  var names;
  try { names = new Intl.DisplayNames([window.I18N ? I18N.lang : "en", "en"], { type: "region" }); } catch (e) { names = null; }
  $("pCountry").add(new Option(t("Choose country"), ""));
  COUNTRIES.map(function (c) { return { c: c, n: names ? names.of(c) : c }; })
    .sort(function (a, b) { return a.n.localeCompare(b.n); })
    .forEach(function (x) { $("pCountry").add(new Option(x.n, x.c)); });
  $("pState").add(new Option(t("Choose state / UT"), ""));
  STATES.forEach(function (s) { $("pState").add(new Option(s, s)); });
  if (window.I18N) Object.keys(I18N.languages).forEach(function (k) { $("pLang").add(new Option(I18N.languages[k].name, k)); });

  function onCountry() {
    var india = $("pCountry").value === "IN";
    $("pStateWrap").hidden = !india; $("pRegionWrap").hidden = india;
  }
  $("pCountry").addEventListener("change", onCountry);

  $("pName").value = u.name || "";
  $("pEmail").value = u.email || "";
  $("pCountry").value = u.country || "IN";
  $("pState").value = u.state || "";
  $("pRegion").value = u.region || "";
  $("pCity").value = u.city || "";
  $("pLang").value = u.lang || (window.I18N ? I18N.lang : "en");
  $("pAdult").checked = !!u.adultConfirmed;
  $("pUpdates").checked = !!u.updates;
  onCountry();

  $("profileForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!this.checkValidity()) { this.classList.add("was-validated"); return; }
    Auth.update({
      name: $("pName").value.trim(), email: $("pEmail").value.trim(), country: $("pCountry").value,
      state: $("pCountry").value === "IN" ? $("pState").value : "", region: $("pCountry").value === "IN" ? "" : $("pRegion").value.trim(),
      city: $("pCity").value.trim(), lang: $("pLang").value, adultConfirmed: $("pAdult").checked, updates: $("pUpdates").checked
    });
    if (window.I18N && $("pLang").value !== I18N.lang) I18N.setLanguage($("pLang").value, true);
    this.classList.remove("was-validated");
    paintHead();
    $("profileNote").className = "form-note ok";
    $("profileNote").textContent = t("Saved.");
    $("welcomeBox").hidden = true;
    // First-time setup done → take them back to what they were doing
    if (params.get("welcome") && next) setTimeout(function () { location.href = next; }, 600);
  });

  // ----- Family -----
  function paintFamily() {
    var list = (Auth.user().family || []);
    var ul = $("familyList");
    ul.innerHTML = "";
    if (!list.length) { var li = document.createElement("li"); li.className = "text-muted small"; li.textContent = t("No one added yet."); ul.appendChild(li); return; }
    list.forEach(function (m, i) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="fam-avatar" aria-hidden="true"></span><span><b></b><br><small class="text-muted"></small></span><button type="button" class="btn btn-sm btn-link text-danger ms-auto"><i class="bi bi-x-lg"></i></button>';
      li.querySelector(".fam-avatar").textContent = m.name.charAt(0).toUpperCase();
      li.querySelector("b").textContent = m.name;
      li.querySelector("small").textContent = t(m.relation);
      var del = li.querySelector("button");
      del.setAttribute("aria-label", t("Remove") + " " + m.name);
      del.addEventListener("click", function () {
        var fam = (Auth.user().family || []).slice(); fam.splice(i, 1);
        Auth.update({ family: fam }); paintFamily();
      });
      ul.appendChild(li);
    });
  }
  $("familyForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!this.checkValidity()) { this.classList.add("was-validated"); return; }
    var fam = (Auth.user().family || []).concat([{ name: $("fName").value.trim(), relation: $("fRel").value }]);
    Auth.update({ family: fam });
    this.reset(); this.classList.remove("was-validated");
    paintFamily();
  });
  paintFamily();

  // ----- Uploads (from this browser's submissions) -----
  var subs = Features.store("swp-submissions", []);
  var STATUS = { pending: ["In review", "bi-hourglass-split", "pending"], approved: ["Live in gallery", "bi-check-circle", "ok"], rejected: ["Not approved", "bi-x-circle", "no"] };
  var box = $("uploadList");
  if (!subs.length) {
    box.innerHTML = '<div class="empty-uploads"><i class="bi bi-camera"></i><p></p></div>';
    box.querySelector("p").textContent = t("You haven't shared anything yet. Your first selfie is a minute away!");
  } else {
    subs.forEach(function (s) {
      var st = STATUS[s.status] || STATUS.pending;
      var row = document.createElement("div");
      row.className = "upload-row";
      row.innerHTML = '<div class="up-icon"><i class="bi"></i></div><div><b></b><div class="small text-muted"></div></div><span class="up-status"><i class="bi"></i> <span></span></span>';
      row.querySelector(".up-icon i").className = "bi " + (s.media && s.media.indexOf("video") > -1 ? "bi-camera-video" : "bi-image");
      row.querySelector("b").textContent = (s.parentName || "") + (s.kind ? " · " + t({ real: "Selfie", ai: "AI-made", memory: "In loving memory", family: "Family" }[s.kind] || s.kind) : "");
      row.querySelector(".small").textContent = s.ref + " · " + new Date(s.submittedAt).toLocaleDateString(window.I18N ? I18N.locale : "en-IN", { day: "numeric", month: "short", year: "numeric" });
      var chip = row.querySelector(".up-status");
      chip.classList.add(st[2]);
      chip.querySelector("i").className = "bi " + st[1];
      chip.querySelector("span").textContent = t(st[0]);
      box.appendChild(row);
    });
  }

  // ----- Reminders -----
  var rems = Features.store("swp-reminders", []);
  var rl = $("accReminders");
  if (!rems.length) { var li = document.createElement("li"); li.className = "text-muted small bg-transparent p-0"; li.textContent = t("No reminders yet."); rl.appendChild(li); }
  rems.forEach(function (r) {
    var li = document.createElement("li");
    li.innerHTML = '<i class="bi bi-cake2 text-accent"></i><span><b></b> · <span class="text-muted"></span></span>';
    li.querySelector("b").textContent = r.name;
    li.querySelector(".text-muted").textContent = t(r.type) + ", " + new Date(r.date + "T00:00:00").toLocaleDateString(window.I18N ? I18N.locale : "en-IN", { day: "numeric", month: "short" });
    rl.appendChild(li);
  });

  // ----- Privacy & data -----
  $("downloadData").addEventListener("click", function () {
    var data = { account: Auth.user(), uploads: subs, reminders: rems, exportedAt: new Date().toISOString() };
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = "my-selfie-with-parent-data.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $("signOut").addEventListener("click", function () { Auth.signOut(); location.href = "index.html"; });
  $("confirmDelete").addEventListener("input", function () { $("doDelete").disabled = this.value.trim().toUpperCase() !== "DELETE"; });
  $("doDelete").addEventListener("click", function () { Auth.deleteAll(); location.href = "index.html?deleted=1"; });

  // Section nav highlight
  var links = document.querySelectorAll(".account-nav a");
  links.forEach(function (a) {
    a.addEventListener("click", function () { links.forEach(function (x) { x.classList.remove("active"); }); a.classList.add("active"); });
  });
})();
