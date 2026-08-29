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
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.borderRadius = '4px';
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity 0.3s ease';
  canvas.style.pointerEvents = 'none';
  canvas.setAttribute('aria-hidden', 'true');

  var texture = new Texture(gl);
  var srcImage = new Image();
  srcImage.crossOrigin = 'anonymous';
  function onImageReady() {
    texture.image = srcImage;
    resize();
  }
  if (imgEl.complete && imgEl.naturalWidth) {
    srcImage.src = imgEl.currentSrc || imgEl.src;
    if (srcImage.complete) onImageReady();
    else srcImage.onload = onImageReady;
  } else {
    srcImage.onload = onImageReady;
    srcImage.src = imgEl.currentSrc || imgEl.src;
  }

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
  wrapper.appendChild(canvas);

  function resize() {
    var rect = wrapper.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    renderer.setSize(rect.width, rect.height);
  }
  window.addEventListener('resize', resize);
  resize();

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
    targetHover = 1;
    canvas.style.opacity = '1';
    startLoop();
  });

  wrapper.addEventListener('mousemove', function (e) {
    var rect = wrapper.getBoundingClientRect();
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
  document.querySelectorAll('.showcase .slider__item img').forEach(function (img) {
    initLensWarp(img);
  });
}
