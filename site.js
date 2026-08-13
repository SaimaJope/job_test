(() => {
  const root = document.documentElement;

  try {
    const header = document.querySelector('.site-header');
    const toggle = document.querySelector('.nav-toggle');
    const navigation = document.querySelector('.primary-nav');
    const mobileQuery = window.matchMedia('(max-width: 900px)');
    const stillQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* ---------------------------------------------------------
       Navigation
       --------------------------------------------------------- */

    const setNavigation = (open) => {
      if (!toggle || !navigation) return;

      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.nav-toggle__label').textContent = open
        ? toggle.dataset.closeLabel
        : toggle.dataset.openLabel;
      navigation.dataset.open = String(open);
      navigation.toggleAttribute('inert', mobileQuery.matches && !open);
      document.body.classList.toggle('nav-open', open);
      /* The panel is opaque canvas, so the header must read as being
         on canvas while it is open, whatever it was over before. */
      header?.setAttribute('data-nav-open', String(open));
    };

    toggle?.addEventListener('click', () => {
      setNavigation(toggle.getAttribute('aria-expanded') !== 'true');
    });

    navigation?.addEventListener('click', (event) => {
      if (event.target.closest('a') && mobileQuery.matches) {
        setNavigation(false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') {
        setNavigation(false);
        toggle.focus();
      }
    });

    mobileQuery.addEventListener('change', () => {
      setNavigation(false);
    });

    setNavigation(false);

    /* ---------------------------------------------------------
       Header: condensed state and read position
       --------------------------------------------------------- */

    let queued = false;
    const toneZones = document.querySelectorAll('[data-tone="inverse"]');

    /* --- Read position -----------------------------------------
       The navigation already had a style for the current page. It
       now also reports the section actually being read, so the bar
       answers "where am I" and not only "where have I clicked".

       A page that marks its own nav entry in markup — the
       qualifications page does — keeps that mark and opts out: two
       marks in one bar is worse than one. */

    const sectionMarks = (() => {
      if (!navigation || navigation.querySelector('a[aria-current]')) return [];

      return Array.from(navigation.querySelectorAll('a[href^="#"]'))
        .map((link) => {
          const id = link.getAttribute('href');
          return { link, section: id.length > 1 ? document.querySelector(id) : null };
        })
        .filter((mark) => mark.section);
    })();

    let marked = null;

    const updateMarks = (band) => {
      if (!sectionMarks.length) return;

      /* Just under the header, a little into the reading area: the
         section a reader would say they are in, not the one whose
         last line is still leaving the screen. */
      const probe = band + window.innerHeight * 0.3;
      let current = null;

      for (const mark of sectionMarks) {
        const rect = mark.section.getBoundingClientRect();
        if (rect.top <= probe && rect.bottom > probe) current = mark.link;
      }

      /* The final section can never reach the probe on a short page
         or at the end of a long one; once the document bottom is
         reached its mark stands. */
      if (!current) {
        const end = document.documentElement.scrollHeight - window.innerHeight - 2;
        if (window.scrollY >= end) current = sectionMarks[sectionMarks.length - 1].link;
      }

      if (current === marked) return;

      marked?.removeAttribute('aria-current');
      current?.setAttribute('aria-current', 'true');
      marked = current;
    };

    const updateHeader = () => {
      queued = false;
      if (!header) return;

      const scrolled = window.scrollY;
      const travel = document.documentElement.scrollHeight - window.innerHeight;

      header.dataset.compact = String(scrolled > 40);
      header.style.setProperty(
        '--scroll-progress',
        travel > 0 ? String(Math.min(1, Math.max(0, scrolled / travel))) : '0'
      );

      /* Which surface is passing behind the glass. Hysteresis: the
         flip swaps glass and foreground together, so a single
         threshold lets a slow scroll chatter between the two.
         Entering costs more travel than leaving. */
      const band = header.getBoundingClientRect().height;
      const probe = header.dataset.tone === 'inverse' ? band * 0.4 : band * 0.6;
      let inverse = false;

      for (const zone of toneZones) {
        const rect = zone.getBoundingClientRect();
        if (rect.top <= probe && rect.bottom > probe) {
          inverse = true;
          break;
        }
      }

      header.dataset.tone = inverse ? 'inverse' : 'canvas';

      updateMarks(band);
    };

    const queueHeader = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(updateHeader);
    };

    updateHeader();
    window.addEventListener('scroll', queueHeader, { passive: true });
    window.addEventListener('resize', queueHeader, { passive: true });

    /* ---------------------------------------------------------
       Reveals: a section is marked once, when it arrives.
       Markup carries data-reveal so the start state is styled
       before first paint; nothing here can hide content that
       CSS has not already accounted for.
       --------------------------------------------------------- */

    const staged = document.querySelectorAll('[data-reveal]');

    const revealAll = () => {
      staged.forEach((element) => {
        element.dataset.reveal = 'in';
      });
    };

    if (!('IntersectionObserver' in window) || stillQuery.matches) {
      revealAll();
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.dataset.reveal = 'in';
            observer.unobserve(entry.target);
          });
        },
        { rootMargin: '0px 0px -12% 0px', threshold: 0.02 }
      );

      staged.forEach((element) => observer.observe(element));

      /* A section taller than the viewport, or one the observer never
         reports on, must not stay hidden. */
      window.setTimeout(revealAll, 4000);
    }

    /* ---------------------------------------------------------
       Homepage motion

       Only explicitly authored moments enter: selected supporting
       copy settles by ten pixels, and documentary photography is
       uncovered. The rest of the page is already in place.
       --------------------------------------------------------- */

    const motionElements = document.querySelectorAll('[data-motion]');

    const settleMotion = (element) => {
      element.dataset.motionState = 'in';
    };

    if (!('IntersectionObserver' in window) || stillQuery.matches) {
      motionElements.forEach(settleMotion);
    } else {
      const motionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            settleMotion(entry.target);
            motionObserver.unobserve(entry.target);
          });
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.04 }
      );

      motionElements.forEach((element) => motionObserver.observe(element));
      window.setTimeout(() => motionElements.forEach(settleMotion), 3000);
    }

    /* ---------------------------------------------------------
       Directional rules

       Every accent rule on the page wipes in from a fixed corner.
       That is correct for an entrance, which nobody aims, and wrong
       for a hover, which is aimed precisely. These two handlers
       report where the pointer crossed the border, so a rule opens
       under the cursor and — because the same handler runs on the
       way out — closes toward wherever it left.

       Origin only, and only at the two crossings: no pointermove
       listener, no per-frame work, nothing running while the pointer
       sits still. CSS keeps the fallbacks the rules shipped with, so
       touch, no-pointer and no-script all behave as before.
       --------------------------------------------------------- */

    const DIRECTIONAL = [
      '.capability',
      '.credential-row',
      '.operating-model__item',
      '.audience-secondary',
      '.membership-list li',
      '.service-secondary',
      '.contact-band__phone',
      '.text-link',
      '.primary-nav a',
      '.project-figure',
    ].join(',');

    const clamp = (value) => Math.min(100, Math.max(0, value));

    const markOrigin = (event) => {
      if (event.pointerType === 'touch') return;

      const from = event.relatedTarget;

      for (let node = event.target; node instanceof Element; node = node.parentElement) {
        if (node === document.body) break;
        if (!node.matches(DIRECTIONAL)) continue;
        /* pointerover/out also fire when moving between an element's
           own children. Only a crossing of this element's own border
           may move its origin. */
        if (from instanceof Node && node.contains(from)) continue;

        const rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;

        const x = clamp(((event.clientX - rect.left) / rect.width) * 100);
        const y = clamp(((event.clientY - rect.top) / rect.height) * 100);

        node.style.setProperty('--rule-origin-x', `${x.toFixed(2)}%`);
        node.style.setProperty('--rule-origin-y', `${y.toFixed(2)}%`);
      }
    };

    document.addEventListener('pointerover', markOrigin, { passive: true });
    document.addEventListener('pointerout', markOrigin, { passive: true });

    /* ---------------------------------------------------------
       Bokeh fields

       Out-of-focus lights behind the dark bookends of the page —
       the hero and the footer, each carrying its own canvas. What
       sells a defocused highlight is not a soft blob but a nearly
       flat disc with a faintly brighter rim, so each light is
       pre-rendered as exactly that. Distance does the rest: far
       lights are large, dim and soft; near ones smaller and more
       defined. They gather in loose clusters — a uniform scatter
       reads as confetti, clusters read as real light sources —
       and they drift a few pixels a second with a slow, uneven
       breathing, paused whenever their surface is off screen.

       data-strength scales a field's brightness: the footer runs
       hotter than the hero, where legibility of the headline asks
       for restraint.
       --------------------------------------------------------- */

    /* The surface's own range: pale cyan-white down to sky blue. */
    const bokehPalette = [
      [176, 216, 240],
      [118, 194, 236],
      [64, 164, 220],
    ];

    const bokehClusters = [
      { x: 0.15, y: 0.82, spread: 0.13, count: 5 },
      { x: 0.86, y: 0.26, spread: 0.17, count: 4 },
      { x: 0.66, y: 0.76, spread: 0.2, count: 3 },
      { x: 0.5, y: 0.5, spread: 0.4, count: 2 },
    ];

    /* Sum of three: a cheap bell curve, so clusters thin out at
       their edges instead of filling a box. */
    const gauss = () =>
      (Math.random() + Math.random() + Math.random()) / 1.5 - 1;

    const mountBokeh = (bokehCanvas) => {
      const bokehContext = bokehCanvas.getContext('2d');
      if (!bokehContext) return;

      const strength = Number(bokehCanvas.dataset.strength) || 1;

      let lights = [];
      let width = 0;
      let height = 0;
      let dpr = 1;
      let inView = false;
      let running = false;
      let frame = 0;
      let last = 0;

      const sprite = (radius, [r, g, b], softness) => {
        const size = radius * 2 + 2;
        const tile = document.createElement('canvas');
        tile.width = tile.height = Math.ceil(size * dpr);
        const brush = tile.getContext('2d');
        brush.scale(dpr, dpr);

        const glow = brush.createRadialGradient(
          size / 2, size / 2, 0,
          size / 2, size / 2, radius
        );
        const stop = (at, alpha) =>
          glow.addColorStop(at, `rgba(${r}, ${g}, ${b}, ${alpha})`);

        /* Flat-ish core, brighter rim, then out — the aperture
           shape, not a Gaussian blob. Softness widens the falloff
           until the rim all but disappears on the farthest lights. */
        stop(0, 0.78);
        stop(Math.max(0.3, 0.72 - softness * 0.34), 0.85);
        stop(Math.min(0.96, 0.97 - softness * 0.32), 1);
        stop(1, 0);

        brush.fillStyle = glow;
        brush.fillRect(0, 0, size, size);
        return tile;
      };

      const seed = () => {
        const scale = 0.72 + 0.48 * Math.min(width / 1200, 1);
        lights = [];

        bokehClusters.forEach((cluster) => {
          for (let i = 0; i < cluster.count; i += 1) {
            const depth = Math.random(); /* 0 near — 1 far */
            const drift = 1.15 - depth * 0.7;
            const pick = Math.random();
            const color = bokehPalette[pick < 0.45 ? 0 : pick < 0.8 ? 1 : 2];

            /* Strength grows the lights a little as well as
               brightening them, so a hotter field reads as nearer
               light, not a turned-up dial. */
            const radius = Math.round(
              (13 + 62 * Math.pow(depth, 1.45)) * scale * (1 + (strength - 1) * 0.3)
            );

            lights.push({
              x: (cluster.x + gauss() * cluster.spread) * width,
              y: (cluster.y + gauss() * cluster.spread) * height,
              vx: (Math.random() - 0.5) * 2.6 * drift,
              vy: (Math.random() - 0.5) * 1.8 * drift,
              radius,
              size: radius * 2 + 2,
              alpha: (0.04 + 0.065 * (1 - depth)) * (0.8 + Math.random() * 0.4) * strength,
              w1: 0.18 + Math.random() * 0.4,
              w2: 0.05 + Math.random() * 0.16,
              p1: Math.random() * Math.PI * 2,
              p2: Math.random() * Math.PI * 2,
              tile: sprite(radius, color, 0.3 + depth * 0.7),
            });
          }
        });
      };

      const draw = (time) => {
        bokehContext.clearRect(0, 0, width, height);
        bokehContext.globalCompositeOperation = 'lighter';

        lights.forEach((light) => {
          /* Two incommensurate sines: an uneven breathing rather
             than a metronome, never brighter than the light itself. */
          const breath =
            0.78 +
            0.22 *
              Math.sin(time * light.w1 + light.p1) *
              Math.sin(time * light.w2 + light.p2);

          const reach = light.radius;

          bokehContext.globalAlpha = light.alpha * breath;
          bokehContext.drawImage(
            light.tile,
            light.x - reach,
            light.y - reach,
            light.size,
            light.size
          );
        });

        bokehContext.globalAlpha = 1;
      };

      const tick = (now) => {
        frame = requestAnimationFrame(tick);
        const step = Math.min((now - last) / 1000, 0.1);
        last = now;

        lights.forEach((light) => {
          light.x += light.vx * step;
          light.y += light.vy * step;

          const reach = light.radius;
          if (light.x < -reach) light.x = width + reach;
          if (light.x > width + reach) light.x = -reach;
          if (light.y < -reach) light.y = height + reach;
          if (light.y > height + reach) light.y = -reach;
        });

        draw(now / 1000);
      };

      const setRunning = () => {
        const wants = inView && !stillQuery.matches && !document.hidden;
        if (wants === running) return;

        running = wants;
        if (running) {
          last = performance.now();
          frame = requestAnimationFrame(tick);
        } else {
          cancelAnimationFrame(frame);
        }
      };

      const fit = () => {
        const rect = bokehCanvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        width = rect.width;
        height = rect.height;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        bokehCanvas.width = Math.round(width * dpr);
        bokehCanvas.height = Math.round(height * dpr);
        bokehContext.setTransform(dpr, 0, 0, dpr, 0, 0);

        seed();
        /* A first frame regardless, so a still preference or a
           paused loop still gets the lights. */
        draw(2.4);
      };

      fit();

      if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
          inView = entries[0].isIntersecting;
          setRunning();
        }).observe(bokehCanvas);
      } else {
        inView = true;
        setRunning();
      }

      document.addEventListener('visibilitychange', setRunning);
      stillQuery.addEventListener('change', () => {
        setRunning();
        if (!running) draw(2.4);
      });

      /* Regenerate only when the canvas genuinely changes shape —
         a mobile address bar sliding away is not a new composition. */
      let sizeTimer = 0;
      window.addEventListener(
        'resize',
        () => {
          window.clearTimeout(sizeTimer);
          sizeTimer = window.setTimeout(() => {
            const rect = bokehCanvas.getBoundingClientRect();
            if (
              Math.round(rect.width) !== Math.round(width) ||
              Math.abs(rect.height - height) > 120
            ) {
              fit();
            }
          }, 180);
        },
        { passive: true }
      );
    };

    document.querySelectorAll('.bokeh-field').forEach(mountBokeh);

    /* ---------------------------------------------------------
       Current year
       --------------------------------------------------------- */

    document.querySelectorAll('[data-year]').forEach((element) => {
      element.textContent = String(new Date().getFullYear());
    });
  } catch (error) {
    /* Motion is an enhancement. If it cannot run, drop the flag and
       every start state with it, rather than leaving content hidden. */
    root.classList.remove('js');
    throw error;
  }
})();
