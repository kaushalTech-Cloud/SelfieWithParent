// Sign-in — mobile number → 6-digit code (design preview: any 6 digits work, nothing is sent)
(function () {
  "use strict";
  function $(i) { return document.getElementById(i); }
  var t = function (s, v) { return window.I18N ? I18N.t(s, v) : s; };

  // Only allow returning to pages on this site
  var next = new URLSearchParams(location.search).get("next") || "";
  if (!/^[a-z0-9\-]+\.html(\?[^#]*)?$/i.test(next)) next = "";

  function finish() {
    // First sign-in → complete the profile once; afterwards go straight back
    if (!Auth.profileComplete()) location.href = "account.html?welcome=1" + (next ? "&next=" + encodeURIComponent(next) : "");
    else location.href = next || "account.html";
  }

  if (Auth.isSignedIn() && Auth.profileComplete()) { location.replace(next || "account.html"); return; }

  // ----- Step 1: mobile -----
  var digits = "", dial = "+91", via = "sms";
  function validPhone() {
    return dial === "+91" ? /^[6-9]\d{9}$/.test(digits) : /^\d{6,14}$/.test(digits);
  }
  $("phone").addEventListener("input", function () { this.value = this.value.replace(/[^\d\s]/g, "").slice(0, 16); $("phoneError").hidden = true; });

  $("phoneForm").addEventListener("submit", function (e) {
    e.preventDefault();
    digits = $("phone").value.replace(/\D/g, "");
    dial = $("dial").value;
    via = this.querySelector("input[name=via]:checked").value;
    if (!validPhone()) { $("phoneError").textContent = t("Enter a valid mobile number."); $("phoneError").hidden = false; $("phone").focus(); return; }
    // Backend: POST the number, send an OTP by SMS/WhatsApp, rate-limit requests.
    $("sentTo").textContent = dial + " ••••• " + digits.slice(-4);
    $("sentVia").textContent = via === "whatsapp" ? t("on WhatsApp") : t("by SMS");
    $("phoneForm").hidden = true;
    $("otpForm").hidden = false;
    boxes[0].focus();
    startTimer();
  });

  $("changePhone").addEventListener("click", function () {
    $("otpForm").hidden = true; $("phoneForm").hidden = false; $("phone").focus();
  });

  // ----- Step 2: code boxes -----
  var wrap = $("otpBoxes"), boxes = [];
  for (var i = 0; i < 6; i++) {
    var b = document.createElement("input");
    b.className = "otp-box"; b.type = "text"; b.inputMode = "numeric"; b.maxLength = 1;
    b.autocomplete = i === 0 ? "one-time-code" : "off";
    b.setAttribute("aria-label", t("Digit {n}", { n: i + 1 }));
    wrap.appendChild(b); boxes.push(b);
  }
  boxes.forEach(function (b, i) {
    b.addEventListener("input", function () {
      b.value = b.value.replace(/\D/g, "").slice(-1);
      $("otpError").hidden = true;
      if (b.value && i < 5) boxes[i + 1].focus();
      if (code().length === 6) $("otpForm").requestSubmit();
    });
    b.addEventListener("keydown", function (e) {
      if (e.key === "Backspace" && !b.value && i > 0) boxes[i - 1].focus();
      if (e.key === "ArrowLeft" && i > 0) boxes[i - 1].focus();
      if (e.key === "ArrowRight" && i < 5) boxes[i + 1].focus();
    });
    b.addEventListener("paste", function (e) {
      var text = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
      if (!text) return;
      e.preventDefault();
      text.split("").forEach(function (d, k) { if (boxes[k]) boxes[k].value = d; });
      (boxes[text.length] || boxes[5]).focus();
      if (text.length === 6) $("otpForm").requestSubmit();
    });
  });
  function code() { return boxes.map(function (b) { return b.value; }).join(""); }

  var timer = null;
  function startTimer() {
    var s = 30;
    clearInterval(timer);
    $("resendWait").hidden = false; $("resendBtn").hidden = true;
    $("resendSecs").textContent = s;
    timer = setInterval(function () {
      s--; $("resendSecs").textContent = s;
      if (s <= 0) { clearInterval(timer); $("resendWait").hidden = true; $("resendBtn").hidden = false; }
    }, 1000);
  }
  $("resendBtn").addEventListener("click", function () { boxes.forEach(function (b) { b.value = ""; }); boxes[0].focus(); startTimer(); });

  $("otpForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (code().length !== 6) { $("otpError").textContent = t("Please enter all 6 digits."); $("otpError").hidden = false; return; }
    // Backend: verify the code server-side, then set a secure session cookie.
    $("verifyBtn").disabled = true;
    $("verifyBtn").innerHTML = '<span class="spinner-border spinner-border-sm"></span> ' + t("Verifying…");
    Auth.signIn({ method: "mobile", dial: dial, mobileLast4: digits.slice(-4) });
    setTimeout(finish, 500);
  });

  // ----- Google -----
  $("googleBtn").addEventListener("click", function () {
    // Backend: Google sign-in (OAuth) — returns the visitor's name and verified email.
    Auth.signIn({ method: "google" });
    finish();
  });
})();
