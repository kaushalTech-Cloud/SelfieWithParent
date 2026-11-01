// Selfie with Parent — front-end behaviour (no backend yet)
(function () {
  "use strict";

  // Sample gallery data — replace with real, consented submissions
  var selfies = [
    { name: "Aarav & his mother", city: "Jaipur", img: "img/selfie-1.svg" },
    { name: "Meera & her father", city: "Pune", img: "img/selfie-2.svg" },
    { name: "Kabir & grandparents", city: "Lucknow", img: "img/selfie-3.svg" },
    { name: "Ananya & her parents", city: "Kochi", img: "img/selfie-4.svg" },
    { name: "Rohan & his grandmother", city: "Indore", img: "img/selfie-5.svg" },
    { name: "Sara & her father", city: "Guwahati", img: "img/selfie-6.svg" }
  ];

  var track = document.getElementById("galleryTrack");
  selfies.forEach(function (s) {
    var slide = document.createElement("div");
    slide.className = "swiper-slide";
    slide.innerHTML =
      '<div class="selfie-card"><img loading="lazy" alt=""><div class="info"><h4></h4><p></p></div></div>';
    slide.querySelector("img").src = s.img;
    slide.querySelector("img").alt = s.name;
    slide.querySelector("h4").textContent = s.name;
    slide.querySelector("p").textContent = s.city;
    track.appendChild(slide);
  });

  // Visitors who ask their device for less motion get no autoplay and no scroll animations
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  new Swiper(".gallery-swiper", {
    loop: true,
    spaceBetween: 24,
    slidesPerView: 1.2,
    autoplay: reduceMotion ? false : { delay: 3500, pauseOnMouseEnter: true, disableOnInteraction: true },
    a11y: { enabled: true },
    keyboard: { enabled: true, onlyInViewport: true },
    pagination: { el: ".gallery-swiper .swiper-pagination", clickable: true },
    breakpoints: { 576: { slidesPerView: 2 }, 992: { slidesPerView: 3 }, 1200: { slidesPerView: 4 } }
  });

  AOS.init({ once: true, duration: 700, offset: 60, disable: reduceMotion });

  // Count-up stats when visible
  var counted = false;
  var statsEl = document.getElementById("stats");
  new IntersectionObserver(function (entries) {
    if (counted || !entries[0].isIntersecting) return;
    counted = true;
    document.querySelectorAll(".count").forEach(function (el) {
      var target = +el.dataset.target, start = performance.now();
      (function tick(now) {
        var p = Math.min((now - start) / 1600, 1);
        el.textContent = Math.floor(target * p).toLocaleString(window.I18N ? I18N.locale : "en-IN") + (p === 1 ? "+" : "");
        if (p < 1) requestAnimationFrame(tick);
      })(start);
    });
  }, { threshold: 0.4 }).observe(statsEl);

  // Upload modal: switch title for AI mode, preview photo
  var modal = document.getElementById("uploadModal");
  modal.addEventListener("show.bs.modal", function (e) {
    var ai = e.relatedTarget && e.relatedTarget.dataset.mode === "ai";
    document.getElementById("uploadTitle").textContent = ai ? "Create an AI selfie" : "Upload your selfie";
  });

  // Photo or video — whichever was picked last is the one that's sent
  var photo = document.getElementById("photo");
  var modalVideo = document.getElementById("modalVideo");
  var preview = document.getElementById("preview");
  var previewVideo = document.getElementById("previewVideo");
  var uploadNote = document.querySelector("#uploadForm .form-note");
  var picked = null; // "photo" | "video"
  var tr = function (s) { return window.I18N ? I18N.t(s) : s; };

  function resetMedia() {
    picked = null;
    preview.hidden = true; preview.removeAttribute("src");
    previewVideo.hidden = true; previewVideo.removeAttribute("src"); previewVideo.load();
    document.getElementById("dropText").hidden = false;
  }

  function mediaError(msg) {
    uploadNote.className = "form-note mt-2 err";
    uploadNote.textContent = tr(msg);
  }

  photo.addEventListener("change", function () {
    var file = photo.files[0];
    if (!file) return;
    resetMedia();
    modalVideo.value = "";
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    document.getElementById("dropText").hidden = true;
    picked = "photo";
    uploadNote.textContent = "";
  });

  modalVideo.addEventListener("change", function () {
    var file = modalVideo.files[0];
    if (!file) return;
    if (["video/mp4", "video/webm", "video/quicktime"].indexOf(file.type) < 0) { modalVideo.value = ""; return mediaError("Please choose an MP4, WebM or MOV video."); }
    if (file.size > 50 * 1024 * 1024) { modalVideo.value = ""; return mediaError("That video is larger than 50 MB. Please trim it or pick a shorter one."); }
    var url = URL.createObjectURL(file);
    var probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = function () {
      if (isFinite(probe.duration) && probe.duration > 60.5) {
        URL.revokeObjectURL(url); modalVideo.value = "";
        return mediaError("Videos can be up to 60 seconds long. Please trim it and try again.");
      }
      resetMedia();
      photo.value = "";
      previewVideo.src = url;
      previewVideo.hidden = false;
      document.getElementById("dropText").hidden = true;
      picked = "video";
      uploadNote.textContent = "";
    };
    probe.onerror = function () { URL.revokeObjectURL(url); modalVideo.value = ""; mediaError("We couldn't play that video. Please try another."); };
    probe.src = url;
  });

  function handleForm(form, okText) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var note = form.querySelector(".form-note");
      // Sharing needs an account — point signed-out visitors to sign-in (they come back here after)
      if (form.id === "uploadForm" && window.Auth && !Auth.isSignedIn()) {
        note.className = "form-note mt-2 err";
        note.textContent = tr("Please sign in to share your selfie.") + " ";
        var link = document.createElement("a");
        link.href = Auth.loginUrl("index.html");
        link.textContent = tr("Sign in");
        note.appendChild(link);
        return;
      }
      var needsMedia = form.id === "uploadForm" && !picked;
      if (!form.checkValidity() || needsMedia) {
        form.classList.add("was-validated");
        note.className = "form-note mt-2 err";
        note.textContent = tr(needsMedia && form.checkValidity() ? "Please add a photo or a video." : "Please fill in the required fields.");
        return;
      }
      // TODO: send to your backend / form service here (photo or video, per `picked`)
      note.className = "form-note mt-2 ok";
      note.textContent = tr(okText);
      form.reset();
      form.classList.remove("was-validated");
      if (form.id === "uploadForm") resetMedia();
    });
  }
  handleForm(document.getElementById("uploadForm"), "Thank you! Your selfie has been received.");
  handleForm(document.getElementById("contactForm"), "Thanks for writing to us. We'll reply soon.");

  // Active nav link + back-to-top
  var links = document.querySelectorAll(".main-nav .nav-link[href^='#']:not([href='#'])");
  var backTop = document.querySelector(".back-top");
  window.addEventListener("scroll", function () {
    backTop.classList.toggle("show", window.scrollY > 500);
    var pos = window.scrollY + 120;
    links.forEach(function (a) {
      var sec = document.querySelector(a.getAttribute("href"));
      if (sec) a.classList.toggle("active", sec.offsetTop <= pos && sec.offsetTop + sec.offsetHeight > pos);
    });
  });

  // Close mobile menu after picking a link
  document.querySelectorAll(".main-nav a[href^='#']:not(.dropdown-toggle)").forEach(function (a) {
    a.addEventListener("click", function () {
      var menu = bootstrap.Collapse.getInstance(document.getElementById("mainMenu"));
      if (menu) menu.hide();
    });
  });

  document.getElementById("year").textContent = new Date().getFullYear();
})();
