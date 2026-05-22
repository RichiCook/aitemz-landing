  // Disable browser scroll restoration so a refresh during the QR intro
  // doesn't drop the visitor mid-page when the overlay clears.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  (function(){
    var intro  = document.getElementById('qrIntro');
    var grid   = document.getElementById('qrGrid');
    var label  = document.getElementById('qrLabel');
    var skipEl = document.getElementById('qrSkip');
    if (!intro || !grid) return;

    // Already played this session → strip it immediately, no flash.
    if (sessionStorage.getItem('aitemz_intro_v1') === 'shown') {
      intro.remove();
      return;
    }
    sessionStorage.setItem('aitemz_intro_v1', 'shown');
    document.body.classList.add('qr-locked');
    // Hold the page at the top while the overlay is up.
    window.scrollTo(0, 0);

    // ── Build a believable QR pattern ─────────────────────────────
    // 25×25 modules. Three finder patterns (7×7, top-left/top-right/
    // bottom-left), a 5×5 alignment pattern bottom-right, timing lines,
    // and pseudo-random data fill (seeded so it renders identically
    // for every visitor in this session — feels designed, not noisy).
    var SIZE = 25;
    var g = Array.from({length:SIZE}, function(){ return Array(SIZE).fill(0); });

    function finder(sx, sy){
      for (var y=0; y<7; y++) for (var x=0; x<7; x++){
        var border = x===0||x===6||y===0||y===6;
        var inner  = x>=2&&x<=4&&y>=2&&y<=4;
        g[sy+y][sx+x] = (border||inner) ? 1 : 0;
      }
    }
    finder(0,0); finder(SIZE-7,0); finder(0,SIZE-7);

    // Timing patterns
    for (var i=8; i<SIZE-8; i++){
      g[6][i] = i%2===0 ? 1 : 0;
      g[i][6] = i%2===0 ? 1 : 0;
    }

    // Alignment pattern bottom-right
    var ax = SIZE-9, ay = SIZE-9;
    for (var y=0; y<5; y++) for (var x=0; x<5; x++){
      var border = x===0||x===4||y===0||y===4;
      var center = x===2 && y===2;
      g[ay+y][ax+x] = (border||center) ? 1 : 0;
    }

    // Seeded RNG for the data fill — same pattern every visit
    var seed = 0x9b9c1a01;
    function rand(){
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
    }
    for (var y=0; y<SIZE; y++) for (var x=0; x<SIZE; x++){
      var inFinder = (x<8&&y<8) || (x>=SIZE-8&&y<8) || (x<8&&y>=SIZE-8);
      var inAlign  = x>=ax && x<ax+5 && y>=ay && y<ay+5;
      var inTiming = (x===6 && y>=7 && y<=SIZE-8) || (y===6 && x>=7 && x<=SIZE-8);
      if (inFinder||inAlign||inTiming) continue;
      g[y][x] = rand() > 0.52 ? 1 : 0;
    }

    // ── Render modules with a radial "from-the-center" draw stagger ──
    var frag = document.createDocumentFragment();
    var c = (SIZE-1)/2;
    var maxD = Math.hypot(c, c);
    for (var y=0; y<SIZE; y++){
      for (var x=0; x<SIZE; x++){
        var m = document.createElement('i');
        if (g[y][x]) m.className = 'on';
        var d = Math.hypot(x-c, y-c);
        // 40ms → 400ms — center first, corners last (faster scan-in)
        m.style.setProperty('--d', Math.round(40 + (d/maxD)*360));
        frag.appendChild(m);
      }
    }
    grid.appendChild(frag);

    // ── Choreograph the labels ──
    var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function setLabel(text){
      label.classList.add('swap');
      setTimeout(function(){ label.textContent = text; label.classList.remove('swap'); }, 220);
    }

    var timers = [];
    function schedule(ms, fn){ timers.push(setTimeout(fn, ms)); }

    if (prefersReduced){
      // Reduced motion: hold a static frame, then fade. No scan, no burst.
      schedule(800,  function(){ setLabel('Content generated'); });
      schedule(1300, dismiss);
    } else {
      // Four-state narrative: gather (with scan sweep) → process → generate → ready.
      schedule(1200, function(){ setLabel('Processing data'); });
      schedule(1700, function(){ setLabel('Generating content'); });
      schedule(2200, function(){ setLabel('Content generated'); });
      schedule(2550, function(){ intro.classList.add('activate'); });
      schedule(3150, dismiss);
    }

    function dismiss(){
      if (!intro) return;
      intro.classList.add('done');
      timers.forEach(clearTimeout);
      timers = [];
      // Always reveal the page at the very top — fights any restored
      // scroll position from refresh / back-nav.
      window.scrollTo(0, 0);
      setTimeout(function(){
        document.body.classList.remove('qr-locked');
        if (intro && intro.parentNode) intro.parentNode.removeChild(intro);
        intro = null;
        // Belt + braces — once the overlay is gone, snap to top again
        // in case any layout-induced scroll happened during dismissal.
        window.scrollTo(0, 0);
      }, 650);
    }

    // Manual skip surfaces
    skipEl.addEventListener('click', dismiss);
    intro.addEventListener('click', function(e){
      if (e.target === intro) dismiss();
    });
    document.addEventListener('keydown', function onKey(e){
      if (e.key === 'Escape' || e.key === 'Enter'){
        dismiss();
        document.removeEventListener('keydown', onKey);
      }
    });
  })();

/* ===== MAIN PAGE BEHAVIORS ===== */

  /* --- nav scroll state ---
     The nav grows at the top of the page and contracts after 40px of
     scroll. We track its current height in --nav-h so sticky elements
     below (marquee, comparison heads) snap to the correct offset. */
  const nav = document.getElementById('nav');
  const updateNavH = () => {
    document.documentElement.style.setProperty(
      '--nav-h', nav.getBoundingClientRect().height + 'px'
    );
  };
  updateNavH();
  let navRemeasureT = 0;
  let prevScrolled = null;
  window.addEventListener('scroll', () => {
    const shouldBeScrolled = window.scrollY > 40;
    if (shouldBeScrolled !== prevScrolled) {
      prevScrolled = shouldBeScrolled;
      nav.classList.toggle('scrolled', shouldBeScrolled);
      // Only re-measure once the transition finishes, and only when the
      // state actually changes — avoids dozens of layout reads per scroll.
      clearTimeout(navRemeasureT);
      navRemeasureT = setTimeout(updateNavH, 470);
    }
  }, {passive:true});
  window.addEventListener('resize', updateNavH);

  /* --- marquee items (links to in-page sections) --- */
  const marqueeItems = [
    {label:'Digital Product Passport', href:'#capabilities'},
    {label:'Amplifying Products',      href:'#what-we-do'},
    {label:'Product Intelligence',     href:'#capabilities'},
    {label:'AI for Fashion',           href:'#why-now'},
    {label:'Traceability',             href:'#capabilities'},
    {label:'EU ESPR-ready',            href:'#why-now'},
    {label:'NFC · QR',                 href:'#capabilities'},
    {label:'Semantic Capital',         href:'#capabilities'},
  ];
  const track = document.getElementById('marquee');
  const buildSet = () => {
    const frag = document.createDocumentFragment();
    marqueeItems.forEach((it, i) => {
      const span = document.createElement('span');
      span.className = 'item' + (i % 3 === 2 ? ' accent' : '');
      span.innerHTML = '<a href="'+it.href+'">'+it.label+'</a> <span class="star">✦</span>';
      frag.appendChild(span);
    });
    return frag;
  };
  track.appendChild(buildSet());
  track.appendChild(buildSet());

  /* --- ticker sticky behavior ---
     Measure the marquee height and feed it to the hero so the marquee lands
     at the bottom of the first viewport. Then watch when the marquee crosses
     the nav line and toggle the .stuck class for a tighter visual state. */
  const marquee = document.querySelector('.marquee');
  const navEl   = document.getElementById('nav');
  const updateTickerVar = () => {
    const h = marquee ? marquee.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--ticker-h', h + 'px');
    // also push scroll-margin into sections so anchor jumps clear the sticky chrome
    const navH = navEl.getBoundingClientRect().height || 62;
    document.documentElement.style.setProperty('--sticky-offset', (h + navH + 8) + 'px');
  };
  updateTickerVar();
  window.addEventListener('resize', updateTickerVar);
  // observe sticky engagement: when top sentinel goes negative, marquee is pinned
  const stickySentinel = document.createElement('div');
  stickySentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none';
  marquee.parentNode.insertBefore(stickySentinel, marquee);
  const stickIO = new IntersectionObserver(([entry]) => {
    marquee.classList.toggle('stuck', !entry.isIntersecting && entry.boundingClientRect.top < 0);
  }, {threshold:[0,1]});
  stickIO.observe(stickySentinel);

  /* --- capabilities carousel (mobile) ---
     Build dot indicators, sync active dot to the card in view, and let users
     tap a dot to snap to that card. Only relevant under 780px, but the
     observer is cheap to leave on and it harmlessly no-ops on desktop. */
  (() => {
    const scroller = document.querySelector('.caps');
    const dotsHost = document.getElementById('capsDots');
    if (!scroller || !dotsHost) return;
    const cards = [...scroller.querySelectorAll('.cap')];
    if (!cards.length) return;
    // Build dots
    dotsHost.innerHTML = '';
    cards.forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'caps-dot' + (i === 0 ? ' is-active' : '');
      b.setAttribute('aria-label', `Show capability ${i+1} of ${cards.length}`);
      b.addEventListener('click', () => {
        const target = cards[i];
        const left = target.offsetLeft - scroller.offsetLeft - 20; // match scroll-padding-left
        scroller.scrollTo({ left, behavior: 'smooth' });
      });
      dotsHost.appendChild(b);
    });
    const dots = [...dotsHost.children];
    // Track most-visible card
    const capIO = new IntersectionObserver((entries) => {
      // pick the entry with highest intersectionRatio that is intersecting
      let best = null;
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
      });
      if (!best) return;
      const idx = cards.indexOf(best.target);
      if (idx < 0) return;
      dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
    }, { root: scroller, threshold: [0.5, 0.75, 0.95] });
    cards.forEach(c => capIO.observe(c));
  })();

  /* --- reveal on scroll --- */

  /* HERO PARALLAX ---
     As the visitor scrolls down, the hero lingers — it translates DOWN at
     half scroll speed and fades, so the next section (capabilities) slides
     UP OVER it. The hero is given a lower z-index and the next section a
     higher one with a solid background so the overlap reads cleanly.
     rAF-throttled; disabled on mobile (the hero is already tight there). */
  (() => {
    const hero = document.querySelector('.hero');
    const next = document.getElementById('capabilities');
    if (!hero || !next) return;

    hero.style.willChange = 'transform, opacity';
    hero.style.zIndex     = '1';
    if (getComputedStyle(hero).position === 'static') {
      hero.style.position = 'relative';
    }
    // Ensure the next section visually covers the hero during the reveal.
    next.style.position   = next.style.position || 'relative';
    next.style.zIndex     = '3';
    next.style.background = 'var(--black)';

    let ticking = false;
    const mq    = window.matchMedia('(max-width:780px)');

    function update(){
      ticking = false;
      if (mq.matches){
        if (hero.style.transform){ hero.style.transform = ''; hero.style.opacity = ''; }
        return;
      }
      const y     = window.scrollY;
      const heroH = hero.offsetHeight;
      // Hero translates DOWN at 0.5× scroll speed — appears to "stay" while
      // the page scrolls past. Cap at hero height so it doesn't drift into
      // sections far below.
      // NOTE: don't tween opacity here — the hero contains 3 huge blurred
      // orbs, and animating opacity on the parent forces a full recomposite
      // of the blurred layers every frame. The next section paints over the
      // hero with var(--black) on its own once scrolled past.
      const offset = Math.min(y * 0.5, heroH);
      hero.style.transform = `translate3d(0, ${offset}px, 0)`;
    }

    function onScroll(){
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    update();
  })();

  /* SOFT PARALLAX — principle ("Value isn't added. It reveals itself.")
     Two-line quote sitting between capabilities and stats. The lines drift
     at slightly different rates as the visitor scrolls past them, giving
     the moment a sense of depth without being theatrical. */
  (() => {
    const sec = document.getElementById('principle');
    if (!sec) return;
    const q1 = sec.querySelector('.q-1');
    const q2 = sec.querySelector('.q-2');
    if (!q1 || !q2) return;

    q1.style.willChange = 'transform';
    q2.style.willChange = 'transform';

    let ticking = false;
    let lastP   = -1;
    const mq    = window.matchMedia('(max-width:780px)');

    function update(){
      ticking = false;
      if (mq.matches){
        if (q1.style.transform){ q1.style.transform = ''; q2.style.transform = ''; }
        return;
      }
      const rect  = sec.getBoundingClientRect();
      const vh    = window.innerHeight;
      const total = rect.height + vh;
      let p       = (vh - rect.top) / total;
      p = Math.max(0, Math.min(1, p));
      if (Math.abs(p - lastP) < 0.003) return;
      lastP = p;

      // Symmetric around section midpoint. q1 drifts more than q2 so the
      // two lines pull apart on entry and exit, then settle in alignment
      // at the section's center. Light magnitudes — this is the "soft" part.
      const c = p - 0.5;
      q1.style.transform = `translate3d(0, ${c * -50}px, 0)`;
      q2.style.transform = `translate3d(0, ${c * -20}px, 0)`;
    }

    function onScroll(){
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { lastP = -1; update(); });
    update();
  })();

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('in'), i * 60);
        io.unobserve(e.target);
      }
    });
  }, {threshold:0.14});
  document.querySelectorAll('.reveal').forEach(el => {
    // Second principle line gets its own observer with a higher threshold
    // and rootMargin so the reveal only fires once the line is meaningfully
    // in view — not when the section barely enters the viewport.
    if (el.classList.contains('q-2')) {
      const io2 = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io2.unobserve(e.target);
          }
        });
      }, {threshold: 0.55, rootMargin: '0px 0px -10% 0px'});
      io2.observe(el);
      return;
    }
    io.observe(el);
  });

  /* --- counter animation --- */
  const animCount = (el) => {
    const target = parseFloat(el.dataset.target);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const supMatch = el.innerHTML.match(/<sup>.*?<\/sup>/);
    const sup = supMatch ? supMatch[0] : '';
    const dur = 1400;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = (target * eased).toFixed(decimals);
      if (suffix) {
        el.innerHTML = prefix + val + '<span style="font-size:.5em;font-weight:400;color:var(--grey-60);margin-left:2px">'+suffix+'</span>';
      } else {
        el.innerHTML = prefix + val + sup;
      }
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const statIO = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        animCount(e.target);
        statIO.unobserve(e.target);
      }
    });
  }, {threshold:0.4});
  document.querySelectorAll('.stat-num').forEach(el => statIO.observe(el));

  /* --- compare-two scroll progress ---
     Drive a CSS var --cmp-progress (0 → 1) on the .compare-two element based
     on how far the visitor has scrolled through the comparison section, and
     also drive --eye-prog (0 → 1) on each column to animate the eyebrow from
     its rest position above the headline down to under the pinned headline.
     Uses rAF-throttled scroll listening. */
  (() => {
    const cmp = document.querySelector('.compare-two');
    if (!cmp) return;
    const cols = cmp.querySelectorAll('.cmp-col');
    if (!cols.length) return;
    const wwd = document.querySelector('.what-we-do');

    // Cache the h3 height on the document root so the eyebrow's CSS transform
    // knows how far up to start. Recompute on resize because the h3 uses a
    // clamp() font-size.
    const measureH3 = () => {
      const h3 = cmp.querySelector('.cmp-col h3');
      if (!h3) return;
      const h = h3.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--cmp-h3-h', h + 'px');
    };
    measureH3();
    window.addEventListener('resize', measureH3);

    let raf = 0;
    const measure = () => {
      raf = 0;
      const nav = parseFloat(getComputedStyle(document.documentElement)
                  .getPropertyValue('--nav-h')) || 62;

      // Per-column eyebrow lift progress + overall section scroll progress.
      let maxProgress = 0;
      cols.forEach(col => {
        const head = col.querySelector('.cmp-col-head');
        if (!head) return;
        const colRect = col.getBoundingClientRect();
        const headH = head.getBoundingClientRect().height;

        // --- progress rail: 0 the moment the column pins, 1 when the last row
        // is about to scroll out from under the head.
        const total = colRect.height - headH;
        const passed = nav - colRect.top;
        const railP = Math.max(0, Math.min(1, passed / Math.max(1, total)));
        if (railP > maxProgress) maxProgress = railP;

        // --- eyebrow lift: completes by the time the column has just pinned
        // (so when the head is "in place" the eyebrow is already docked, and
        // there's no awkward empty-gap state between h3 and the progress bar).
        // Starts well before the pin so the slide feels tied to the column
        // approaching the sticky zone, finishes right at the pin moment.
        const eyeStart = -140;     // px past pin when transition starts (negative = before pin)
        const eyeDist  = 140;      // total transition distance — completes at passed=0 (col pins)
        const eyeP = Math.max(0, Math.min(1, (passed - eyeStart) / eyeDist));
        head.style.setProperty('--eye-prog', eyeP.toFixed(4));
      });
      cmp.style.setProperty('--cmp-progress', maxProgress.toFixed(4));

      // --- section parallax: as the visitor scrolls past the comparison
      // section, lift the entire block upward at a slightly slower rate than
      // page scroll, so the following section slides up over it. The lift
      // engages only near the end of the section so the sticky column heads
      // behave normally for the majority of the scroll. */
      if (wwd) {
        const wwdRect = wwd.getBoundingClientRect();
        const wwdBottom = wwdRect.bottom;
        const vh = window.innerHeight;
        // Start lifting when the section's bottom is ~vh*0.9 from viewport top
        // (i.e. the user is almost done with the section), complete the lift
        // by the time the bottom reaches viewport top.
        const liftStart = vh * 0.9;
        const liftEnd   = 0;
        const t = Math.max(0, Math.min(1, (liftStart - wwdBottom) / (liftStart - liftEnd)));
        const lift = t * 140; // max parallax distance in px
        wwd.style.setProperty('--wwd-lift', `-${lift.toFixed(1)}px`);
      }
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onScroll, {passive:true});
    window.addEventListener('resize', onScroll);
    measure();
  })();

  /* --- expandable stat cards ---
     click anywhere on the card OR press the explicit Why button to toggle.
     hover on desktop also opens the panel (only when nothing is currently
     pinned-open via click) for the immediate skim experience. */
  const stats = document.querySelectorAll('.stat.expandable');
  let pinned = null; // currently click-pinned card
  const setOpen = (card, open) => {
    card.classList.toggle('is-open', open);
    const btn = card.querySelector('.stat-toggle');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  stats.forEach(card => {
    const btn = card.querySelector('.stat-toggle');
    const togglePin = (e) => {
      e.stopPropagation();
      const willOpen = !(pinned === card);
      stats.forEach(c => setOpen(c, false));
      if (willOpen) { setOpen(card, true); pinned = card; }
      else { pinned = null; }
    };
    btn && btn.addEventListener('click', togglePin);
    card.addEventListener('click', togglePin);
    // hover preview only when nothing is pinned (and only on real pointers)
    card.addEventListener('mouseenter', () => {
      if (pinned) return;
      if (!matchMedia('(hover:hover)').matches) return;
      setOpen(card, true);
    });
    card.addEventListener('mouseleave', () => {
      if (pinned === card) return;
      setOpen(card, false);
    });
  });

  /* --- LIVE STUDIO scrollytelling ---
     Drives the phone's inner tape (vertical translate) and the four
     dashboard cards (staggered in-states) from scroll progress within the
     section. rAF-throttled. CSS handles the mobile fallback. */
  (() => {
    // ── Phone QR module grid ──────────────────────────────────
    // Same finder/timing/alignment + seeded data fill as the intro QR,
    // but smaller and rendered into the phone scan screen.
    (function buildPhoneQr(){
      const host = document.getElementById('phoneQrGrid');
      if (!host || host.childElementCount) return;
      const SIZE = 25;
      const g = Array.from({length:SIZE}, () => Array(SIZE).fill(0));
      const finder = (sx, sy) => {
        for (let y=0; y<7; y++) for (let x=0; x<7; x++){
          const border = x===0||x===6||y===0||y===6;
          const inner  = x>=2&&x<=4&&y>=2&&y<=4;
          g[sy+y][sx+x] = (border||inner) ? 1 : 0;
        }
      };
      finder(0,0); finder(SIZE-7,0); finder(0,SIZE-7);
      for (let i=8; i<SIZE-8; i++){
        g[6][i] = i%2===0 ? 1 : 0;
        g[i][6] = i%2===0 ? 1 : 0;
      }
      const ax = SIZE-9, ay = SIZE-9;
      for (let y=0; y<5; y++) for (let x=0; x<5; x++){
        const border = x===0||x===4||y===0||y===4;
        const center = x===2 && y===2;
        g[ay+y][ax+x] = (border||center) ? 1 : 0;
      }
      // seeded RNG so the pattern is deterministic
      let seed = 0xa3e91b27;
      const rand = () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
      };
      for (let y=0; y<SIZE; y++) for (let x=0; x<SIZE; x++){
        const inFinder = (x<8&&y<8) || (x>=SIZE-8&&y<8) || (x<8&&y>=SIZE-8);
        const inAlign  = x>=ax && x<ax+5 && y>=ay && y<ay+5;
        const inTiming = (x===6 && y>=7 && y<=SIZE-8) || (y===6 && x>=7 && x<=SIZE-8);
        if (inFinder||inAlign||inTiming) continue;
        g[y][x] = rand() > 0.52 ? 1 : 0;
      }
      const frag = document.createDocumentFragment();
      const c = (SIZE-1)/2;
      const maxD = Math.hypot(c, c);
      for (let y=0; y<SIZE; y++) for (let x=0; x<SIZE; x++){
        const m = document.createElement('i');
        if (g[y][x]) m.className = 'on';
        const d = Math.hypot(x-c, y-c);
        m.style.setProperty('--d', Math.round((d/maxD) * 700));
        frag.appendChild(m);
      }
      host.appendChild(frag);
    })();

    const studio   = document.getElementById('studio');
    const tape     = document.getElementById('studioTape');
    const cardDeck = document.getElementById('studioCards');
    const progress = document.getElementById('studioProgress');
    if (!studio || !tape || !cardDeck) return;

    const cards = [...cardDeck.querySelectorAll('.studio-card')];
    let ticking = false;
    let lastP = -1;

    if (!document.getElementById('studio-progress-fill')){
      const s = document.createElement('style');
      s.id = 'studio-progress-fill';
      s.textContent = '.studio-progress::after{width:var(--w,0%)}';
      document.head.appendChild(s);
    }

    /* --- WHY NOW thesis · typewriter on scroll ---
       Three-line takeaway. Each line types itself in steps; when the prior
       line finishes, the caret moves to the next. Triggers once when the
       block crosses 35% into the viewport. */
    (function thesisTypewriter(){
      const block = document.getElementById('whynowThesis');
      if (!block) return;
      const lines = [...block.querySelectorAll('.tw-line')];
      if (!lines.length) return;
      // Read durations from CSS so the caret can hop in sync.
      const dur = (el) => {
        const cs = getComputedStyle(el.querySelector('.tw-inner'));
        const d  = parseFloat(cs.transitionDuration) * 1000;
        const dl = parseFloat(cs.transitionDelay) * 1000;
        return { delay: isFinite(dl) ? dl : 0, dur: isFinite(d) ? d : 1400 };
      };
      const thesisIO = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          thesisIO.unobserve(e.target);
          // start typing — every line gets `typed` immediately so its
          // CSS transition kicks in; caret is moved with timed swaps so
          // it only sits at the end of the currently-typing line.
          lines.forEach(l => l.classList.add('typed'));
          let t = 0;
          lines.forEach((l, i) => {
            const { delay, dur: d } = dur(l);
            const startAt = delay;
            setTimeout(() => {
              lines.forEach(x => x.classList.remove('typing'));
              l.classList.add('typing');
            }, startAt);
            t = Math.max(t, startAt + d);
          });
          // clear final caret a beat after last line finishes
          setTimeout(() => {
            lines.forEach(x => x.classList.remove('typing'));
          }, t + 500);
        });
      }, { threshold: 0.35 });
      thesisIO.observe(block);
    })();

    /* ---- Scroll-driven update — works on both desktop and mobile ----
       Same pattern: scroll position within the studio-scroll section drives
       the phone tape, then the card deck. Mobile uses a slightly later
       phase boundary (tape gets more scroll room) and adds the
       `.phase-cards` class to the stage at that boundary to swap phone for
       cards inside the sticky stage. */
    function update(){
      ticking = false;

      const rect = studio.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) return;
      let p = -rect.top / total;
      p = Math.max(0, Math.min(1, p));
      if (Math.abs(p - lastP) < 0.002) return;
      lastP = p;

      const isMobile = window.matchMedia('(max-width:780px)').matches;
      const phonePhaseEnd = isMobile ? 0.55 : 0.45;

      // Phone tape advances during the phone phase.
      const phoneProgress = Math.min(1, p / phonePhaseEnd);
      const scroller = tape.parentElement;
      const tapeH    = tape.scrollHeight;
      const viewH    = scroller.clientHeight;
      const maxTape  = Math.max(0, tapeH - viewH);
      tape.style.transform = `translate3d(0, ${(-phoneProgress * maxTape).toFixed(2)}px, 0)`;

      // Cards deck inner translates so the 8 cards scroll through the
      // available cards-deck height as the user keeps scrolling past the
      // phone phase. Driven on both desktop AND mobile so the cards
      // section consumes the rest of the studio-scroll height — without
      // it, the user would scroll past empty cards and into the next
      // section before all 8 cards have been seen.
      const deckInner = document.getElementById('studioCardsInner');
      if (deckInner){
        const deckProgress = Math.max(0, (p - phonePhaseEnd) / (1 - phonePhaseEnd));
        const deckHost = deckInner.parentElement;
        const innerH   = deckInner.scrollHeight;
        const hostH    = deckHost.clientHeight;
        const maxDeck  = Math.max(0, innerH - hostH);
        deckInner.style.transform = `translate3d(0, ${(-deckProgress * maxDeck).toFixed(2)}px, 0)`;
      }

      // Mobile phase swap — phone slides up, cards slide in, both
      // proportionally tied to scroll progress (no CSS animation). The
      // swap window is a short 10% scroll band centered on phonePhaseEnd
      // so the transition is gradual and feels continuous with scrolling.
      if (isMobile){
        const swapStart = phonePhaseEnd - 0.05;
        const swapEnd   = phonePhaseEnd + 0.05;
        const swapT = Math.max(0, Math.min(1, (p - swapStart) / (swapEnd - swapStart)));
        const phoneWrap = studio.querySelector('.studio-phone-wrap');
        const cardsEl   = studio.querySelector('.studio-cards');
        if (phoneWrap) phoneWrap.style.transform =
          `translate3d(0, ${(-swapT * 110).toFixed(2)}%, 0)`;
        if (cardsEl) {
          cardsEl.style.transform =
            `translate3d(0, ${((1 - swapT) * 110).toFixed(2)}%, 0)`;
          cardsEl.style.opacity = swapT.toFixed(3);
          cardsEl.style.pointerEvents = swapT > 0.5 ? 'auto' : 'none';
        }
      }

      // Card reveals — 8 thresholds. Cards 1–4 during phone phase, cards
      // 5–8 once the deck takes over.
      cards.forEach((card, i) => {
        const threshold = i < 4
          ? 0.05 + i * 0.09
          : phonePhaseEnd + (i - 4) * 0.10;
        card.classList.toggle('in', p >= threshold);
      });

      if (progress) progress.style.setProperty('--w', (p * 100).toFixed(1) + '%');
    }

    function onScroll(){
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { lastP = -1; update(); });
    update();

  })();

  /* --- waitlist submit --- */
  function submitWaitlist() {
    const email = document.getElementById('wEmail').value.trim();
    // require an "@" and at least one "." after it (basic email shape)
    const at = email.indexOf('@');
    const valid = at > 0 && email.indexOf('.', at) > at + 1 && email.length >= 5;
    if (!email || !valid) {
      const form = document.getElementById('wform');
      form.style.borderColor = '#ee6bcf';
      setTimeout(() => form.style.borderColor = '', 1200);
      return;
    }
    const form = document.getElementById('wform');
    const success = document.getElementById('wsuccess');
    if (form && success) {
      form.classList.add('hidden');
      success.classList.add('visible');
    }
    setTimeout(() => {
      window.location.href = 'onboarding.html?email=' + encodeURIComponent(email);
    }, 1600);
  }
