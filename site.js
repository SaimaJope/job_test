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
