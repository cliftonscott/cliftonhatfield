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

  /* ── Pointer parallax on the phone (desktop, fine pointer, motion ok) ─ */
  var phone = document.querySelector(".phone");
  if (phone && animOK && window.matchMedia &&
      window.matchMedia("(hover:hover) and (pointer:fine)").matches) {
    var hero = document.querySelector(".hero") || document;
    var tTx = 0, tTy = 0, tCx = 0, tCy = 0, tiltRaf = null;
    var MAX_TILT = 5; // degrees
    function tiltLoop() {
      tCx += (tTx - tCx) * 0.12; tCy += (tTy - tCy) * 0.12;
      phone.style.transform =
        "perspective(1100px) rotateX(" + tCx.toFixed(2) + "deg) rotateY(" + tCy.toFixed(2) + "deg)";
      if (Math.abs(tTx - tCx) > 0.02 || Math.abs(tTy - tCy) > 0.02) {
        tiltRaf = window.requestAnimationFrame(tiltLoop);
      } else { tiltRaf = null; }
    }
    function kick() { if (!tiltRaf) tiltRaf = window.requestAnimationFrame(tiltLoop); }
    hero.addEventListener("mousemove", function (e) {
      var r = phone.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
      var dy = (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
      tTy = Math.max(-1, Math.min(1, dx)) * MAX_TILT;   // rotateY follows cursor X
      tTx = Math.max(-1, Math.min(1, dy)) * -MAX_TILT;  // rotateX inverted
      kick();
    }, { passive: true });
    hero.addEventListener("mouseleave", function () { tTx = 0; tTy = 0; kick(); });
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

  var CHAR_MS = 17;      // base per-character typing speed (jittered per char)
  var REVEAL_MS = 300;   // fade/rise before the typing indicator
  var COMPOSE_MS = 750;  // "typing…" indicator dwell before text appears
  var GAP_MS = 520;      // pause between posts
  var HOLD_MS = 8000;    // pause on a completed thread before looping
  var FADE_MS = 480;     // feed fade-out before the thread loops

  // Build a per-character reveal schedule with organic cadence: each character
  // gets a jittered delay, with extra pauses after sentence/clause punctuation —
  // so the typewriter reads like someone composing, not a metronome. Rebuilt per
  // post each cycle for fresh variation.
  function buildSchedule(text) {
    var arr = [], t = 0;
    for (var c = 0; c < text.length; c++) {
      t += CHAR_MS * (0.75 + Math.random() * 0.55);
      arr.push(t);
      var ch = text.charAt(c);
      if (ch === "." || ch === "!" || ch === "?") t += 230;
      else if (ch === "," || ch === ";" || ch === ":") t += 120;
      else if (ch === "—" || ch === "–") t += 150; // em / en dash
    }
    return arr;
  }
  var schedules = posts.map(function () { return null; });

  // Inject a "typing…" dots indicator into each post (JS-only, so the no-JS /
  // reduced-motion baseline never shows it). Visible only while .composing.
  var typingDots = postTexts.map(function (box) {
    if (!box) return null;
    var d = document.createElement("span");
    d.className = "typing-dots";
    d.setAttribute("aria-hidden", "true");
    d.innerHTML = "<i></i><i></i><i></i>";
    box.appendChild(d);
    return d;
  });

  // Soft coral glow behind the wordmark — give it a gentle pulse when a new post
  // lands, tying the hero and the live feed together.
  var glow = document.querySelector(".hero-glow");
  function pulseGlow() {
    if (glow && glow.animate) glow.animate(
      [{ filter: "blur(8px) brightness(1)", transform: "scale(1)" },
       { filter: "blur(8px) brightness(1.4)", transform: "scale(1.05)" },
       { filter: "blur(8px) brightness(1)", transform: "scale(1)" }],
      { duration: 1100, easing: "ease-out" });
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
  // Quick scale-bounce on the heart the instant a like lands. Uses the Web
  // Animations API (real time, one-shot) — increments only fire while visible,
  // so no pulses run off-screen.
  function pulseHeart(i) {
    var h = heartEl[i];
    if (h && h.animate) h.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.55)" }, { transform: "scale(1)" }],
      { duration: 320, easing: "cubic-bezier(.34,1.56,.64,1)" });
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
    talkClock = 0;
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
        nextRepost[i] += rand(RT_MIN_MS, RT_MAX_MS);
      }
    }
  }

  /* ── Avatar expression frames (idle / talk / blink) ──────────────── */
  // The composing agent's mouth flaps (idle<->talk); posted agents blink now and
  // then. Frames are the per-agent SVGs from generate-avatars.mjs; we derive the
  // talk/blink URLs from the idle src already in the DOM and preload them.
  var TALK_MS = 190;                         // mouth flap half-period
  var BLINK_DUR_MS = 130;                     // eyes-closed duration
  var BLINK_MIN_MS = 2600, BLINK_MAX_MS = 6200; // gap between blinks
  var avImg = posts.map(function (p) { return p.querySelector(".post-avatar"); });
  var frames = avImg.map(function (el) {
    if (!el) return null;
    var idle = el.getAttribute("src");
    return { idle: idle, talk: idle.replace(/\.svg$/, "-talk.svg"),
             blink: idle.replace(/\.svg$/, "-blink.svg") };
  });
  frames.forEach(function (f) { if (f) { new Image().src = f.talk; new Image().src = f.blink; } });
  var talkClock = 0;
  var nextBlink = posts.map(function () { return 0; });
  var blinkEnd = posts.map(function () { return -1; });

  function setFrame(i, src) {
    var el = avImg[i];
    if (el && el.getAttribute("src") !== src) el.setAttribute("src", src);
  }
  function tickAvatars(dt) {
    talkClock += dt;
    for (var i = 0; i < posts.length; i++) {
      if (!frames[i]) continue;
      if (state.idx === i && (state.phase === "typing" || state.phase === "compose")) { // composing
        setFrame(i, Math.floor(talkClock / TALK_MS) % 2 ? frames[i].talk : frames[i].idle);
      } else if (liveMs[i] >= 0) {                                  // posted: blink
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
    posts.forEach(function (p) { p.classList.add("show"); p.classList.remove("is-typing", "composing"); });
    typed.forEach(function (el, i) { if (el) el.textContent = fullText[i]; });
    resetActivity();
  }

  function resetFeed() {
    posts.forEach(function (p) { p.classList.remove("show", "is-typing", "composing"); });
    typed.forEach(function (el) { if (el) el.textContent = ""; });
    feed.classList.remove("feed-out");
    scrollTarget = 0;
    feed.scrollTop = 0; // snap to top instantly so replay never starts mid-scroll
    resetActivity();
  }

  // Keep the post being written in view, like a live timeline. On desktop the
  // whole thread fits so this is a no-op; on smaller/taller content it follows
  // the active post (chat-style: newest near the bottom). We tween scrollTop
  // ourselves on the virtual clock (tickScroll) rather than CSS smooth-scroll —
  // CSS smooth makes scrollTop reads lag behind, which mis-positioned the feed on
  // replay and clipped the first post. scrollToActive only sets the target.
  var scrollTarget = 0;
  function scrollToActive(i) {
    var p = posts[i];
    var topInContent = (p.getBoundingClientRect().top - feed.getBoundingClientRect().top) + feed.scrollTop;
    var bottomInContent = topInContent + p.offsetHeight;
    var t = scrollTarget;
    if (bottomInContent > scrollTarget + feed.clientHeight) t = bottomInContent - feed.clientHeight + 6;
    if (topInContent < t) t = topInContent; // post taller than view -> show its top
    scrollTarget = Math.max(0, Math.min(t, feed.scrollHeight - feed.clientHeight));
  }
  function tickScroll(dt) {
    var cur = feed.scrollTop, diff = scrollTarget - cur;
    if (Math.abs(diff) < 0.5) { if (cur !== scrollTarget) feed.scrollTop = scrollTarget; return; }
    feed.scrollTop = cur + diff * Math.min(1, dt / 140); // framerate-independent ease
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

    if (state.phase === "reveal") {
      // After the row rises in, show the "typing…" indicator while the agent "composes".
      if (state.timer >= REVEAL_MS) { posts[i].classList.add("composing"); state.phase = "compose"; state.timer = 0; }
    } else if (state.phase === "compose") {
      if (state.timer >= COMPOSE_MS) { posts[i].classList.remove("composing"); state.phase = "typing"; state.timer = 0; }
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

  // Pause when the hero is off-screen or the tab is hidden.
  var onScreen = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
    }, { threshold: 0.12 }).observe(feed);
  }
  function isPaused() { return document.hidden || !onScreen; }

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

  // Replay control: restart the thread from the top.
  var replay = document.getElementById("replay");
  if (replay) {
    replay.addEventListener("click", function () {
      if (!running) { startLoop(); return; }
      resetFeed(); state.idx = -1; state.phase = "idle"; state.timer = 0;
    });
  }

  // Autoplay. The loop pauses itself when the hero is off-screen or the tab is
  // hidden (isPaused), so on mobile the readable static feed stays put until the
  // phone is scrolled into view, then the typewriter takes over.
  startLoop();
})();
