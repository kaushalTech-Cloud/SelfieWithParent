// Visitor accounts — DESIGN PREVIEW ONLY.
// Simulates a signed-in visitor in this browser so the screens can be reviewed.
// The real backend must replace this with server-side OTP verification and a secure, httpOnly
// session cookie. The full mobile number is deliberately NOT kept here — only the last 4 digits
// for display; the server already knows the verified number from the session.
(function () {
  "use strict";
  var KEY = "swp-user";

  function read() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function write(u) { try { localStorage.setItem(KEY, JSON.stringify(u)); } catch (e) { /* private mode */ } }

  window.Auth = {
    user: read,
    isSignedIn: function () { return !!read(); },
    profileComplete: function () { var u = read(); return !!(u && u.name && u.country && u.adultConfirmed); },

    // Called after the (simulated) code check or Google sign-in
    signIn: function (info) {
      var u = read() || { family: [], createdAt: new Date().toISOString() };
      Object.assign(u, info, { signedInAt: new Date().toISOString() });
      write(u);
      return u;
    },
    update: function (changes) { var u = read(); if (!u) return null; Object.assign(u, changes); write(u); return u; },
    signOut: function () { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },

    // Deletes the account and everything this preview stored for the visitor
    deleteAll: function () {
      ["swp-user", "swp-submissions", "swp-reminders", "swp-hearts", "swp-candles", "swp-pledge"].forEach(function (k) {
        try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
      });
    },

    // Where to send someone who must sign in first (returns them afterwards)
    loginUrl: function (next) { return "login.html?next=" + encodeURIComponent(next || location.pathname.split("/").pop() + location.search); },

    initials: function (u) {
      u = u || read();
      var n = (u && u.name || "").trim();
      if (!n) return "•";
      var parts = n.split(/\s+/);
      return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
    }
  };
})();
