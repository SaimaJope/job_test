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
