(function () {
  // Desktop pointers only: no trail on touch devices, and none if the visitor
  // asks for reduced motion.
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!finePointer || reducedMotion) return;

  var canvas = document.createElement('canvas');
  canvas.className = 'cursor-trail';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }

  // Same blue -> cyan -> purple as the menu icon.
  var PALETTE = [[0, 104, 229], [0, 177, 246], [159, 22, 239]];
  var FADE = 0.07;        // how much of the trail is erased each frame (higher = shorter trail)
  var IDLE_CLEAR_MS = 1800; // after this long without movement, wipe the canvas clean
  var MIN_RADIUS = 46;
  var MAX_RADIUS = 110;

  var width = 0;
  var height = 0;
  var lastX = null;
  var lastY = null;
  var lastMove = 0;
  var phase = 0;          // advances with distance travelled, to drift through the palette
  var rafId = null;
  var dirty = false;      // true while there is anything drawn that still needs fading out

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = false;
  }
  resize();
  window.addEventListener('resize', resize);

  function colorAt(t) {
    var n = PALETTE.length;
    var x = ((t % n) + n) % n;
    var i = Math.floor(x);
    var f = x - i;
    var a = PALETTE[i];
    var b = PALETTE[(i + 1) % n];
    return [
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f)
    ];
  }

  function stamp(x, y, radius, rgb, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    var c = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
    g.addColorStop(0, 'rgba(' + c + ',' + alpha + ')');
    g.addColorStop(0.5, 'rgba(' + c + ',' + (alpha * 0.35) + ')');
    g.addColorStop(1, 'rgba(' + c + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function onMove(e) {
    var x = e.clientX;
    var y = e.clientY;
    lastMove = performance.now();

    if (lastX === null) { lastX = x; lastY = y; }
    var dx = x - lastX;
    var dy = y - lastY;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0.5) {
      // Faster movement = a bigger, slightly brighter smear.
      var radius = Math.min(MAX_RADIUS, MIN_RADIUS + dist * 0.9);
      var alpha = Math.min(0.34, 0.16 + dist * 0.004);
      var step = Math.max(6, radius * 0.3);
      var steps = Math.max(1, Math.ceil(dist / step));

      ctx.globalCompositeOperation = 'lighter';
      for (var i = 1; i <= steps; i++) {
        var t = i / steps;
        phase += (dist / steps) * 0.0045;
        stamp(lastX + dx * t, lastY + dy * t, radius, colorAt(phase), alpha);
      }
      dirty = true;
    }

    lastX = x;
    lastY = y;
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function loop(now) {
    // Erase a little of everything each frame, so the trail melts away.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,' + FADE + ')';
    ctx.fillRect(0, 0, width, height);

    if (now - lastMove > IDLE_CLEAR_MS) {
      // Fading by a fixed alpha never quite reaches zero on 8-bit pixels,
      // which would leave a faint smudge behind — finish with a hard clear.
      ctx.clearRect(0, 0, width, height);
      dirty = false;
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  document.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    onMove(e);
  }, { passive: true });

  // Leaving the window shouldn't leave a jump when the cursor comes back.
  document.documentElement.addEventListener('mouseleave', function () {
    lastX = null;
    lastY = null;
  });
})();
