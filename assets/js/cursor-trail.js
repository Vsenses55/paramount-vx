(function () {
  // Cursor fluid: a small real-time fluid simulation (velocity + dye, curl,
  // pressure projection) that the mouse stirs. Drawn as a transparent layer
  // over the page, with a slight RGB split at the edges of the flow. Modelled
  // on the cursor fluid on emotion-agency.com.
  //
  // Desktop pointers only; off for touch and for reduced-motion visitors.
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!finePointer || reducedMotion) return;

  // ---- tuning -------------------------------------------------------------
  var SIM_RES = 64;            // fluid grid height (cells). Low on purpose: soft, blobby flow.
  var DYE_RES = 128;           // dye grid height
  var CANVAS_SCALE = 0.5;      // draw at half size; the flow is soft anyway
  var DYE_DISSIPATION = 0.93;  // dye kept per frame at 60fps (lower = fades faster)
  var VEL_DISSIPATION = 0.985; // velocity kept per frame
  var PRESSURE = 0.8;
  var PRESSURE_ITERATIONS = 2;
  var CURL = 12;               // swirl strength
  var SPLAT_RADIUS = 0.0030;   // size of each push (fraction of screen height, squared)
  var SPLAT_FORCE = 3200;      // how hard mouse movement shoves the fluid
  var DYE_GAIN = 0.32;        // brightness of the dye laid down by movement
  var ABERRATION = 0.016;      // RGB split at the edges of the flow
  var IDLE_MS = 2200;          // stop simulating this long after the mouse stops
  // Same blue -> cyan -> purple as the menu icon (0..1 linear-ish).
  var PALETTE = [[0.0, 0.41, 0.90], [0.0, 0.69, 0.96], [0.62, 0.09, 0.94]];

  var canvas = document.createElement('canvas');
  canvas.className = 'cursor-trail';
  canvas.setAttribute('aria-hidden', 'true');
  var gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) return;
  document.body.appendChild(canvas);

  // ---- shaders ------------------------------------------------------------
  var VERT = '#version 300 es\n' +
    'in vec2 aPosition; uniform vec2 texelSize;\n' +
    'out vec2 vUv; out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;\n' +
    'void main(){ vUv = aPosition*0.5+0.5; vL = vUv - vec2(texelSize.x,0.); vR = vUv + vec2(texelSize.x,0.);\n' +
    ' vT = vUv + vec2(0.,texelSize.y); vB = vUv - vec2(0.,texelSize.y); gl_Position = vec4(aPosition,0.,1.); }';

  var HEAD = '#version 300 es\nprecision highp float; precision highp sampler2D;\n' +
    'in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 o;\n';

  var FRAG = {
    splat: HEAD +
      'uniform sampler2D uTarget; uniform float aspect; uniform vec3 color; uniform vec2 point; uniform float radius;\n' +
      'void main(){ vec2 p = vUv - point; p.x *= aspect; vec3 s = exp(-dot(p,p)/radius)*color; o = vec4(texture(uTarget,vUv).xyz + s, 1.); }',
    advection: HEAD +
      'uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 texelSize; uniform float dt; uniform float dissipation;\n' +
      'void main(){ vec2 c = vUv - dt*texture(uVelocity,vUv).xy*texelSize; o = dissipation*texture(uSource,c); }',
    divergence: HEAD +
      'uniform sampler2D uVelocity;\n' +
      'void main(){ float L=texture(uVelocity,vL).x; float R=texture(uVelocity,vR).x; float T=texture(uVelocity,vT).y; float B=texture(uVelocity,vB).y;\n' +
      ' vec2 C = texture(uVelocity,vUv).xy; if(vL.x<0.) L=-C.x; if(vR.x>1.) R=-C.x; if(vT.y>1.) T=-C.y; if(vB.y<0.) B=-C.y;\n' +
      ' o = vec4(0.5*(R-L+T-B),0.,0.,1.); }',
    curl: HEAD +
      'uniform sampler2D uVelocity;\n' +
      'void main(){ float L=texture(uVelocity,vL).y; float R=texture(uVelocity,vR).y; float T=texture(uVelocity,vT).x; float B=texture(uVelocity,vB).x;\n' +
      ' o = vec4(0.5*(R-L-T+B),0.,0.,1.); }',
    vorticity: HEAD +
      'uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;\n' +
      'void main(){ float L=texture(uCurl,vL).x; float R=texture(uCurl,vR).x; float T=texture(uCurl,vT).x; float B=texture(uCurl,vB).x; float C=texture(uCurl,vUv).x;\n' +
      ' vec2 f = 0.5*vec2(abs(T)-abs(B), abs(R)-abs(L)); f /= length(f)+0.0001; f *= curl*C; f.y *= -1.;\n' +
      ' vec2 v = texture(uVelocity,vUv).xy + f*dt; o = vec4(clamp(v,-1000.,1000.),0.,1.); }',
    pressure: HEAD +
      'uniform sampler2D uPressure; uniform sampler2D uDivergence;\n' +
      'void main(){ float L=texture(uPressure,vL).x; float R=texture(uPressure,vR).x; float T=texture(uPressure,vT).x; float B=texture(uPressure,vB).x;\n' +
      ' o = vec4((L+R+B+T-texture(uDivergence,vUv).x)*0.25,0.,0.,1.); }',
    gradient: HEAD +
      'uniform sampler2D uPressure; uniform sampler2D uVelocity;\n' +
      'void main(){ float L=texture(uPressure,vL).x; float R=texture(uPressure,vR).x; float T=texture(uPressure,vT).x; float B=texture(uPressure,vB).x;\n' +
      ' vec2 v = texture(uVelocity,vUv).xy - vec2(R-L,T-B); o = vec4(v,0.,1.); }',
    clear: HEAD +
      'uniform sampler2D uTexture; uniform float value;\n' +
      'void main(){ o = value*texture(uTexture,vUv); }',
    display: HEAD +
      'uniform sampler2D uDye; uniform sampler2D uVelocity; uniform float aberration; uniform float gain;\n' +
      'void main(){\n' +
      ' vec2 v = texture(uVelocity,vUv).xy; float sp = length(v);\n' +
      ' vec2 dir = sp > 0.001 ? v/sp : vec2(0.);\n' +
      ' vec2 off = dir * aberration * min(sp*0.02, 1.);\n' +
      ' vec3 c = vec3(texture(uDye,vUv+off).r, texture(uDye,vUv).g, texture(uDye,vUv-off).b);\n' +
      ' c = 1. - exp(-c*gain);\n' +
      ' float a = max(c.r,max(c.g,c.b));\n' +
      ' o = vec4(c, a); }'
  };

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }
  var vs = compile(gl.VERTEX_SHADER, VERT);
  if (!vs) { canvas.remove(); return; }

  var programs = {};
  var ok = true;
  Object.keys(FRAG).forEach(function (name) {
    var fs = compile(gl.FRAGMENT_SHADER, FRAG[name]);
    if (!fs) { ok = false; return; }
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPosition');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { ok = false; return; }
    var u = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    programs[name] = { program: p, u: u };
  });
  if (!ok) { canvas.remove(); return; }

  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // ---- render targets -----------------------------------------------------
  function makeFBO(w, h, internal, format) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.HALF_FLOAT, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex: tex, fbo: fbo, w: w, h: h, texel: [1 / w, 1 / h] };
  }
  function makeDouble(w, h, internal, format) {
    var a = makeFBO(w, h, internal, format);
    var b = makeFBO(w, h, internal, format);
    return {
      get read() { return a; },
      get write() { return b; },
      swap: function () { var t = a; a = b; b = t; },
      w: w, h: h, texel: a.texel
    };
  }

  var velocity, dye, divergence, curlFBO, pressure;
  var aspect = 1;

  function resolution(base) {
    var w = Math.max(2, Math.round(base * aspect));
    return { w: w, h: base };
  }

  function initTargets() {
    var sim = resolution(SIM_RES);
    var dyeRes = resolution(DYE_RES);
    velocity = makeDouble(sim.w, sim.h, gl.RG16F, gl.RG);
    dye = makeDouble(dyeRes.w, dyeRes.h, gl.RGBA16F, gl.RGBA);
    divergence = makeFBO(sim.w, sim.h, gl.R16F, gl.RED);
    curlFBO = makeFBO(sim.w, sim.h, gl.R16F, gl.RED);
    pressure = makeDouble(sim.w, sim.h, gl.R16F, gl.RED);
  }

  function resize() {
    var w = Math.max(2, Math.round(window.innerWidth * CANVAS_SCALE));
    var h = Math.max(2, Math.round(window.innerHeight * CANVAS_SCALE));
    canvas.width = w;
    canvas.height = h;
    aspect = w / h;
    initTargets();
  }

  // ---- drawing helpers ----------------------------------------------------
  function use(name) {
    var p = programs[name];
    gl.useProgram(p.program);
    return p.u;
  }
  function bindTex(unit, tex) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    return unit;
  }
  function blit(target) {
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function splat(x, y, vx, vy, rgb) {
    var u = use('splat');
    gl.uniform1f(u.aspect, aspect);
    gl.uniform2f(u.point, x, y);
    gl.uniform1f(u.radius, SPLAT_RADIUS);
    gl.uniform2f(u.texelSize, velocity.texel[0], velocity.texel[1]);
    gl.uniform1i(u.uTarget, bindTex(0, velocity.read.tex));
    gl.uniform3f(u.color, vx, vy, 0);
    blit(velocity.write); velocity.swap();
    gl.uniform2f(u.texelSize, dye.texel[0], dye.texel[1]);
    gl.uniform1i(u.uTarget, bindTex(0, dye.read.tex));
    gl.uniform3f(u.color, rgb[0], rgb[1], rgb[2]);
    blit(dye.write); dye.swap();
  }

  function step(dt) {
    var u = use('curl');
    gl.uniform2f(u.texelSize, velocity.texel[0], velocity.texel[1]);
    gl.uniform1i(u.uVelocity, bindTex(0, velocity.read.tex));
    blit(curlFBO);

    u = use('vorticity');
    gl.uniform2f(u.texelSize, velocity.texel[0], velocity.texel[1]);
    gl.uniform1i(u.uVelocity, bindTex(0, velocity.read.tex));
    gl.uniform1i(u.uCurl, bindTex(1, curlFBO.tex));
    gl.uniform1f(u.curl, CURL);
    gl.uniform1f(u.dt, dt);
    blit(velocity.write); velocity.swap();

    u = use('divergence');
    gl.uniform2f(u.texelSize, velocity.texel[0], velocity.texel[1]);
    gl.uniform1i(u.uVelocity, bindTex(0, velocity.read.tex));
    blit(divergence);

    u = use('clear');
    gl.uniform2f(u.texelSize, pressure.texel[0], pressure.texel[1]);
    gl.uniform1i(u.uTexture, bindTex(0, pressure.read.tex));
    gl.uniform1f(u.value, PRESSURE);
    blit(pressure.write); pressure.swap();

    u = use('pressure');
    gl.uniform2f(u.texelSize, velocity.texel[0], velocity.texel[1]);
    gl.uniform1i(u.uDivergence, bindTex(0, divergence.tex));
    for (var i = 0; i < PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(u.uPressure, bindTex(1, pressure.read.tex));
      blit(pressure.write); pressure.swap();
    }

    u = use('gradient');
    gl.uniform2f(u.texelSize, velocity.texel[0], velocity.texel[1]);
    gl.uniform1i(u.uPressure, bindTex(0, pressure.read.tex));
    gl.uniform1i(u.uVelocity, bindTex(1, velocity.read.tex));
    blit(velocity.write); velocity.swap();

    var frames = dt * 60;
    u = use('advection');
    gl.uniform2f(u.texelSize, velocity.texel[0], velocity.texel[1]);
    gl.uniform1i(u.uVelocity, bindTex(0, velocity.read.tex));
    gl.uniform1i(u.uSource, bindTex(0, velocity.read.tex));
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.dissipation, Math.pow(VEL_DISSIPATION, frames));
    blit(velocity.write); velocity.swap();

    gl.uniform2f(u.texelSize, velocity.texel[0], velocity.texel[1]);
    gl.uniform1i(u.uVelocity, bindTex(0, velocity.read.tex));
    gl.uniform1i(u.uSource, bindTex(1, dye.read.tex));
    gl.uniform1f(u.dissipation, Math.pow(DYE_DISSIPATION, frames));
    blit(dye.write); dye.swap();
  }

  function display() {
    var u = use('display');
    gl.uniform2f(u.texelSize, 1 / canvas.width, 1 / canvas.height);
    gl.uniform1i(u.uDye, bindTex(0, dye.read.tex));
    gl.uniform1i(u.uVelocity, bindTex(1, velocity.read.tex));
    gl.uniform1f(u.aberration, ABERRATION);
    gl.uniform1f(u.gain, 1.5);
    blit(null);
  }

  function clearAll() {
    [velocity.read, velocity.write, dye.read, dye.write, pressure.read, pressure.write].forEach(function (t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, t.w, t.h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // ---- input + loop -------------------------------------------------------
  function paletteAt(t) {
    var n = PALETTE.length;
    var x = ((t % n) + n) % n;
    var i = Math.floor(x);
    var f = x - i;
    var a = PALETTE[i];
    var b = PALETTE[(i + 1) % n];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  var lastX = null;
  var lastY = null;
  var lastMove = 0;
  var lastFrame = 0;
  var rafId = null;
  var phase = 0;

  function onMove(e) {
    var w = window.innerWidth;
    var h = window.innerHeight;
    var x = e.clientX / w;
    var y = 1 - e.clientY / h;
    lastMove = performance.now();

    if (lastX !== null) {
      var dx = (x - lastX) * aspect;           // aspect-corrected, in screen-height units
      var dy = (y - lastY);
      var speed = Math.sqrt(dx * dx + dy * dy);
      if (speed > 0.0004) {
        phase += speed * 2.2;
        var strength = Math.min(1.0, 0.3 + speed * 25) * DYE_GAIN;
        var c = paletteAt(phase);
        splat(x, y, dx * SPLAT_FORCE, dy * SPLAT_FORCE, [c[0] * strength, c[1] * strength, c[2] * strength]);
      }
    }
    lastX = x;
    lastY = y;
    if (!rafId) {
      lastFrame = performance.now();
      rafId = requestAnimationFrame(loop);
    }
  }

  function loop(now) {
    var dt = Math.min((now - lastFrame) / 1000, 1 / 30);
    lastFrame = now;
    if (dt > 0) step(dt);
    display();

    if (now - lastMove > IDLE_MS) {
      clearAll();
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  resize();
  window.addEventListener('resize', resize);

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
