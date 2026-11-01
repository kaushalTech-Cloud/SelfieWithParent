// Share a selfie — 3-step form with photo checks, client-side resize and review
(function () {
  "use strict";

  // Set this to your backend endpoint to receive submissions (multipart/form-data).
  // Left empty, submissions are kept in this browser only (demo mode).
  var SUBMIT_URL = "";

  var MAX_BYTES = 10 * 1024 * 1024;
  var MAX_SIDE = 1600;           // photos are resized to this longest side before sending
  var TYPES = ["image/jpeg", "image/png", "image/webp"];

  var INDIA_STATES = [
    "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
    "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana",
    "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
    "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry",
    "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
  ];
  // Dial codes for common countries; others fall back to free entry
  var DIAL = { IN: "+91", US: "+1", CA: "+1", GB: "+44", AE: "+971", AU: "+61", SG: "+65", NP: "+977", BD: "+880", LK: "+94", SA: "+966", QA: "+974", KW: "+965", OM: "+968", MY: "+60", NZ: "+64", DE: "+49", FR: "+33" };
  var SAMPLE_PROMPT = "A warm, natural selfie of a smiling adult child and their elderly mother sitting close together at home, soft daylight, realistic photo, both faces clearly visible.";

  var form = document.getElementById("uploadForm");
  var steps = [].slice.call(form.querySelectorAll(".step"));
  var stepperItems = [].slice.call(document.querySelectorAll("#stepper li"));
  var current = 1;
  var photos = { main: null, source: null }; // { blob, url, name }

  function $(id) { return document.getElementById(id); }

  // ---------- Selects ----------
  // Country names come from the browser in the visitor's language
  var COUNTRY_CODES = "AF AL DZ AD AO AR AM AU AT AZ BH BD BY BE BT BO BA BW BR BN BG KH CM CA CL CN CO CR HR CU CY CZ DK DO EC EG SV EE ET FJ FI FR GE DE GH GR GT GY HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KW KG LA LV LB LY LT LU MO MY MV MT MU MX MD MC MN ME MA MZ MM NA NP NL NZ NI NG MK NO OM PK PA PG PY PE PH PL PT QA RO RU RW SA SN RS SC SG SK SI ZA KR ES LK SD SR SE CH SY TW TJ TZ TH TT TN TR TM UG UA AE GB US UY UZ VE VN YE ZM ZW".split(" ");
  function fillCountries() {
    var sel = $("country"), keep = sel.value || "IN";
    var names;
    try { names = new Intl.DisplayNames([I18N.lang, "en"], { type: "region" }); } catch (e) { names = null; }
    var list = COUNTRY_CODES.map(function (c) { return { code: c, name: names ? names.of(c) : c }; })
                            .sort(function (a, b) { return a.name.localeCompare(b.name, I18N.locale); });
    sel.innerHTML = "";
    sel.add(new Option(I18N.t("Choose country"), ""));
    list.forEach(function (c) { sel.add(new Option(c.name, c.code)); });
    sel.value = keep;
  }
  $("country").setAttribute("data-i18n-skip", "");
  $("state").setAttribute("data-i18n-skip", ""); // official state names stay as written
  fillCountries();

  (function fillStates() {
    var sel = $("state");
    sel.add(new Option(I18N.t("Choose state / UT"), ""));
    INDIA_STATES.forEach(function (s) { sel.add(new Option(s, s)); });
  })();

  (function fillYears() {
    var sel = $("memoryYear"), y = new Date().getFullYear();
    sel.add(new Option("Prefer not to say", ""));
    for (var i = y; i >= y - 60; i--) sel.add(new Option(String(i), String(i)));
  })();

  function onCountry() {
    var c = $("country").value, india = c === "IN";
    $("stateWrap").hidden = !india;
    $("state").required = india;
    $("regionWrap").hidden = india;
    $("dialCode").textContent = DIAL[c] || "+";
    $("mobileError").textContent = I18N.t(india ? "Enter a valid 10-digit mobile number." : "Enter a valid phone number (6–15 digits).");
  }
  $("country").addEventListener("change", function () {
    onCountry();
    I18N.suggestFor($("country").value); // e.g. picking Bangladesh offers বাংলা
  });
  onCountry();

  document.addEventListener("i18n:change", function () {
    fillCountries();
    onCountry();
    $("state").options[0].text = I18N.t("Choose state / UT");
    if (current === 3) buildReview();
  });

  // ---------- Photo type ----------
  function kind() { return form.querySelector("input[name=kind]:checked").value; }
  function onKind() {
    var k = kind();
    $("aiNote").hidden = k !== "ai";
    $("sourceWrap").hidden = k !== "ai";
    $("memoryYearWrap").hidden = k !== "memory";
    var fam = k === "family";
    $("mainPhotoLabel").innerHTML = I18N.t(fam ? "Family photo" : k === "memory" ? "A favourite photo together" : k === "ai" ? "Your AI-made photo" : "Your selfie") + (fam ? "" : " <b>*</b>");
    $("videoLabel").innerHTML = I18N.t(fam ? "Family video" : "Your video message") + (fam ? "" : " <b>*</b>");

    // Family: name the family instead of one parent, and say who's in it
    $("parentLabel").innerHTML = I18N.t(fam ? "Family name" : "Parent / grandparent's name") + " <b>*</b>";
    $("parentName").placeholder = fam ? I18N.t("e.g. The Sharma family") : "";
    $("relationWrap").hidden = fam;
    $("relation").required = !fam;
    $("familySizeWrap").hidden = !fam;
    $("familySize").required = fam;
    $("generationsWrap").hidden = !fam;
    if (typeof onMedia === "function" && $("mediaToggle")) onMedia();
  }
  [].forEach.call(form.querySelectorAll("input[name=kind]"), function (r) { r.addEventListener("change", onKind); });
  onKind();

  var toast = new bootstrap.Toast($("copyToast"), { delay: 1600 });
  $("copyPrompt").addEventListener("click", function () {
    if (navigator.clipboard) navigator.clipboard.writeText(SAMPLE_PROMPT).then(function () { toast.show(); });
    else window.prompt(I18N.t("Copy this prompt"), SAMPLE_PROMPT);
  });

  // ---------- Mobile ----------
  function validMobile() {
    var v = $("mobile").value.replace(/\D/g, "");
    return $("country").value === "IN" ? /^[6-9]\d{9}$/.test(v) : /^\d{6,15}$/.test(v);
  }
  $("mobile").addEventListener("input", function () {
    this.value = this.value.replace(/[^\d\s-]/g, "").slice(0, 18);
    this.setCustomValidity(this.value && !validMobile() ? "invalid" : "");
  });

  // ---------- Dropzones ----------
  function resize(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        if (scale === 1 && file.type === "image/jpeg" && file.size < 2 * 1024 * 1024) { resolve({ blob: file, url: url, w: img.width, h: img.height }); return; }
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { resolve({ blob: b, url: URL.createObjectURL(b), w: c.width, h: c.height }); }, "image/jpeg", 0.88);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
      img.src = url;
    });
  }

  function setupDZ(zoneId, inputId, key) {
    var zone = $(zoneId), input = $(inputId);
    var empty = zone.querySelector(".dz-empty"), prev = zone.querySelector(".dz-preview"), rm = zone.querySelector(".dz-remove");

    function show(p) {
      empty.hidden = !!p; prev.hidden = !p; rm.hidden = !p;
      if (p) prev.src = p.url; else prev.removeAttribute("src");
    }
    function take(file) {
      if (!file) return;
      var err = key === "main" ? $("photoError") : null;
      var fail = function (msg) { if (err) { err.textContent = msg; err.hidden = false; zone.classList.add("invalid"); } else alert(msg); };
      if (TYPES.indexOf(file.type) < 0) return fail("Please choose a JPG, PNG or WebP image.");
      if (file.size > MAX_BYTES) return fail("That photo is larger than 10 MB. Please pick a smaller one.");
      resize(file).then(function (r) {
        if (Math.min(r.w, r.h) < 300) return fail("That photo is very small. Please use one at least 300 px wide.");
        if (photos[key]) URL.revokeObjectURL(photos[key].url);
        photos[key] = { blob: r.blob, url: r.url, name: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
        if (err) { err.hidden = true; zone.classList.remove("invalid"); }
        show(photos[key]);
      }, function () { fail("We couldn't read that image. Please try another."); });
    }

    zone.addEventListener("click", function (e) { if (!rm.contains(e.target)) input.click(); });
    zone.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    input.addEventListener("change", function () { take(input.files[0]); input.value = ""; });
    ["dragenter", "dragover"].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add("drag"); }); });
    ["dragleave", "drop"].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove("drag"); }); });
    zone.addEventListener("drop", function (e) { take(e.dataTransfer.files[0]); });
    rm.addEventListener("click", function (e) {
      e.stopPropagation();
      if (photos[key]) URL.revokeObjectURL(photos[key].url);
      photos[key] = null; show(null);
    });
  }
  setupDZ("dzMain", "photoMain", "main");
  setupDZ("dzSource", "photoSource", "source");

  $("message").addEventListener("input", function () { $("msgCount").textContent = this.value.length; });

  // ---------- Video ----------
  var VIDEO_MAX_BYTES = 50 * 1024 * 1024;
  var VIDEO_MAX_SECONDS = 60;
  var VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
  var video = null; // { blob, url, name, duration, thumb: { blob, url } }

  // "photo", "video", or "both" (family posts can carry a photo and a video together)
  function media() { return kind() === "family" ? "both" : form.querySelector("input[name=media]:checked").value; }
  function onMedia() {
    var m = media();
    $("familyNote").hidden = m !== "both";
    $("mediaToggle").hidden = m === "both";
    $("useVideo").hidden = m === "both";
    $("videoBlock").hidden = m === "photo";
    $("photoBlock").hidden = m === "video";
    if (m === "photo" && cam) closeCamera();
  }
  [].forEach.call(form.querySelectorAll("input[name=media]"), function (r) { r.addEventListener("change", onMedia); });

  function chooseMedia(m) {
    form.querySelector("input[name=media][value=" + m + "]").checked = true;
    onMedia();
  }
  $("useVideo").addEventListener("click", function () { chooseMedia("video"); $("dzVideo").focus(); });
  // Links like upload.html?media=video or ?kind=family open with that option selected
  var qs = new URLSearchParams(location.search);
  if (qs.get("media") === "video") chooseMedia("video");
  var qKind = form.querySelector("input[name=kind][value='" + (qs.get("kind") || "").replace(/[^a-z]/g, "") + "']");
  if (qKind) { qKind.checked = true; onKind(); }

  function fmtTime(s) { s = Math.round(s); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }

  // Grab a frame ~1s in to use as the gallery thumbnail
  function makeThumb(url) {
    return new Promise(function (resolve) {
      var v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
      var fallback = setTimeout(function () { resolve(null); }, 6000);
      v.addEventListener("loadeddata", function () {
        v.currentTime = Math.min(1, (isFinite(v.duration) ? v.duration : 2) / 2);
      }, { once: true });
      v.addEventListener("seeked", function () {
        clearTimeout(fallback);
        var scale = Math.min(1, 960 / Math.max(v.videoWidth, v.videoHeight || 1));
        var c = document.createElement("canvas");
        c.width = Math.round(v.videoWidth * scale) || 640; c.height = Math.round(v.videoHeight * scale) || 360;
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        c.toBlob(function (b) { resolve(b ? { blob: b, url: URL.createObjectURL(b) } : null); }, "image/jpeg", 0.85);
      }, { once: true });
      v.addEventListener("error", function () { clearTimeout(fallback); resolve(null); }, { once: true });
    });
  }

  // Recorded WebM files often report Infinity duration until seeked to the end
  function readDuration(url) {
    return new Promise(function (resolve, reject) {
      var v = document.createElement("video");
      v.preload = "metadata"; v.muted = true; v.src = url;
      v.addEventListener("loadedmetadata", function () {
        if (isFinite(v.duration)) return resolve(v.duration);
        v.currentTime = 1e7;
        v.addEventListener("timeupdate", function () { v.currentTime = 0; resolve(v.duration); }, { once: true });
      }, { once: true });
      v.addEventListener("error", function () { reject(new Error("unreadable")); }, { once: true });
    });
  }

  var dzV = $("dzVideo"), vEmpty = dzV.querySelector(".dz-empty"), vPrev = dzV.querySelector(".dz-video"), vRm = dzV.querySelector(".dz-remove");

  function showVideo() {
    vEmpty.hidden = !!video; vPrev.hidden = !video; vRm.hidden = !video;
    $("videoMeta").hidden = !video;
    if (video) {
      vPrev.src = video.url;
      if (video.thumb) vPrev.poster = video.thumb.url;
      $("videoMeta").innerHTML = '<i class="bi bi-clock"></i> ' + fmtTime(video.duration) +
        ' · <i class="bi bi-hdd"></i> ' + (video.blob.size / 1048576).toFixed(1) + " MB";
    } else { vPrev.removeAttribute("src"); vPrev.removeAttribute("poster"); vPrev.load(); }
  }

  function videoFail(msg) {
    $("videoError").textContent = I18N.t(msg);
    $("videoError").hidden = false;
    dzV.classList.add("invalid");
  }

  function clearVideo() {
    if (video) { URL.revokeObjectURL(video.url); if (video.thumb) URL.revokeObjectURL(video.thumb.url); }
    video = null; showVideo();
  }

  function takeVideo(blob, name) {
    if (!blob) return;
    var type = (blob.type || "").split(";")[0];
    if (VIDEO_TYPES.indexOf(type) < 0) return videoFail("Please choose an MP4, WebM or MOV video.");
    if (blob.size > VIDEO_MAX_BYTES) return videoFail("That video is larger than 50 MB. Please trim it or pick a shorter one.");
    var url = URL.createObjectURL(blob);
    readDuration(url).then(function (d) {
      if (d > VIDEO_MAX_SECONDS + 0.5) { URL.revokeObjectURL(url); return videoFail("Videos can be up to 60 seconds long. Please trim it and try again."); }
      return makeThumb(url).then(function (thumb) {
        clearVideo();
        video = { blob: blob, url: url, name: name, duration: d, thumb: thumb };
        $("videoError").hidden = true; dzV.classList.remove("invalid");
        showVideo();
      });
    }, function () { URL.revokeObjectURL(url); videoFail("We couldn't play that video. Please try another."); });
  }

  dzV.addEventListener("click", function (e) { if (!vRm.contains(e.target) && !video) $("videoFile").click(); });
  dzV.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && !video) { e.preventDefault(); $("videoFile").click(); } });
  $("videoFile").addEventListener("change", function () { var f = this.files[0]; if (f) takeVideo(f, f.name); this.value = ""; });
  ["dragenter", "dragover"].forEach(function (ev) { dzV.addEventListener(ev, function (e) { e.preventDefault(); dzV.classList.add("drag"); }); });
  ["dragleave", "drop"].forEach(function (ev) { dzV.addEventListener(ev, function (e) { e.preventDefault(); dzV.classList.remove("drag"); }); });
  dzV.addEventListener("drop", function (e) { var f = e.dataTransfer.files[0]; if (f) takeVideo(f, f.name); });
  vRm.addEventListener("click", function (e) { e.stopPropagation(); clearVideo(); });

  // ---------- Camera recording ----------
  var cam = { stream: null, rec: null, chunks: [], facing: "user", timer: null, started: 0 };

  function pickMime() {
    var opts = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    for (var i = 0; i < opts.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported(opts[i])) return opts[i];
    return "";
  }

  function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      return videoFail("Recording isn't supported in this browser. Please upload a video instead.");
    }
    closeCamera();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: cam.facing, width: { ideal: 1280 } }, audio: true })
      .then(function (s) {
        cam.stream = s;
        $("camPreview").srcObject = s;
        $("recorder").hidden = false;
        $("recordOpen").hidden = true;
        $("recorder").scrollIntoView({ behavior: "smooth", block: "center" });
      }, function () { videoFail("We couldn't open your camera. Please allow camera and microphone access, or upload a video instead."); });
  }

  function closeCamera() {
    if (cam.rec && cam.rec.state === "recording") { cam.discard = true; cam.rec.stop(); }
    if (cam.stream) cam.stream.getTracks().forEach(function (t) { t.stop(); });
    cam.stream = null;
    clearInterval(cam.timer);
    $("recorder").hidden = true;
    $("recordOpen").hidden = false;
    $("recBadge").hidden = true;
    $("recToggle").classList.remove("recording");
  }

  function startRec() {
    var mime = pickMime();
    cam.chunks = []; cam.discard = false;
    cam.rec = new MediaRecorder(cam.stream, mime ? { mimeType: mime, videoBitsPerSecond: 2500000 } : undefined);
    cam.rec.ondataavailable = function (e) { if (e.data && e.data.size) cam.chunks.push(e.data); };
    cam.rec.onstop = function () {
      clearInterval(cam.timer);
      if (cam.discard) return;
      var type = (cam.rec.mimeType || "video/webm").split(";")[0];
      var blob = new Blob(cam.chunks, { type: type });
      closeCamera();
      takeVideo(blob, "recording." + (type === "video/mp4" ? "mp4" : "webm"));
    };
    cam.rec.start(250);
    cam.started = Date.now();
    $("recBadge").hidden = false;
    $("recTime").textContent = "0:00";
    $("recToggle").classList.add("recording");
    $("recToggle").setAttribute("aria-label", I18N.t("Stop recording"));
    cam.timer = setInterval(function () {
      var s = (Date.now() - cam.started) / 1000;
      $("recTime").textContent = fmtTime(Math.min(s, VIDEO_MAX_SECONDS));
      if (s >= VIDEO_MAX_SECONDS) cam.rec.stop();
    }, 250);
  }

  $("recordOpen").addEventListener("click", openCamera);
  $("recClose").addEventListener("click", closeCamera);
  $("camSwitch").addEventListener("click", function () { cam.facing = cam.facing === "user" ? "environment" : "user"; openCamera(); });
  $("recToggle").addEventListener("click", function () {
    if (cam.rec && cam.rec.state === "recording") cam.rec.stop(); else if (cam.stream) startRec();
  });
  window.addEventListener("pagehide", closeCamera);

  // ---------- Voice note ----------
  var voice = null; // { blob, url, seconds }
  var vrec = { stream: null, rec: null, chunks: [], timer: null, started: 0 };

  function voiceUI(state) {
    $("voiceStart").hidden = state === "recording";
    $("voiceStop").hidden = state !== "recording";
    $("voiceDot").hidden = state !== "recording";
    $("voiceTimer").hidden = state !== "recording";
    $("voiceRemove").hidden = !voice;
    $("voicePlayback").hidden = !voice;
    $("voiceStart").innerHTML = '<i class="bi bi-mic-fill"></i> ' + I18N.t(voice ? "Record again" : "Record voice note");
  }

  function voiceFail(msg) { $("voiceError").textContent = I18N.t(msg); $("voiceError").hidden = false; }

  $("voiceStart").addEventListener("click", function () {
    $("voiceError").hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      return voiceFail("Recording isn't supported in this browser.");
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      vrec.stream = stream; vrec.chunks = [];
      var mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(function (m) { return MediaRecorder.isTypeSupported(m); }) || "";
      vrec.rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      vrec.rec.ondataavailable = function (e) { if (e.data && e.data.size) vrec.chunks.push(e.data); };
      vrec.rec.onstop = function () {
        clearInterval(vrec.timer);
        stream.getTracks().forEach(function (tr) { tr.stop(); });
        var type = (vrec.rec.mimeType || "audio/webm").split(";")[0];
        if (voice) URL.revokeObjectURL(voice.url);
        var blob = new Blob(vrec.chunks, { type: type });
        voice = { blob: blob, url: URL.createObjectURL(blob), seconds: Math.round((Date.now() - vrec.started) / 1000), type: type };
        $("voicePlayback").src = voice.url;
        voiceUI("done");
      };
      vrec.rec.start(250);
      vrec.started = Date.now();
      $("voiceTimer").textContent = "0:00";
      vrec.timer = setInterval(function () {
        var s = Math.floor((Date.now() - vrec.started) / 1000);
        $("voiceTimer").textContent = fmtTime(Math.min(s, 60)) + " / 1:00";
        if (s >= 60) vrec.rec.stop();
      }, 250);
      voiceUI("recording");
    }, function () { voiceFail("We couldn't use your microphone. Please allow microphone access and try again."); });
  });
  $("voiceStop").addEventListener("click", function () { if (vrec.rec && vrec.rec.state === "recording") vrec.rec.stop(); });
  $("voiceRemove").addEventListener("click", function () {
    if (voice) URL.revokeObjectURL(voice.url);
    voice = null; $("voicePlayback").removeAttribute("src"); voiceUI("idle");
  });
  voiceUI("idle");

  // ---------- Age + parental consent ----------
  function adult() { var r = form.querySelector("input[name=adult]:checked"); return r ? r.value : ""; }
  function onAge() {
    var minor = adult() === "no";
    $("guardianBox").hidden = !minor;
    $("ageError").hidden = true;
  }
  [].forEach.call(form.querySelectorAll("input[name=adult]"), function (r) { r.addEventListener("change", onAge); });
  $("guardianMobile").addEventListener("input", function () {
    this.value = this.value.replace(/[^\d\s-]/g, "").slice(0, 18);
    var digits = this.value.replace(/\D/g, "");
    this.setCustomValidity(digits && !/^\d{6,15}$/.test(digits) ? "invalid" : "");
  });

  // ---------- Signed-in visitors (js/auth.js) ----------
  // Uploading needs an account. Signed-in adults get their details filled in; mobile, email
  // and the age question are covered by the account, so those fields are hidden.
  (function accountSetup() {
    var card = document.querySelector(".upload-card");
    if (!window.Auth) return;
    if (!Auth.isSignedIn()) {
      form.hidden = true;
      $("stepper").hidden = true;
      var gate = document.createElement("div");
      gate.className = "signin-gate";
      gate.innerHTML = '<div class="gate-icon"><i class="bi bi-person-check"></i></div><h2 class="h4"></h2><p></p>' +
        '<a class="btn btn-accent btn-lg"><i class="bi bi-phone"></i> <span></span></a>' +
        '<div class="small text-muted mt-3"></div>';
      gate.querySelector("h2").textContent = I18N.t("Sign in to share your selfie");
      gate.querySelector("p").textContent = I18N.t("It takes a few seconds with your mobile number — and next time, your details fill in by themselves.");
      gate.querySelector("a").href = Auth.loginUrl("upload.html" + location.search);
      gate.querySelector("a span").textContent = I18N.t("Sign in with mobile");
      gate.querySelector(".small").textContent = I18N.t("Under 18? Ask a parent or guardian to sign in and share for you.");
      card.insertBefore(gate, card.firstChild);
      return;
    }
    if (!Auth.profileComplete()) {
      location.replace("account.html?welcome=1&next=" + encodeURIComponent("upload.html" + location.search));
      return;
    }

    var u = Auth.user();
    // Fill in from the profile
    $("yourName").value = u.name || "";
    if (u.country) { $("country").value = u.country; onCountry(); }
    if (u.state) $("state").value = u.state;
    if (u.region) $("region").value = u.region;
    if (u.city) $("city").value = u.city;
    $("email").value = u.email || "";

    // The account already has a verified mobile, the email and an 18+ confirmation
    $("mobile").closest(".col-md-6").hidden = true;
    $("email").closest(".col-md-6").hidden = true;
    form.querySelector("input[name=adult][value=yes]").checked = true;
    onAge();
    document.querySelector(".age-check").hidden = true;

    // "Uploading as …" bar
    var bar = document.createElement("div");
    bar.className = "signed-bar";
    bar.innerHTML = '<span class="avatar-sm" aria-hidden="true"></span><span><b></b><br><small class="text-muted"></small></span>' +
      '<a class="ms-auto small" href="account.html#profile"></a>';
    bar.querySelector(".avatar-sm").textContent = Auth.initials(u);
    bar.querySelector("b").textContent = I18N.t("Uploading as {name}", { name: u.name });
    bar.querySelector("small").textContent = u.method === "google"
      ? I18N.t("Signed in with Google")
      : I18N.t("Verified mobile {n}", { n: (u.dial || "+91") + " ••••• " + (u.mobileLast4 || "") });
    bar.querySelector("a").textContent = I18N.t("Change details");
    steps[0].insertBefore(bar, steps[0].firstChild);

    // One tap to pick a saved family member
    var fam = u.family || [];
    if (fam.length) {
      var chips = document.createElement("div");
      chips.className = "fam-chips";
      var lbl = document.createElement("span");
      lbl.className = "small text-muted me-1";
      lbl.textContent = I18N.t("From your family:");
      chips.appendChild(lbl);
      fam.forEach(function (m) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-sm btn-outline-accent";
        b.textContent = m.name;
        b.addEventListener("click", function () {
          $("parentName").value = m.name;
          var opt = [].find.call($("relation").options, function (o) { return o.value === m.relation; });
          if (opt) $("relation").value = m.relation;
        });
        chips.appendChild(b);
      });
      $("parentName").parentNode.appendChild(chips);
    }
  })();

  // ---------- Steps ----------
  function validateStep(n) {
    var ok = true;
    if (n === 1) {
      var fields = steps[0].querySelectorAll("input:not([type=radio]), select");
      [].forEach.call(fields, function (f) {
        if (f.closest("[hidden]")) return;
        if (f.id === "mobile") f.setCustomValidity(validMobile() ? "" : "invalid");
        if (!f.checkValidity()) ok = false;
      });
      steps[0].classList.add("was-validated");
      if (!adult()) { $("ageError").textContent = I18N.t("Please tell us whether you are 18 or older."); $("ageError").hidden = false; ok = false; }
      if (adult() === "no" && !$("guardianConsent").checked) ok = false;
    }
    if (n === 2 && media() === "both" && !photos.main && !video) {
      $("photoError").textContent = I18N.t("Please add a family photo, a family video, or both.");
      $("photoError").hidden = false;
      $("dzMain").classList.add("invalid");
      ok = false;
    }
    if (n === 2 && media() === "photo" && !photos.main) {
      $("photoError").textContent = I18N.t("Please add a photo to continue.");
      $("photoError").hidden = false;
      $("dzMain").classList.add("invalid");
      ok = false;
    }
    if (n === 2 && media() === "video" && !video) {
      videoFail("Please add or record a video to continue.");
      ok = false;
    }
    if (!ok) {
      var bad = steps[n - 1].querySelector(":invalid:not(fieldset), .invalid");
      if (bad) { bad.scrollIntoView({ behavior: "smooth", block: "center" }); if (bad.focus) bad.focus({ preventScroll: true }); }
    }
    return ok;
  }

  function go(n) {
    current = n;
    steps.forEach(function (s, i) { s.classList.toggle("active", i === n - 1); });
    stepperItems.forEach(function (li, i) {
      li.classList.toggle("active", i === n - 1);
      li.classList.toggle("done", i < n - 1);
      if (i === n - 1) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    if (n === 3) buildReview();
    document.querySelector(".upload-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("click", function (e) {
    var t = e.target.closest("[data-next],[data-back],[data-goto]");
    if (!t) return;
    if (t.hasAttribute("data-next") && validateStep(current)) go(current + 1);
    if (t.hasAttribute("data-back")) go(current - 1);
    if (t.hasAttribute("data-goto")) go(+t.getAttribute("data-goto"));
  });

  // ---------- Review ----------
  var KIND_LABEL = { real: "Selfie", ai: "AI-made", memory: "In loving memory", family: "Family" };

  function values() {
    var c = $("country");
    var india = c.value === "IN";
    return {
      kind: kind(),
      yourName: $("yourName").value.trim(),
      parentName: $("parentName").value.trim(),
      relation: kind() === "family" ? "Family" : $("relation").value,
      familySize: kind() === "family" ? $("familySize").value : "",
      generations: kind() === "family" ? $("generations").value : "",
      memoryYear: kind() === "memory" ? $("memoryYear").value : "",
      country: c.options[c.selectedIndex] ? c.options[c.selectedIndex].text : "",
      countryCode: c.value,
      state: india ? $("state").value : $("region").value.trim(),
      city: $("city").value.trim(),
      mobile: $("dialCode").textContent + " " + $("mobile").value.replace(/\D/g, ""),
      email: $("email").value.trim(),
      adult: adult(),
      guardianName: adult() === "no" ? $("guardianName").value.trim() : "",
      guardianMobile: adult() === "no" ? $("guardianMobile").value.replace(/\D/g, "") : "",
      guardianConsent: adult() === "no" ? $("guardianConsent").checked : "",
      message: $("message").value.trim()
    };
  }

  function buildReview() {
    var v = values();
    var t = I18N.t;
    var m = media();
    var showVideo = (m === "video" || m === "both") && video;
    var showPhoto = (m === "photo" || m === "both") && photos.main;
    $("reviewImg").hidden = !showPhoto;
    $("reviewVideo").hidden = !showVideo;
    if (showPhoto) $("reviewImg").src = photos.main.url;
    if (showVideo) {
      if ($("reviewVideo").src !== video.url) $("reviewVideo").src = video.url;
      if (video.thumb) $("reviewVideo").poster = video.thumb.url;
    } else { $("reviewVideo").pause(); }
    document.querySelector(".review-photo").classList.toggle("has-both", !!(showPhoto && showVideo));
    $("reviewTag").textContent = t(KIND_LABEL[v.kind]) + (showVideo ? " · " + t("Video") + " " + fmtTime(video.duration) : "");
    var withText = v.kind === "family"
      ? v.parentName + " · " + t("{n} people", { n: v.familySize }) + (v.generations ? " · " + t("{n} generations", { n: v.generations }) : "")
      : v.parentName + " (" + t(v.relation) + ")" + (v.memoryYear ? " · " + t("remembered since {year}", { year: v.memoryYear }) : "");
    var rows = [
      ["Shared by", v.yourName],
      ["With", withText],
      ["From", [v.city, v.state, v.country].filter(Boolean).join(", ")],
      ["Mobile", v.mobile + " " + t("(private)")],
      ["Email", v.email || "—"],
      ["Message", v.message || "—"]
    ];
    if (v.kind === "ai") rows.push(["Original photo", t(photos.source ? "Attached" : "Not added")]);
    if (v.adult === "no") rows.push(["Parent / guardian", v.guardianName + " · " + t("will confirm by one-time code")]);
    rows.push(["Voice note", voice ? t("Attached") + " (" + fmtTime(voice.seconds) + ")" : t("Not added")]);
    if (m === "both") {
      rows.push(["Photo", t(photos.main ? "Attached" : "Not added")]);
      rows.push(["Video", video ? t("Attached") + " (" + fmtTime(video.duration) + ")" : t("Not added")]);
    }
    var dl = $("reviewList");
    dl.innerHTML = "";
    rows.forEach(function (r) {
      var dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = r[0]; dd.textContent = r[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });
  }

  // ---------- Submit ----------
  function refId() {
    return "SWP-" + Date.now().toString(36).toUpperCase().slice(-6) + "-" + Math.random().toString(36).slice(2, 5).toUpperCase();
  }

  function saveLocally(v, ref) {
    try {
      var key = "swp-submissions";
      var list = JSON.parse(localStorage.getItem(key) || "[]");
      delete v.mobile; delete v.email; delete v.guardianMobile; // keep personal contact details out of browser storage
      list.unshift(Object.assign({ ref: ref, status: "pending", submittedAt: new Date().toISOString(), parentName: v.parentName }, v));
      localStorage.setItem(key, JSON.stringify(list.slice(0, 20)));
    } catch (e) { /* storage unavailable — fine in demo mode */ }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var boxes = ["cPermission", "cOwn", "cTerms"].map($);
    var allTicked = boxes.every(function (b) { return b.checked; });
    $("consentError").hidden = allTicked;
    boxes.forEach(function (b) { b.classList.toggle("is-invalid", !b.checked); });
    var m = media();
    var hasMedia = m === "both" ? !!(photos.main || video) : m === "video" ? !!video : !!photos.main;
    if (!allTicked || !validateStep(1) || !hasMedia) {
      if (!validateStep(1)) go(1);
      return;
    }

    var v = values(), ref = refId();
    var btn = $("submitBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending…';

    var done = function () {
      form.hidden = true;
      document.getElementById("stepper").hidden = true;
      $("successName").textContent = v.yourName.split(" ")[0];
      $("refId").textContent = ref;
      $("success").hidden = false;
      document.querySelector(".upload-card").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    var fail = function () {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-send"></i> Submit selfie';
      $("consentError").textContent = "Something went wrong sending your selfie. Please try again.";
      $("consentError").hidden = false;
    };

    var sendPhoto = (m === "photo" || m === "both") && photos.main;
    var sendVideo = (m === "video" || m === "both") && video;
    v.media = sendPhoto && sendVideo ? "photo+video" : sendVideo ? "video" : "photo";
    if (sendVideo) v.videoSeconds = Math.round(video.duration);
    if (voice) v.voiceSeconds = voice.seconds;

    if (!SUBMIT_URL) { saveLocally(Object.assign({}, v), ref); setTimeout(done, 700); return; }

    var fd = new FormData();
    Object.keys(v).forEach(function (k) { fd.append(k, v[k]); });
    fd.append("ref", ref);
    if (sendVideo) {
      fd.append("video", video.blob, video.name);
      if (video.thumb) fd.append("videoThumb", video.thumb.blob, "thumb.jpg");
    }
    if (voice) fd.append("voiceNote", voice.blob, "voice." + (voice.type === "audio/mp4" ? "m4a" : "webm"));
    if (sendPhoto) {
      fd.append("photo", photos.main.blob, photos.main.name);
      if (photos.source) fd.append("sourcePhoto", photos.source.blob, photos.source.name);
    }

    // XHR (not fetch) so we can show upload progress for large videos
    var xhr = new XMLHttpRequest();
    xhr.open("POST", SUBMIT_URL);
    xhr.upload.onprogress = function (ev) {
      if (ev.lengthComputable) btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ' + I18N.t("Sending…") + " " + Math.round(ev.loaded / ev.total * 100) + "%";
    };
    xhr.onload = function () { if (xhr.status >= 200 && xhr.status < 300) done(); else fail(); };
    xhr.onerror = fail;
    xhr.send(fd);
  });

  $("againBtn").addEventListener("click", function () { location.reload(); });

  document.getElementById("year").textContent = new Date().getFullYear();
})();
