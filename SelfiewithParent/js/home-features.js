// Home page extras — question of the day and birthday/anniversary reminders (design preview)
(function () {
  "use strict";
  function $(i) { return document.getElementById(i); }
  var t = Features.t;

  // Question of the day — changes daily; "Another question" shuffles
  var qs = window.QUESTIONS || [];
  var day = Math.floor(Date.now() / 86400000);
  var qi = day % qs.length;
  function showQ() { $("dailyQuestion").textContent = "“" + qs[qi] + "”"; }
  $("nextQ").addEventListener("click", function () { qi = (qi + 1) % qs.length; showQ(); });
  $("askBtn").addEventListener("click", function () {
    var msg = qs[qi] + "\n\n— " + t("asked via Selfie with Parent");
    window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank", "noopener");
  });
  if (qs.length) showQ();

  // Reminders — kept in this browser for the preview
  var KEY = "swp-reminders";
  var list = Features.store(KEY, []);
  var loc = window.I18N ? I18N.locale : "en-IN";

  function daysUntil(iso) {
    var d = new Date(iso + "T00:00:00"), now = new Date();
    now.setHours(0, 0, 0, 0);
    var next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
    if (next < now) next.setFullYear(now.getFullYear() + 1);
    return Math.round((next - now) / 86400000);
  }

  function render() {
    var ul = $("reminderList");
    ul.innerHTML = "";
    list.slice().sort(function (a, b) { return daysUntil(a.date) - daysUntil(b.date); }).forEach(function (r) {
      var li = document.createElement("li");
      var n = daysUntil(r.date);
      li.innerHTML = '<i class="bi"></i><span><b></b> · <span class="text-muted"></span></span><span class="days"></span><button type="button"><i class="bi bi-x-lg"></i></button>';
      li.querySelector("i").className = "bi " + (r.type === "Anniversary" ? "bi-hearts" : "bi-cake2") + " text-accent";
      li.querySelector("b").textContent = r.name;
      li.querySelector(".text-muted").textContent = t(r.type) + ", " + new Date(r.date + "T00:00:00").toLocaleDateString(loc, { day: "numeric", month: "short" });
      li.querySelector(".days").textContent = n === 0 ? t("Today!") : t("in {n} days", { n: n });
      var del = li.querySelector("button");
      del.setAttribute("aria-label", t("Remove reminder") + ": " + r.name);
      del.addEventListener("click", function () {
        list = list.filter(function (x) { return x !== r; });
        Features.save(KEY, list); render();
      });
      ul.appendChild(li);
    });
  }

  $("reminderForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!this.checkValidity()) { this.classList.add("was-validated"); return; }
    list.push({ name: $("rName").value.trim(), date: $("rDate").value, type: $("rType").value });
    Features.save(KEY, list);
    this.reset(); this.classList.remove("was-validated");
    render();
  });
  render();
})();
