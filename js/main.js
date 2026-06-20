/* cliftonhatfield.com — progressive enhancement only.
   With no JS (or reduced motion) the page is fully readable: posts show their
   full text, reveals are visible. This file just animates an already-complete DOM. */
(function () {
  "use strict";
  var root = document.documentElement;
  root.dataset.ready = "1"; // cancels the 3s safety-net fallback in <head>
  var animOK = root.classList.contains("anim");

  /* ── Header shadow on scroll ─────────────────────────────────────── */
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ── Back-to-top / brand: always scroll to top ───────────────────── */
  // The #top fragment links work without JS (first tap), but iOS Safari
  // treats a second tap — when location.hash is already "#top" — as a no-op
  // and won't re-scroll. Drive the scroll ourselves so every tap works, then
  // strip the fragment so the URL never gets "stuck" at #top.
  var topLinks = document.querySelectorAll('a[href="#top"]');
  for (var ti = 0; ti < topLinks.length; ti++) {
    topLinks[ti].addEventListener("click", function (e) {
      e.preventDefault();
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      try {
        window.scrollTo({ top: 0, left: 0, behavior: reduce ? "auto" : "smooth" });
      } catch (err) {
        window.scrollTo(0, 0); // very old browsers: no options object
      }
      if (window.history && history.replaceState && location.hash === "#top") {
        history.replaceState(null, "", location.pathname + location.search);
      }
    });
  }

  /* ── Theme toggle ────────────────────────────────────────────────── */
  // The pre-paint script in <head> has already set data-theme (saved choice →
  // OS preference → dark). Here we wire the header button, persist the user's
  // choice, keep the meta theme-color / a11y label in sync, and follow the OS
  // until the user makes an explicit pick. Mirrors the AGNTS developer portal.
  (function () {
    var KEY = "cliftonhatfield.theme";
    var btn = document.getElementById("theme-toggle");
    var meta = document.querySelector('meta[name="theme-color"]');
    var darkMQ = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    var chosen = false;
    try { var v = localStorage.getItem(KEY); chosen = (v === "light" || v === "dark"); } catch (e) {}

    function apply(theme) {
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
      if (meta) {
        var bg = getComputedStyle(root).getPropertyValue("--bg").trim();
        if (bg) meta.setAttribute("content", bg);
      }
      if (btn) {
        var label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
        btn.setAttribute("aria-label", label);
        btn.setAttribute("title", label);
      }
    }

    // Sync label + meta to whatever the pre-paint script resolved.
    apply(root.dataset.theme === "light" ? "light" : "dark");

    if (btn) btn.addEventListener("click", function () {
      var next = root.dataset.theme === "dark" ? "light" : "dark";
      chosen = true;
      try { localStorage.setItem(KEY, next); } catch (e) {}
      apply(next);
    });

    // No explicit choice yet → track the OS as it flips.
    if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener("change", function (e) {
      if (chosen) return;
      apply(e.matches ? "dark" : "light");
    });
  })();

  /* ── Phone motion: scroll-scrubbed 3D turntable (+ pointer parallax) ─
     The phone rests on a slight premium back-tilt and rotates/lifts as it
     travels through the viewport — scrubbed 1:1 to its own scroll position, so
     the motion reads on every device (scroll is universal; the old pointer-only
     tilt was invisible on trackpad/touch). On a fine pointer, a small cursor
     tilt eases in on top. One rAF, transform only — no layout, no CLS. */
  var phone = document.querySelector(".phone");
  if (phone && animOK) {
    var hero = document.querySelector(".hero") || document;
    var fine = window.matchMedia &&
      window.matchMedia("(hover:hover) and (pointer:fine)").matches;
    var ptX = 0, ptY = 0, pcX = 0, pcY = 0, PT_MAX = 5; // pointer tilt target/current
    var YAW = 10;       // gentle resting turn (deg): enough to show the thick side, but not over-committed
    var SWEEP = 14;     // extra rotateY turned through as it scrolls (deg, peak-to-peak)
    var BACK = 5;       // back-tilt rotateX (deg) — also reveals the top edge's thickness
    var LIFT = 18;      // parallax rise as it scrolls up (px, peak-to-peak)
    var phoneRaf = null;

    // Extrude a 3D side wall behind the front face so rotation reveals real
    // thickness — a single rotated plane looks paper-thin. Stacked rounded-rect
    // slices follow the phone's corners into Z and form a solid slab; head-on
    // (flat) they sit hidden directly behind the front. Skipped without 3D.
    if (window.CSS && CSS.supports && CSS.supports("transform-style", "preserve-3d")) {
      var DEPTH = 52, SLICES = Math.round(DEPTH / 2), edgeFrag = document.createDocumentFragment();
      for (var s = 1; s <= SLICES; s++) {
        var et = s / SLICES;                        // 0..1, deeper into the body
        var rim = Math.pow(1 - et, 1.4);            // lit metal chamfer up front → dark body deep
        var er = Math.round(8 + 76 * rim);
        var eg = Math.round(9 + 81 * rim);
        var eb = Math.round(12 + 92 * rim);
        var slice = document.createElement("div");
        slice.className = "phone-edge";
        slice.style.background = "rgb(" + er + "," + eg + "," + eb + ")";
        slice.style.transform = "translateZ(" + (-DEPTH * et).toFixed(1) + "px)";
        edgeFrag.appendChild(slice);
      }
      phone.appendChild(edgeFrag);
    }

    // Layout-based viewport center (offsetTop/Left chain), NOT getBoundingClientRect:
    // the rect would include the transform we write, feeding back into p. offset*
    // is the untransformed layout box, so p tracks scroll position only.
    function centerXY() {
      var x = 0, y = 0, n = phone;
      while (n) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      return { x: x - window.pageXOffset + phone.offsetWidth / 2,
               y: y - window.pageYOffset + phone.offsetHeight / 2 };
    }

    var cx = 0, cy = 0; // phone center (viewport px), refreshed each frame; cached for onMove
    function applyPhone() {
      phoneRaf = null;
      // Progress from the phone's own travel: 0 as its center enters from the
      // bottom of the viewport, .5 dead-center, 1 as it exits past the top.
      var vh = window.innerHeight || document.documentElement.clientHeight || 1;
      var c = centerXY(); cx = c.x; cy = c.y;
      var p = 1 - cy / vh;
      if (p < 0) p = 0; else if (p > 1) p = 1;
      var d = 0.5 - p; // +.5 (entering low) → 0 (centered) → -.5 (exiting high)
      // Ease the cursor tilt toward its target; scroll itself tracks 1:1.
      pcX += (ptX - pcX) * 0.12; pcY += (ptY - pcY) * 0.12;
      var ry = -YAW + d * SWEEP + pcY;   // persistent turn + scroll sweep + cursor X
      var rx = BACK + d * 7 + pcX;       // back-tilt eases through scroll + cursor Y
      var py = (d - 0.5) * LIFT;         // float UP as it scrolls (never below baseline → clears the controls)
      var sc = 1 - Math.abs(d) * 0.05;   // recede slightly toward the edges
      phone.style.transform =
        "translateY(" + py.toFixed(1) + "px) rotateX(" +
        rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg) scale(" + sc.toFixed(3) + ")";
      if (Math.abs(ptX - pcX) > 0.02 || Math.abs(ptY - pcY) > 0.02) schedulePhone();
    }
    function schedulePhone() { if (!phoneRaf) phoneRaf = window.requestAnimationFrame(applyPhone); }

    function onScrollResize() { schedulePhone(); }
    function onMove(e) {
      // Read the cached center (refreshed each frame in applyPhone) — never read
      // layout here, or a fine pointer would force a sync reflow many times/frame.
      var dx = (e.clientX - cx) / (window.innerWidth / 2);
      var dy = (e.clientY - cy) / (window.innerHeight / 2);
      ptY = Math.max(-1, Math.min(1, dx)) * PT_MAX;   // rotateY follows cursor X
      ptX = Math.max(-1, Math.min(1, dy)) * -PT_MAX;  // rotateX inverted
      schedulePhone();
    }
    function onLeave() { ptX = 0; ptY = 0; schedulePhone(); }

    applyPhone(); // set the resting pose up front (no first-paint snap)
    window.addEventListener("scroll", onScrollResize, { passive: true });
    window.addEventListener("resize", onScrollResize, { passive: true });
    if (fine) {
      hero.addEventListener("mousemove", onMove, { passive: true });
      hero.addEventListener("mouseleave", onLeave);
    }

    // Honor a live switch to "reduce motion" (e.g. toggled mid-session): stop
    // scheduling, drop the listeners, and flatten the phone to its CSS pose.
    var rmq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (rmq && rmq.addEventListener) rmq.addEventListener("change", function (e) {
      if (!e.matches) return;
      if (phoneRaf) window.cancelAnimationFrame(phoneRaf);
      phoneRaf = null;
      window.removeEventListener("scroll", onScrollResize);
      window.removeEventListener("resize", onScrollResize);
      hero.removeEventListener("mousemove", onMove);
      hero.removeEventListener("mouseleave", onLeave);
      phone.style.transform = ""; // back to the flat CSS pose
    });
  }

  /* ── Scroll reveals (shared IntersectionObserver) ────────────────── */
  var reveals = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if (animOK && "IntersectionObserver" in window) {
    reveals.forEach(function (el) { el.classList.add("is-pre"); });
    // No negative bottom rootMargin: the last elements on the page (footer
    // socials/colophon) must still be able to cross the threshold when scrolled
    // to the very bottom, or they'd stay hidden forever.
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in-view");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px 0px 0px" });
    reveals.forEach(function (el) { io.observe(el); });
    // Safety net: if a reveal is already within view on load (or never trips the
    // observer), reveal it. Runs once after load.
    window.addEventListener("load", function () {
      reveals.forEach(function (el) {
        if (el.classList.contains("in-view")) return;
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) {
          el.classList.add("in-view");
          io.unobserve(el);
        }
      });
    });
  } else {
    reveals.forEach(function (el) { el.classList.add("in-view"); });
  }

  /* ── Hero grid: Tron-style light traces ──────────────────────────────
     Quick accent pulses that trace a single grid line — random axis (H/V),
     random line (biased toward the top-left, where the grid's radial mask is
     strongest), random direction — then fade, at randomized intervals. Purely
     decorative and compositor-only (transform + opacity via the Web Animations
     API, the same idiom the feed uses), with capped concurrency, paused while
     off-screen/hidden, and gated on motion preference. The resting grid is
     never touched: traces live in a separate masked overlay layer. */
  (function () {
    var bg = document.querySelector(".hero-bg");
    if (!bg || !animOK || typeof bg.animate !== "function") return;

    var CELL = 46;                       // grid pitch — matches background-size in CSS
    var MAX_LIVE = 2;                    // cap concurrent traces
    var GAP_MIN = 1100, GAP_MAX = 3200;  // ms between spawns
    var THICK = 1;                       // trace thickness (px), centered on the line — matches the 1px grid line

    var layer = document.createElement("div");
    layer.className = "hero-traces";
    bg.appendChild(layer);

    function rand(a, b) { return a + Math.random() * (b - a); }

    var live = 0, timer = null, stopped = false, onView = true;

    function spawn() {
      var w = layer.clientWidth, h = layer.clientHeight;
      if (!w || !h) return;

      var horizontal = Math.random() < 0.5;
      var axisLen = horizontal ? w : h;   // length of the line being traced
      var crossLen = horizontal ? h : w;  // axis along which we pick the line
      // Bias toward low indices (top / left) — the masked-bright region.
      var maxIdx = Math.max(1, Math.floor(crossLen / CELL) - 1);
      var idx = 1 + Math.floor(Math.pow(Math.random(), 1.7) * maxIdx);
      var pos = idx * CELL;               // sits exactly on a grid line

      var trail = Math.max(150, Math.min(axisLen * 0.34, 340)); // comet length
      var forward = Math.random() < 0.5;
      var dur = rand(450, 720);           // quick traversal

      var c = document.createElement("div");
      c.className = "hero-trace";
      // Gradient runs transparent tail -> accent -> hot head, oriented so the
      // bright head leads in the travel direction.
      var ang = horizontal ? (forward ? 90 : 270) : (forward ? 180 : 0);
      c.style.backgroundImage = "linear-gradient(" + ang + "deg," +
        "transparent 0%,var(--grid-accent) 72%,var(--grid-accent-hot) 100%)";
      if (horizontal) {
        c.style.left = "0"; c.style.top = pos + "px";
        c.style.width = trail + "px"; c.style.height = THICK + "px";
      } else {
        c.style.top = "0"; c.style.left = pos + "px";
        c.style.height = trail + "px"; c.style.width = THICK + "px";
      }

      var delta = axisLen + trail;        // travel fully across and off the far edge
      var startPx = forward ? -trail : axisLen;
      var sign = forward ? 1 : -1;
      function at(p) {                    // transform at progress p (0..1) — linear in time
        var v = startPx + sign * delta * p;
        return horizontal ? "translateX(" + v + "px)" : "translateY(" + v + "px)";
      }

      layer.appendChild(c);
      live++;
      var a = c.animate([
        { transform: at(0),    opacity: 0 },
        { transform: at(0.12), opacity: 1, offset: 0.12 },
        { transform: at(0.85), opacity: 1, offset: 0.85 },
        { transform: at(1),    opacity: 0 }
      ], { duration: dur, easing: "linear" });
      a.onfinish = a.oncancel = function () { c.remove(); live--; };
    }

    function isPaused() { return document.hidden || !onView; }
    function tick() {
      timer = null;
      if (stopped || isPaused()) return; // no timer re-armed while paused; a resume hook restarts us
      if (live < MAX_LIVE) spawn();
      timer = window.setTimeout(tick, rand(GAP_MIN, GAP_MAX));
    }
    function resume() { // (re)start the loop, unless already running, stopped, or still paused
      if (stopped || timer || isPaused()) return;
      timer = window.setTimeout(tick, rand(GAP_MIN, GAP_MAX));
    }

    // Pause (stop scheduling entirely) while the hero is out of view; resume when it returns.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { onView = e[0].isIntersecting; if (onView) resume(); },
        { threshold: 0 }).observe(bg);
    }
    // Same for background tabs: no timer wakes the main thread until the tab is shown again.
    document.addEventListener("visibilitychange", function () { if (!document.hidden) resume(); }, { passive: true });

    // Honor a live switch to "reduce motion": stop scheduling and drop the layer.
    var rmq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (rmq && rmq.addEventListener) rmq.addEventListener("change", function (e) {
      if (!e.matches) return;
      stopped = true;
      if (timer) window.clearTimeout(timer);
      timer = null;
      if (layer.parentNode) layer.remove();
    });

    if (!isPaused()) timer = window.setTimeout(tick, rand(500, 1400)); // first trace shortly after load
  })();

  /* ── Live feed typewriter ────────────────────────────────────────── */
  var feed = document.getElementById("feed");
  if (!feed || !animOK) return; // static feed already shows full text

  var posts = Array.prototype.slice.call(feed.querySelectorAll(".post"));
  var typed = posts.map(function (p) { return p.querySelector(".typed"); });
  var fullText = typed.map(function (el) { return el ? el.textContent : ""; });
  var postTexts = posts.map(function (p) { return p.querySelector(".post-text"); });

  // Reserve each post's *final* text height up front. The like/repost row sits
  // directly below .post-text, so without this it jumps down a line every time
  // the typewriter wraps onto a new line. Measuring at full text gives the
  // worst-case (max) line count, so the row never has to move while typing.
  // Re-measured after web fonts load and on resize, since both change wrapping.
  function reserveTextHeights() {
    for (var i = 0; i < postTexts.length; i++) {
      var box = postTexts[i], el = typed[i];
      if (!box) continue;
      var current = el ? el.textContent : null;
      if (el) el.textContent = fullText[i];      // measure at full (max) lines
      box.style.minHeight = "0px";
      box.style.minHeight = box.offsetHeight + "px";
      if (el) el.textContent = current;          // restore in-progress text
    }
  }
  reserveTextHeights();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reserveTextHeights);
  window.addEventListener("load", reserveTextHeights); // re-measure once layout fully settles
  var reserveTimer = null;
  window.addEventListener("resize", function () {
    if (reserveTimer) clearTimeout(reserveTimer);
    reserveTimer = setTimeout(reserveTextHeights, 150);
  }, { passive: true });

  var CHAR_MS = 22;      // base per-character typing speed (jittered per char) — unhurried
  var REVEAL_MS = 540;   // fade/rise before typing starts
  var GAP_MS = 880;      // pause between posts — lets each one settle before the next
  var HOLD_MS = 8000;    // pause on a completed thread before looping
  var FADE_MS = 760;     // feed fade-out before the thread loops

  // Build a per-character reveal schedule with organic cadence: each character
  // gets a jittered delay, with extra pauses after sentence/clause punctuation —
  // so the typewriter reads like someone composing, not a metronome. Rebuilt per
  // post each cycle for fresh variation.
  function buildSchedule(text) {
    var arr = [], t = 0;
    for (var c = 0; c < text.length; c++) {
      t += CHAR_MS * (0.84 + Math.random() * 0.32); // tighter jitter -> a more even, flowing cadence
      arr.push(t);
      var ch = text.charAt(c);
      if (ch === "." || ch === "!" || ch === "?") t += 160;
      else if (ch === "," || ch === ";" || ch === ":") t += 90;
      else if (ch === "—" || ch === "–") t += 110; // em / en dash
    }
    return arr;
  }
  var schedules = posts.map(function () { return null; });

  // Soft coral glow behind the wordmark — give it a gentle pulse when a new post
  // lands, tying the hero and the live feed together.
  var glow = document.querySelector(".hero-glow");
  function pulseGlow() {
    if (glow && glow.animate) glow.animate(
      [{ filter: "blur(8px) brightness(1)", transform: "scale(1)" },
       { filter: "blur(8px) brightness(1.4)", transform: "scale(1.05)" },
       { filter: "blur(8px) brightness(1)", transform: "scale(1)" }],
      { duration: 1500, easing: "ease-out" });
  }

  /* ── Live engagement counters ────────────────────────────────────── */
  // Once a post finishes typing it goes "live": its like/repost counts tick up
  // slowly to mimic real-time activity. Driven by the same virtual clock as the
  // typewriter, so it pauses off-screen/in background and resets on each loop.
  var LIKE_MIN_MS = 1500, LIKE_MAX_MS = 3200; // gap between +like bumps
  var RT_MIN_MS = 5000, RT_MAX_MS = 9000;     // reposts climb more rarely
  var statN = posts.map(function (p) { return p.querySelectorAll(".post-stats .n"); });
  var likeEl = statN.map(function (n) { return n[0] || null; });
  var repostEl = statN.map(function (n) { return n[1] || null; });
  var heartEl = posts.map(function (p) { return p.querySelector(".post-stats .ic-like"); });
  var sendEl = posts.map(function (p) { return p.querySelector(".post-stats .ic-send"); });
  // Quick scale-bounce on the heart the instant a like lands. Uses the Web
  // Animations API (real time, one-shot) — increments only fire while visible,
  // so no pulses run off-screen.
  function pulseHeart(i) {
    var h = heartEl[i];
    if (h && h.animate) h.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.26)" }, { transform: "scale(1)" }],
      { duration: 560, easing: "cubic-bezier(.22,1,.36,1)" });
  }
  // Same bounce on the plane when a share lands — but the plane is muted at rest
  // and only flashes blue for the duration of the pulse. Resolve the tokens to
  // concrete colors at fire time (WAAPI won't interpolate var()), so it tracks
  // the active theme; fill reverts to CSS currentColor (--muted-2) when done.
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function pulseSend(i) {
    var s = sendEl[i];
    if (!s || !s.animate) return;
    var rest = cssVar("--muted-2"), hot = cssVar("--accent-blue");
    s.animate(
      [{ transform: "scale(1)", fill: rest },
       { transform: "scale(1.26)", fill: hot },
       { transform: "scale(1)", fill: rest }],
      { duration: 560, easing: "cubic-bezier(.22,1,.36,1)" });
  }
  function readCount(el) { return el ? parseInt(el.textContent, 10) || 0 : 0; }
  var baseLikes = likeEl.map(readCount);
  var baseReposts = repostEl.map(readCount);
  var curLikes = baseLikes.slice();
  var curReposts = baseReposts.slice();
  var liveMs = posts.map(function () { return -1; }); // -1 until the post is written
  var nextLike = posts.map(function () { return 0; });
  var nextRepost = posts.map(function () { return 0; });
  function rand(a, b) { return a + Math.random() * (b - a); }

  function startActivity(i) {
    if (liveMs[i] >= 0) return;
    liveMs[i] = 0;
    nextLike[i] = rand(LIKE_MIN_MS, LIKE_MAX_MS);
    nextRepost[i] = rand(RT_MIN_MS, RT_MAX_MS);
    nextBlink[i] = rand(BLINK_MIN_MS, BLINK_MAX_MS); // first blink after it posts
    blinkEnd[i] = -1;
  }
  function resetActivity() {
    for (var i = 0; i < posts.length; i++) {
      liveMs[i] = -1;
      curLikes[i] = baseLikes[i];
      curReposts[i] = baseReposts[i];
      if (likeEl[i]) likeEl[i].textContent = baseLikes[i];
      if (repostEl[i]) repostEl[i].textContent = baseReposts[i];
      blinkEnd[i] = -1;
      nextBlink[i] = 0;
      if (frames[i]) setFrame(i, frames[i].idle); // back to resting face
    }
  }
  function tickActivity(dt) {
    for (var i = 0; i < posts.length; i++) {
      if (liveMs[i] < 0) continue;
      liveMs[i] += dt;
      while (liveMs[i] >= nextLike[i]) {
        curLikes[i] += Math.random() < 0.18 ? 2 : 1; // occasional small burst
        if (likeEl[i]) likeEl[i].textContent = curLikes[i];
        pulseHeart(i);
        nextLike[i] += rand(LIKE_MIN_MS, LIKE_MAX_MS);
      }
      while (liveMs[i] >= nextRepost[i]) {
        curReposts[i] += 1;
        if (repostEl[i]) repostEl[i].textContent = curReposts[i];
        pulseSend(i);
        nextRepost[i] += rand(RT_MIN_MS, RT_MAX_MS);
      }
    }
  }

  /* ── Avatar expression frames (idle / blink) ─────────────────────── */
  // Posted agents blink now and then; the agent currently composing just stays
  // idle (no mouth animation). Frames are the per-agent SVGs from
  // generate-avatars.mjs; we derive the blink URL from the idle src already in
  // the DOM and preload it.
  var BLINK_DUR_MS = 130;                     // eyes-closed duration
  var BLINK_MIN_MS = 2600, BLINK_MAX_MS = 6200; // gap between blinks
  var avImg = posts.map(function (p) { return p.querySelector(".post-avatar"); });
  var frames = avImg.map(function (el) {
    if (!el) return null;
    var idle = el.getAttribute("src");
    return { idle: idle, blink: idle.replace(/\.svg$/, "-blink.svg") };
  });
  frames.forEach(function (f) { if (f) { new Image().src = f.blink; } });
  var nextBlink = posts.map(function () { return 0; });
  var blinkEnd = posts.map(function () { return -1; });

  function setFrame(i, src) {
    var el = avImg[i];
    if (el && el.getAttribute("src") !== src) el.setAttribute("src", src);
  }
  function tickAvatars(dt) {
    for (var i = 0; i < posts.length; i++) {
      if (!frames[i]) continue;
      if (liveMs[i] >= 0) {                                         // posted: blink
        if (blinkEnd[i] >= 0) {
          if (liveMs[i] >= blinkEnd[i]) {
            blinkEnd[i] = -1; nextBlink[i] = liveMs[i] + rand(BLINK_MIN_MS, BLINK_MAX_MS);
            setFrame(i, frames[i].idle);
          } else setFrame(i, frames[i].blink);
        } else if (liveMs[i] >= nextBlink[i]) {
          blinkEnd[i] = liveMs[i] + BLINK_DUR_MS; setFrame(i, frames[i].blink);
        } else setFrame(i, frames[i].idle);
      } else {
        setFrame(i, frames[i].idle);
      }
    }
  }

  function renderStatic() {
    feed.classList.remove("feed-anim", "feed-out");
    posts.forEach(function (p) { p.classList.add("show"); p.classList.remove("is-typing"); });
    typed.forEach(function (el, i) { if (el) el.textContent = fullText[i]; });
    resetActivity();
  }

  function resetFeed() {
    posts.forEach(function (p) { p.classList.remove("show", "is-typing"); });
    typed.forEach(function (el) { if (el) el.textContent = ""; });
    feed.classList.remove("feed-out");
    scrollTarget = 0;
    feed.scrollTop = 0; // snap to top instantly so replay never starts mid-scroll
    resetActivity();
  }

  // Keep the post being written in view, like a live timeline: it follows the
  // active post (chat-style, newest near the bottom). We tween scrollTop ourselves
  // on the virtual clock (tickScroll) rather than CSS smooth-scroll — CSS smooth
  // makes scrollTop reads lag, which mis-positioned the feed on replay. Geometry
  // uses offsetTop, NOT getBoundingClientRect: the phone's 3D turntable transform
  // projects the rects, which would corrupt the math and stop the feed following.
  var scrollTarget = 0;
  function scrollToActive(i) {
    var p = posts[i];
    var topInContent = p.offsetTop;            // layout offset within the feed (transform-independent)
    var bottomInContent = topInContent + p.offsetHeight;
    // Keep the active post off the very bottom edge of the feed. On a phone that's
    // only partly in the viewport (narrow/mobile layout, where the bezel runs below
    // the fold) the bottom of the feed is the first thing clipped — so anchoring the
    // post being typed a little higher keeps the live action visible there too.
    var pad = Math.min(90, feed.clientHeight * 0.16);
    var t = scrollTarget;
    if (bottomInContent > scrollTarget + feed.clientHeight - pad) t = bottomInContent - feed.clientHeight + pad;
    if (topInContent < t) t = topInContent;    // post taller than view -> show its top
    scrollTarget = Math.max(0, Math.min(t, feed.scrollHeight - feed.clientHeight));
  }
  function tickScroll(dt) {
    var cur = feed.scrollTop, diff = scrollTarget - cur;
    if (Math.abs(diff) < 0.5) { if (cur !== scrollTarget) feed.scrollTop = scrollTarget; return; }
    feed.scrollTop = cur + diff * Math.min(1, dt / 380); // framerate-independent ease — long, gliding follow
  }

  // State machine, advanced by a virtual clock that only ticks while visible.
  var state = { idx: -1, phase: "idle", timer: 0, chars: 0 };

  function startPost(i) {
    state.idx = i; state.phase = "reveal"; state.timer = 0; state.chars = 0;
    schedules[i] = buildSchedule(fullText[i]);
    posts[i].classList.add("show", "is-typing");
    scrollToActive(i);
    pulseGlow();
  }

  function step(dt) {
    if (state.idx < 0) { startPost(0); return; }
    var i = state.idx;
    state.timer += dt;

    // While a post is growing in / typing, keep re-aiming the scroll at it: its
    // height changes as the row expands (accordion) and as text wraps, so a single
    // aim at startPost would under-scroll. Cheap (one layout read on a short feed).
    if (state.phase === "reveal" || state.phase === "typing") scrollToActive(i);

    if (state.phase === "reveal") {
      if (state.timer >= REVEAL_MS) { state.phase = "typing"; state.timer = 0; }
    } else if (state.phase === "typing") {
      var el = typed[i];
      if (!el) { posts[i].classList.remove("is-typing"); startActivity(i); state.phase = "gap"; state.timer = 0; return; }
      var sched = schedules[i], target = state.chars;
      while (target < sched.length && sched[target] <= state.timer) target++;
      if (target > state.chars) { el.textContent = fullText[i].slice(0, target); state.chars = target; }
      if (state.chars >= fullText[i].length) {
        posts[i].classList.remove("is-typing");
        startActivity(i); // post is written — start its likes/reposts climbing
        state.phase = "gap"; state.timer = 0;
      }
    } else if (state.phase === "gap") {
      if (state.timer >= GAP_MS) {
        if (i + 1 < posts.length) { startPost(i + 1); }
        else { state.phase = "hold"; state.timer = 0; }
      }
    } else if (state.phase === "hold") {
      // Fade the whole thread out before looping (also masks the scroll reset).
      if (state.timer >= HOLD_MS) { feed.classList.add("feed-out"); state.phase = "fadeout"; state.timer = 0; }
    } else if (state.phase === "fadeout") {
      if (state.timer >= FADE_MS) { resetFeed(); state.idx = -1; state.phase = "idle"; state.timer = 0; }
    }
  }

  // Pause only when the feed is genuinely off-screen or the tab is hidden. Play as
  // soon as it's even modestly in view: the phone is height-capped to fit the
  // viewport (index.html), so when it's on screen the live action is too. NOTE: a
  // stricter "ratio >= 0.55" gate here was a mistake — the tall, 3D-transformed
  // phone reports a low intersection ratio even when plainly visible, so the gate
  // never cleared and the typewriter never started (feed sat in its static state).
  var onScreen = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
    }, { threshold: 0.12 }).observe(feed);
  }
  function isPaused() { return document.hidden || !onScreen; }

  // The "Play" control stays hidden in the normal case — the feed loops on its
  // own. It only surfaces if the FPS watchdog downgrades playback to the static
  // feed, where it's the one way to force the animation back on.
  var replay = document.getElementById("replay");

  var rafId = null, lastTs = null, running = false, started = false, downgraded = false;

  // Steady-state FPS watchdog. The previous version sampled FPS over the first
  // 600ms of page load and dropped to a static feed below 40fps — but those are
  // the jankiest frames of the whole page (parse, layout, font swap, reveal
  // transitions), so ordinary machines were misread as low-end and autoplay
  // never started (only Replay, which force-starts, worked). Now we autoplay
  // immediately and only sample once playback is actually on-screen, after a
  // warm-up, downgrading solely for *sustained* low FPS.
  var warmupMs = 0, probeMs = 0, probeFrames = 0;
  function downgrade() {
    running = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = null;
    renderStatic();
    if (replay) replay.hidden = false; // autoplay gave up — offer manual Play
  }
  function loop(ts) {
    if (lastTs === null) lastTs = ts;
    var dt = ts - lastTs; lastTs = ts;
    if (!isPaused()) {
      // Defer hiding/clearing the static feed until it's actually on-screen, so
      // the readable full-text feed stays put while the phone is below the fold.
      if (!started) { feed.classList.add("feed-anim"); resetFeed(); started = true; }
      if (dt > 80) dt = 80; // clamp big gaps (background/throttled frames)
      if (!downgraded) {
        if (warmupMs < 600) {
          warmupMs += dt;                 // skip first-frames load jank
        } else if (probeMs < 1200) {
          probeFrames++; probeMs += dt;   // sample ~1.2s of steady playback
        } else {
          downgraded = true;
          if (probeFrames / (probeMs / 1000) < 30) { downgrade(); return; }
        }
      }
      step(dt);
      tickActivity(dt);
      tickAvatars(dt);
      tickScroll(dt);
    }
    rafId = window.requestAnimationFrame(loop);
  }
  function startLoop() {
    if (running) return;
    running = true;
    lastTs = null;
    rafId = window.requestAnimationFrame(loop);
  }

  // Play control (only visible after a downgrade): force-start the animated feed
  // from the top. renderStatic() stripped the feed-anim class, and started=true
  // means loop() won't re-arm it, so we re-add it and reset here before starting.
  if (replay) {
    replay.addEventListener("click", function () {
      replay.hidden = true;
      feed.classList.add("feed-anim");
      resetFeed();
      state.idx = -1; state.phase = "idle"; state.timer = 0;
      startLoop();
    });
  }

  // Autoplay. The loop pauses itself when the hero is off-screen or the tab is
  // hidden (isPaused), so on mobile the readable static feed stays put until the
  // phone is scrolled into view, then the typewriter takes over.
  startLoop();
})();
