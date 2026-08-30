(function () {
  var menuToggle = document.getElementById('menuToggle');
  var menuClose = document.getElementById('menuClose');
  var menuOverlay = document.getElementById('menuOverlay');

  function openMenu() {
    syncCloseButtonPosition();
    menuOverlay.classList.add('is-open');
    menuOverlay.setAttribute('aria-hidden', 'false');
    menuToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    menuOverlay.classList.remove('is-open');
    menuOverlay.setAttribute('aria-hidden', 'true');
    menuToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  function syncCloseButtonPosition() {
    var toggleRect = menuToggle.getBoundingClientRect();
    var centerX = toggleRect.left + toggleRect.width / 2;
    var centerY = toggleRect.top + toggleRect.height / 2;
    var closeSize = menuClose.offsetWidth || 30;
    document.documentElement.style.setProperty('--menu-close-left', (centerX - closeSize / 2) + 'px');
    document.documentElement.style.setProperty('--menu-close-top', (centerY - closeSize / 2) + 'px');
  }
  syncCloseButtonPosition();
  window.addEventListener('resize', syncCloseButtonPosition);

  menuToggle.addEventListener('click', openMenu);
  menuClose.addEventListener('click', closeMenu);
  menuOverlay.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  document.querySelectorAll('[data-slider]').forEach(function (slider) {
    var track = slider.querySelector('[data-slider-track]');
    var thumb = slider.querySelector('[data-scrub]');
    var scrubTrack = slider.querySelector('.scrub-track');
    if (!track || !thumb) return;

    function updateThumb() {
      var scrollable = track.scrollWidth - track.clientWidth;
      var ratio = scrollable > 0 ? track.scrollLeft / scrollable : 0;
      var trackWidth = scrubTrack ? scrubTrack.clientWidth : thumb.parentElement.clientWidth;
      var maxLeftPx = Math.max(0, trackWidth - thumb.offsetWidth);
      thumb.style.left = (ratio * maxLeftPx) + 'px';
    }

    track.addEventListener('scroll', updateThumb, { passive: true });
    window.addEventListener('resize', updateThumb);
    updateThumb();

    // Drag-to-scroll on the image track, tracking the pointer 1:1 so it
    // feels like the image is being grabbed.
    var dragging = false;
    var dragStartX = 0;
    var dragStartScroll = 0;
    var dragMoved = false;

    // Mouse only — Pointer Events cover mouse reliably. Touch is handled
    // separately below with raw Touch Events: iOS Safari/Chrome (both
    // WebKit) have proven unreliable combining pointer capture + touch-action
    // for a custom horizontal drag, so touch gets its own, more defensive path.
    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      dragging = true;
      dragMoved = false;
      dragStartX = e.clientX;
      dragStartScroll = track.scrollLeft;
      track.classList.add('is-dragging');
      try { track.setPointerCapture(e.pointerId); } catch (err) {}
    });

    track.addEventListener('pointermove', function (e) {
      if (!dragging || e.pointerType !== 'mouse') return;
      var dx = e.clientX - dragStartX;
      if (Math.abs(dx) > 3) dragMoved = true;
      var maxScroll = track.scrollWidth - track.clientWidth;
      track.scrollLeft = Math.min(maxScroll, Math.max(0, dragStartScroll - dx));
    });

    function endTrackDrag() {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('is-dragging');
      if (dragHint) dragHint.classList.remove('is-dragging');
    }
    track.addEventListener('pointerup', endTrackDrag);
    track.addEventListener('pointercancel', endTrackDrag);
    // Safety nets: guarantee the drag ends even if the pointer is released
    // outside the track (or outside the browser window entirely), so a plain
    // mouse move afterward can never be mistaken for an active drag.
    window.addEventListener('pointerup', endTrackDrag);
    window.addEventListener('pointercancel', endTrackDrag);
    window.addEventListener('blur', endTrackDrag);

    // Touch — direction-locked: wait until a touch has moved enough to tell
    // whether it's a horizontal swipe (drag the slider) or vertical
    // (scroll the page), only then commit and preventDefault. Deciding
    // late like this is what lets the same finger-down either scroll the
    // page or drag the slider depending on which way it actually moves.
    var touchStartX = 0;
    var touchStartY = 0;
    var touchStartScroll = 0;
    var touching = false;
    var touchIntent = null; // null (undecided) | 'horizontal' | 'vertical'

    track.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      touching = true;
      dragMoved = false;
      touchIntent = null;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartScroll = track.scrollLeft;
    }, { passive: true });

    track.addEventListener('touchmove', function (e) {
      if (!touching) return;
      var touch = e.touches[0];
      var dx = touch.clientX - touchStartX;
      var dy = touch.clientY - touchStartY;

      if (touchIntent === null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        touchIntent = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
        if (touchIntent === 'horizontal') track.classList.add('is-dragging');
      }
      if (touchIntent !== 'horizontal') return; // let the page scroll normally

      e.preventDefault();
      dragMoved = true;
      var maxScroll = track.scrollWidth - track.clientWidth;
      track.scrollLeft = Math.min(maxScroll, Math.max(0, touchStartScroll - dx));
    }, { passive: false });

    function endTouchDrag() {
      touching = false;
      touchIntent = null;
      track.classList.remove('is-dragging');
      if (dragHint) dragHint.classList.remove('is-dragging');
    }
    track.addEventListener('touchend', endTouchDrag);
    track.addEventListener('touchcancel', endTouchDrag);

    track.querySelectorAll('img').forEach(function (img) {
      img.addEventListener('dragstart', function (e) { e.preventDefault(); });
      img.addEventListener('click', function (e) {
        if (dragMoved) e.preventDefault();
      });
    });

    // Drag hint: follows the cursor while hovering, shows a gripped state only while actually dragging
    var viewport = slider.querySelector('.slider__viewport');
    var dragHint = slider.querySelector('[data-drag-hint]');
    if (viewport && dragHint) {
      viewport.addEventListener('mouseenter', function () {
        dragHint.classList.add('is-visible');
      });
      viewport.addEventListener('mousemove', function (e) {
        var rect = viewport.getBoundingClientRect();
        dragHint.style.left = (e.clientX - rect.left) + 'px';
        dragHint.style.top = (e.clientY - rect.top) + 'px';
      });
      viewport.addEventListener('mouseleave', function () {
        dragHint.classList.remove('is-visible');
      });
      track.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse') dragHint.classList.add('is-dragging');
      });
    }
  });

  var trailerVideo = document.querySelector('.trailer__video');
  if (trailerVideo) {
    // Start the loop the first time it scrolls into view, rather than the
    // instant the page loads (saves bandwidth and avoids playing off-screen).
    if ('IntersectionObserver' in window) {
      var trailerPlayObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            trailerVideo.play().catch(function () {});
            trailerPlayObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1 });
      trailerPlayObserver.observe(trailerVideo);
    } else {
      trailerVideo.play().catch(function () {});
    }

    // Scale up as it approaches the viewport's vertical center, back down
    // as it moves away — video keeps looping uninterrupted throughout.
    var TRAILER_BASE_SCALE = 1;
    var TRAILER_MAX_SCALE_REF = 1.35; // at 1920px and below
    var TRAILER_MAX_SCALE_WIDE = 1.55; // eased into by 2560px and up
    var trailerScaleTicking = false;

    function getTrailerMaxScale() {
      var w = window.innerWidth;
      if (w <= 1920) return TRAILER_MAX_SCALE_REF;
      var t = Math.min((w - 1920) / (2560 - 1920), 1);
      return TRAILER_MAX_SCALE_REF + t * (TRAILER_MAX_SCALE_WIDE - TRAILER_MAX_SCALE_REF);
    }

    function updateTrailerScale() {
      trailerScaleTicking = false;
      var rect = trailerVideo.getBoundingClientRect();
      var viewportCenter = window.innerHeight / 2;
      var elementCenter = rect.top + rect.height / 2;
      var distance = Math.abs(viewportCenter - elementCenter);
      var maxDistance = window.innerHeight / 2 + rect.height / 2;
      var proximity = maxDistance > 0 ? Math.max(0, 1 - distance / maxDistance) : 0;
      var maxScale = getTrailerMaxScale();
      var scale = TRAILER_BASE_SCALE + (maxScale - TRAILER_BASE_SCALE) * proximity;
      trailerVideo.style.transform = 'scale(' + scale.toFixed(3) + ')';
    }

    function requestTrailerScaleUpdate() {
      if (!trailerScaleTicking) {
        trailerScaleTicking = true;
        requestAnimationFrame(updateTrailerScale);
      }
    }

    document.addEventListener('scroll', requestTrailerScaleUpdate, { passive: true });
    window.addEventListener('resize', requestTrailerScaleUpdate);
    updateTrailerScale();
  }

  var socializeImg = document.querySelector('.socialize__image img');
  if (socializeImg) {
    // Same idea as the trailer, inverted: starts smaller, rests at its
    // normal (1x) size once centered, shrinks back as it scrolls away.
    var SOCIALIZE_BASE_SCALE = 0.7;
    var SOCIALIZE_MAX_SCALE = 1;
    var socializeScaleTicking = false;

    function updateSocializeScale() {
      socializeScaleTicking = false;
      var rect = socializeImg.getBoundingClientRect();
      var viewportCenter = window.innerHeight / 2;
      var elementCenter = rect.top + rect.height / 2;
      var distance = Math.abs(viewportCenter - elementCenter);
      var maxDistance = window.innerHeight / 2 + rect.height / 2;
      var proximity = maxDistance > 0 ? Math.max(0, 1 - distance / maxDistance) : 0;
      var scale = SOCIALIZE_BASE_SCALE + (SOCIALIZE_MAX_SCALE - SOCIALIZE_BASE_SCALE) * proximity;
      socializeImg.style.transform = 'scale(' + scale.toFixed(3) + ')';
    }

    function requestSocializeScaleUpdate() {
      if (!socializeScaleTicking) {
        socializeScaleTicking = true;
        requestAnimationFrame(updateSocializeScale);
      }
    }

    document.addEventListener('scroll', requestSocializeScaleUpdate, { passive: true });
    window.addEventListener('resize', requestSocializeScaleUpdate);
    updateSocializeScale();
  }

  var form = document.getElementById('demoForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var button = form.querySelector('.btn-submit');
      var original = button.textContent;
      button.textContent = 'THANK YOU';
      button.disabled = true;
      setTimeout(function () {
        button.textContent = original;
        button.disabled = false;
        form.reset();
      }, 2200);
    });
  }

  var nav = document.getElementById('nav');
  if (nav) {
    var setNavHeightVar = function () {
      document.documentElement.style.setProperty('--nav-height', nav.offsetHeight + 'px');
    };
    setNavHeightVar();
    window.addEventListener('resize', setNavHeightVar);
  }

  var sideNavItems = document.querySelectorAll('.side-nav__item');
  if (sideNavItems.length) {
    var sideNavTargets = Array.prototype.map.call(sideNavItems, function (item) {
      return { item: item, el: document.getElementById(item.getAttribute('data-target')) };
    }).filter(function (t) { return t.el; });

    var updateSideNav = function () {
      var activationLine = window.innerHeight * 0.4;
      var current = null;
      var currentTop = -Infinity;
      sideNavTargets.forEach(function (t) {
        var top = t.el.getBoundingClientRect().top;
        if (top <= activationLine && top > currentTop) {
          current = t;
          currentTop = top;
        }
      });
      if (!current) current = sideNavTargets[0];
      sideNavTargets.forEach(function (t) {
        t.item.classList.toggle('is-active', t === current);
      });
    };

    document.addEventListener('scroll', updateSideNav, { passive: true });
    window.addEventListener('resize', updateSideNav);
    updateSideNav();
  }

  var revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length) {
    revealEls.forEach(function (el) {
      var delay = el.getAttribute('data-reveal-delay');
      if (delay) el.style.setProperty('--reveal-delay', delay + 'ms');
    });

    if ('IntersectionObserver' in window) {
      var revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

      revealEls.forEach(function (el) { revealObserver.observe(el); });
    } else {
      revealEls.forEach(function (el) { el.classList.add('is-revealed'); });
    }
  }
})();
