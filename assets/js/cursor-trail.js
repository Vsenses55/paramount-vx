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

  // Muted versions of the aurora's purples/blues, so the glow reads as part
  // of the same light instead of a bright accent painted on top.
  var PALETTE = [[96, 52, 176], [52, 104, 176], [128, 62, 182]];
  var LIFE = 420;          // ms each piece of the trail lasts before it's gone
  var MIN_RADIUS = 70;
  var MAX_RADIUS = 130;
  var BASE_ALPHA = 0.11;
  var MAX_POINTS = 90;

  var width = 0;
  var height = 0;
  var points = [];        // { x, y, r, rgb, born }
  var lastX = null;
  var lastY = null;
  var phase = 0;          // advances with distance travelled, to drift through the palette
  var rafId = null;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  function onMove(e) {
    var x = e.clientX;
    var y = e.clientY;
    var now = performance.now();

    if (lastX === null) { lastX = x; lastY = y; }
    var dx = x - lastX;
    var dy = y - lastY;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0.5) {
      // Faster movement = a slightly bigger smear.
      var radius = Math.min(MAX_RADIUS, MIN_RADIUS + dist * 0.8);
      var step = Math.max(10, radius * 0.4);
      var steps = Math.min(14, Math.max(1, Math.ceil(dist / step)));
      for (var i = 1; i <= steps; i++) {
        var t = i / steps;
        phase += (dist / steps) * 0.004;
        points.push({
          x: lastX + dx * t,
          y: lastY + dy * t,
          r: radius,
          rgb: colorAt(phase),
          born: now
        });
      }
      if (points.length > MAX_POINTS) points.splice(0, points.length - MAX_POINTS);
    }

    lastX = x;
    lastY = y;
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function loop(now) {
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';

    // Drop expired pieces, then draw what's left. Age sets both brightness and
    // size, so the trail shrinks and dims away rather than hanging around.
    points = points.filter(function (p) { return now - p.born < LIFE; });

    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var life = 1 - (now - p.born) / LIFE;       // 1 -> 0
      var a = BASE_ALPHA * life * life;
      var r = p.r * (0.55 + 0.45 * life);
      var c = p.rgb[0] + ',' + p.rgb[1] + ',' + p.rgb[2];
      var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, 'rgba(' + c + ',' + a + ')');
      g.addColorStop(0.55, 'rgba(' + c + ',' + (a * 0.4) + ')');
      g.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (points.length) {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
      ctx.clearRect(0, 0, width, height);
    }
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
