import { Renderer, Program, Mesh, Triangle, Texture } from 'https://cdn.jsdelivr.net/npm/ogl@1.0.11/+esm';

const VERT = `#version 300 es
in vec2 uv;
in vec2 position;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D tMap;
uniform vec2 uMouse;
uniform float uHover;
uniform float uRadius;
uniform float uStrength;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 diff = vUv - uMouse;
  float dist = length(diff);
  float falloff = 1.0 - smoothstep(0.0, uRadius, dist);
  vec2 warpedUv = uMouse + diff * (1.0 - uStrength * falloff * uHover);
  fragColor = texture(tMap, warpedUv);
}
`;

function initLensWarp(imgEl, opts) {
  opts = opts || {};
  var radius = opts.radius || 0.4;
  var strength = opts.strength || 0.35;

  var wrapper = imgEl.parentElement;
  var renderer;
  try {
    renderer = new Renderer({ alpha: true, antialias: true });
  } catch (err) {
    return; // WebGL unavailable — the plain <img> underneath still works fine.
  }
  var gl = renderer.gl;
  var canvas = gl.canvas;
  canvas.style.position = 'absolute';
  canvas.style.borderRadius = '4px';
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity 0.3s ease';
  canvas.style.pointerEvents = 'none';
  canvas.setAttribute('aria-hidden', 'true');
  // Mirror the image's own stacking layer (e.g. the hero background sits at
  // a negative z-index behind the hero's text) so the overlay lines up with
  // it instead of defaulting to auto and popping above other content.
  var imgZIndex = getComputedStyle(imgEl).zIndex;
  if (imgZIndex !== 'auto') canvas.style.zIndex = imgZIndex;

  var texture = new Texture(gl);
  var geometry = new Triangle(gl);

  var program = new Program(gl, {
    vertex: VERT,
    fragment: FRAG,
    uniforms: {
      tMap: { value: texture },
      uMouse: { value: [0.5, 0.5] },
      uHover: { value: 0 },
      uRadius: { value: radius },
      uStrength: { value: strength }
    }
  });

  var mesh = new Mesh(gl, { geometry: geometry, program: program });

  var computedPosition = getComputedStyle(wrapper).position;
  if (computedPosition === 'static') wrapper.style.position = 'relative';
  // Insert right after the <img> rather than appending last, so any sibling
  // content that should stay on top (e.g. feature-card's text label) does.
  imgEl.insertAdjacentElement('afterend', canvas);

  var imageIsReady = false;
  function resize() {
    // Position/size the canvas to match the <img>'s own rendered box, not
    // the wrapper's — the wrapper can be wider (e.g. padding, or centering
    // a narrower image), which previously stretched the overlay past the
    // actual photo.
    var wrapperRect = wrapper.getBoundingClientRect();
    var imgRect = imgEl.getBoundingClientRect();
    if (imgRect.width === 0 || imgRect.height === 0) return;
    canvas.style.left = (imgRect.left - wrapperRect.left) + 'px';
    canvas.style.top = (imgRect.top - wrapperRect.top) + 'px';
    canvas.style.width = imgRect.width + 'px';
    canvas.style.height = imgRect.height + 'px';
    renderer.setSize(imgRect.width, imgRect.height);
    if (imageIsReady) renderer.render({ scene: mesh });
  }
  window.addEventListener('resize', resize);
  resize();

  // Render one frame as soon as the texture is ready, so the canvas already
  // holds a valid (undistorted) image the instant hover flips it visible —
  // otherwise the first hover shows a blank flash while waiting for the
  // hover-driven render loop to catch up.
  var srcImage = new Image();
  srcImage.crossOrigin = 'anonymous';
  function onImageReady() {
    texture.image = srcImage;
    imageIsReady = true;
    resize(); // sizes the canvas and, since imageIsReady is now true, renders it too
  }
  srcImage.src = imgEl.currentSrc || imgEl.src;
  if (srcImage.complete) onImageReady();
  else srcImage.onload = onImageReady;

  var targetHover = 0;
  var currentHover = 0;
  var targetMouse = [0.5, 0.5];
  var currentMouse = [0.5, 0.5];
  var rafId = null;

  function loop() {
    currentHover += (targetHover - currentHover) * 0.12;
    currentMouse[0] += (targetMouse[0] - currentMouse[0]) * 0.18;
    currentMouse[1] += (targetMouse[1] - currentMouse[1]) * 0.18;
    program.uniforms.uHover.value = currentHover;
    program.uniforms.uMouse.value = currentMouse;
    renderer.render({ scene: mesh });
    if (targetHover > 0 || currentHover > 0.001) {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
    }
  }

  function startLoop() {
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  wrapper.addEventListener('mouseenter', function () {
    // Re-sync position/size first — the image may have moved or scaled
    // (e.g. a scroll-driven transform) since the last window resize.
    resize();
    targetHover = 1;
    canvas.style.opacity = '1';
    startLoop();
  });

  wrapper.addEventListener('mousemove', function (e) {
    var rect = canvas.getBoundingClientRect();
    targetMouse[0] = (e.clientX - rect.left) / rect.width;
    targetMouse[1] = 1.0 - (e.clientY - rect.top) / rect.height;
  });

  wrapper.addEventListener('mouseleave', function () {
    targetHover = 0;
    canvas.style.opacity = '0';
    startLoop();
  });
}

var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReducedMotion) {
  var lensWarpTargets = [
    '.hero__bg',
    '.showcase .slider__item img',
    '.features .feature-card img',
    '.commission__image img'
  ].join(', ');
  document.querySelectorAll(lensWarpTargets).forEach(function (img) {
    initLensWarp(img);
  });
}
