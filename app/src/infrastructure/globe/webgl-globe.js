// MARS+ 3D globe renderer (WebGL2, no libraries): a ray-traced sphere textured with the Viking MDIM 2.1 mosaic,
// MOLA elevation (shaded relief + colour ramp) or the USGS global geologic map (Tanaka et al. 2014).
// Original renderer, shaders and interaction: MARS+ team (AI-assisted). Ported to an ES module with on-demand
// binary assets and a callback API for the UI by Claude (AI-assisted). Reviewed by the MARS+ team.

const ELEVATION_STOPS = [
  [-8.2, '#33405c'], [-4, '#527a8e'], [0, '#acc2a1'], [4, '#d7bb82'],
  [8, '#b87550'], [12, '#a15141'], [17, '#da9b79'], [21.2, '#fff0dc'],
];
export const GLOBE_ELEVATION_STOPS = ELEVATION_STOPS;
const OVERVIEW = { lat: 8, lon: -65, distance: 2.92 };
const RANGE = { min: 1.052, max: 6.4 };
const PERSPECTIVE = 0.48;
const MARS_RADIUS_KM = 3396.19;
const RAD = Math.PI / 180;
const LIGHTING = { viking: 1, mola: 0, geology: 0 };

const rgbBytes = (hex) => hex.slice(1).match(/../g).map((v) => parseInt(v, 16));
const shaderColor = (hex) => `vec3(${rgbBytes(hex).map((v) => (v / 255).toFixed(5))})`;
const elevationColors = ELEVATION_STOPS.slice(1).map(([km, hex]) => {
  const c = shaderColor(hex);
  return `if (km <= ${km.toFixed(1)}) return mix(previous, ${c}, clamp((km - lower) / (${km.toFixed(1)} - lower), 0.0, 1.0));
  lower = ${km.toFixed(1)};
  previous = ${c};`;
}).join('\n');

const VERTEX = `#version 300 es
void main() {
  vec2 vertex = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(vertex * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uSurface;
uniform highp isampler2D uElevation;
uniform vec2 uSize;
uniform mat3 uOrientation;
uniform float uDistance;
uniform float uPerspective;
uniform float uLighting;
uniform int uMode;
out vec4 color;

float elevationCell(ivec2 index, ivec2 grid) {
  index.x = (index.x + grid.x) % grid.x;
  index.y = clamp(index.y, 0, grid.y - 1);
  return float(texelFetch(uElevation, index, 0).r);
}
float elevationAt(vec2 st) {
  ivec2 grid = textureSize(uElevation, 0);
  vec2 pos = st * vec2(grid) - 0.5;
  ivec2 cell = ivec2(floor(pos));
  vec2 f = fract(pos);
  float top = mix(elevationCell(cell, grid), elevationCell(cell + ivec2(1, 0), grid), f.x);
  float bottom = mix(elevationCell(cell + ivec2(0, 1), grid), elevationCell(cell + ivec2(1, 1), grid), f.x);
  return mix(top, bottom, f.y);
}
vec3 elevationColor(float km) {
  float lower = ${ELEVATION_STOPS[0][0].toFixed(1)};
  vec3 previous = ${shaderColor(ELEVATION_STOPS[0][1])};
  ${elevationColors}
  return previous;
}
void main() {
  vec2 plane = (2.0 * gl_FragCoord.xy - uSize) / min(uSize.x, uSize.y);
  vec3 eye = vec3(0.0, 0.0, uDistance);
  vec3 ray = normalize(vec3(plane * uPerspective, -1.0));
  float forward = -dot(eye, ray);
  float hit = 1.0 - dot(cross(eye, ray), cross(eye, ray));
  if (hit <= 0.0) {
    float halo = exp(75.0 * hit) * 0.15 * uLighting;
    color = vec4(vec3(0.81, 0.42, 0.29) * halo, halo);
    return;
  }
  vec3 normal = normalize(eye + (forward - sqrt(hit)) * ray);
  vec3 planet = uOrientation * normal;
  // Mars Trek's geographic grid runs west to east and north to south.
  vec2 st = vec2(0.5 + atan(planet.z, planet.x) / 6.2831853, 0.5 - asin(clamp(planet.y, -1.0, 1.0)) / 3.1415927);
  vec4 surface = textureLod(uSurface, st, 0.0);
  vec3 light = normalize(vec3(-0.58, 0.36, 0.84));
  float illumination = 0.36 + 0.71 * max(dot(normal, light), 0.0);
  float limb = pow(1.0 - max(dot(-ray, normal), 0.0), 3.0);
  vec3 shaded = surface.rgb * illumination + vec3(0.10, 0.043, 0.027) * limb;
  vec3 ground = mix(vec3(0.21, 0.24, 0.27), mix(surface.rgb, shaded, uLighting), surface.a);
  if (uMode == 1) {
    vec2 cell = 1.0 / vec2(textureSize(uElevation, 0));
    vec2 dx = vec2(cell.x, 0.0);
    vec2 dy = vec2(0.0, cell.y);
    float cosine = max(sqrt(max(0.0, 1.0 - planet.y * planet.y)), 0.08);
    float east = (elevationAt(st + dx) - elevationAt(st - dx)) / (42677782.0 * cell.x * cosine);
    float north = (elevationAt(st - dy) - elevationAt(st + dy)) / (21338891.0 * cell.y);
    vec3 terrainNormal = normalize(vec3(-2.8 * east, -2.8 * north, 1.0));
    vec3 terrainLight = normalize(vec3(-0.5, 0.6, 0.8));
    float reliefLight = clamp(0.76 + 0.34 * dot(terrainNormal, terrainLight), 0.62, 1.06);
    ground = elevationColor(elevationAt(st) / 1000.0) * reliefLight;
  }
  float alpha = smoothstep(0.0, max(fwidth(hit), .001), hit);
  color = vec4(ground * alpha, alpha);
}`;

export function isWebGL2Supported() {
  try { return Boolean(document.createElement('canvas').getContext('webgl2')); } catch { return false; }
}

export const wrapLongitude = (lon) => ((lon + 180) % 360 + 360) % 360 - 180;

function createRenderer(gl, canvas) {
  const shaders = [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]].map(([type, source]) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  });
  const program = gl.createProgram();
  shaders.forEach((s) => gl.attachShader(program, s));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  shaders.forEach((s) => gl.deleteShader(s));
  gl.useProgram(program);
  const uniform = (n) => gl.getUniformLocation(program, n);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const elevationTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, elevationTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16I, 1, 1, 0, gl.RED_INTEGER, gl.SHORT, new Int16Array(1));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.activeTexture(gl.TEXTURE0);
  const u = { size: uniform('uSize'), orientation: uniform('uOrientation'), distance: uniform('uDistance'), light: uniform('uLighting'), mode: uniform('uMode') };
  gl.uniform1i(uniform('uSurface'), 0);
  gl.uniform1i(uniform('uElevation'), 1);
  gl.uniform1f(uniform('uPerspective'), PERSPECTIVE);

  let elevationUploaded = false;
  function setLayer(key, data) {
    if (key === 'mola') {
      if (!elevationUploaded) {
        gl.activeTexture(gl.TEXTURE1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16I, data.width, data.height, 0, gl.RED_INTEGER, gl.SHORT, data.values);
        gl.activeTexture(gl.TEXTURE0);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('elevation upload failed');
        elevationUploaded = true;
      }
    } else {
      const filter = key === 'geology' ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      if (key === 'geology') gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, data.width, data.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data.pixels);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    if (gl.getError() !== gl.NO_ERROR) throw new Error('texture upload failed');
    gl.uniform1f(u.light, LIGHTING[key] ?? 0);
    gl.uniform1i(u.mode, Number(key === 'mola'));
  }

  function showRaster(pixels, width, height) {
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('dust texture upload failed');
    gl.uniform1f(u.light, 0);
    gl.uniform1i(u.mode, 0);
  }

  function draw(camera) {
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.round(canvas.clientWidth * ratio), height = Math.round(canvas.clientHeight * ratio);
    if (!width || !height) return;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const lon = camera.lon * RAD, lat = camera.lat * RAD;
    const x = Math.cos(lon), z = Math.sin(lon), sinLat = Math.sin(lat), cosLat = Math.cos(lat);
    gl.viewport(0, 0, width, height);
    gl.uniform2f(u.size, width, height);
    gl.uniform1f(u.distance, camera.distance);
    gl.uniformMatrix3fv(u.orientation, false, [-z, 0, x, -sinLat * x, cosLat, -sinLat * z, cosLat * x, sinLat, cosLat * z]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return { draw, setLayer, showRaster };
}

async function gunzip(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

// 'load' instead of img.decode(): decode() can stay pending while a page is not being painted (background tabs).
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`${url}: image failed to load`));
    img.src = url;
  });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{assetBase:string, meta:object, reducedMotion:boolean}} options  meta = assets/globe/globe.json
 */
export function createWebGLGlobe(canvas, { assetBase, meta, reducedMotion }) {
  const camera = { ...OVERVIEW };
  const pointers = new Map();
  const data = new Map();
  const frameListeners = new Set();
  const moveListeners = new Set();
  let renderer, frame, flight, activeLayer = 'viking', layerRequest = 0, paused = false;

  const requestDraw = () => { if (!paused && frame === undefined) frame = requestAnimationFrame(update); };

  function update(timestamp) {
    frame = undefined;
    if (!renderer) return;
    if (flight) {
      const t = Math.min(1, (timestamp - flight.start) / flight.duration);
      const eased = t * t * (3 - 2 * t);
      camera.lat = flight.from.lat + (flight.to.lat - flight.from.lat) * eased;
      camera.lon = wrapLongitude(flight.from.lon + flight.longitudeDelta * eased);
      camera.distance = flight.from.distance + (flight.to.distance - flight.from.distance) * eased + Math.sin(t * Math.PI) * flight.pullback;
      if (t < 1) requestDraw();
      else { const done = flight.onArrive; flight = undefined; if (done) done(); }
    }
    renderer.draw(camera);
    frameListeners.forEach((fn) => fn(camera));
  }

  async function loadLayer(key) {
    if (data.has(key)) return data.get(key);
    let d;
    if (key === 'mola') {
      const view = new DataView(await gunzip(assetBase + meta.mola.file));
      const n = meta.mola.width * meta.mola.height;
      const values = new Int16Array(n);
      for (let i = 0; i < n; i++) values[i] = view.getInt16(i * 2, true);
      d = { width: meta.mola.width, height: meta.mola.height, values };
    } else if (key === 'geology') {
      const indices = new Uint8Array(await gunzip(assetBase + meta.geology.file));
      const palette = [[0, 0, 0, 0], ...meta.geology.units.map((u) => [...rgbBytes(u.color), 255])];
      const pixels = new Uint8Array(indices.length * 4);
      for (let i = 0; i < indices.length; i++) pixels.set(palette[indices[i]], i * 4);
      d = { width: meta.geology.width, height: meta.geology.height, indices, pixels };
    } else {
      d = await loadImage(assetBase + meta.viking.fast);
    }
    data.set(key, d);
    return d;
  }

  function flyTo(target, onArrive) {
    if (reducedMotion) {
      flight = undefined;
      Object.assign(camera, target, { lon: wrapLongitude(target.lon) });
      requestDraw();
      if (onArrive) setTimeout(onArrive, 0);
      return;
    }
    const longitudeDelta = wrapLongitude(target.lon - camera.lon);
    let arrived = false;
    const arrive = onArrive && (() => { if (!arrived) { arrived = true; onArrive(); } });
    const thisFlight = { start: performance.now(), duration: 1100, from: { ...camera }, to: target, longitudeDelta, pullback: Math.min(0.9, Math.abs(longitudeDelta) * 0.006), onArrive: arrive };
    flight = thisFlight;
    requestDraw();
    // Safety net: if animation frames are throttled (background tab, unpainted view), still complete the action.
    if (arrive) {
      setTimeout(() => {
        if (arrived) return;
        if (flight === thisFlight) { Object.assign(camera, target, { lon: wrapLongitude(target.lon) }); flight = undefined; }
        arrive();
      }, thisFlight.duration + 500);
    }
  }

  function zoom(multiplier) {
    flight = undefined;
    camera.distance = Math.max(RANGE.min, Math.min(RANGE.max, 1 + (camera.distance - 1) * multiplier));
    requestDraw();
  }

  function rotate(dx, dy) {
    flight = undefined;
    camera.lon = wrapLongitude(camera.lon - dx);
    camera.lat = Math.max(-89.8, Math.min(89.8, camera.lat + dy));
    moveListeners.forEach((fn) => fn());
    requestDraw();
  }

  // --- interaction (pointer, wheel, keyboard) ---
  const span = () => { const [a, b] = pointers.values(); return Math.hypot(a.x - b.x, a.y - b.y); };
  canvas.addEventListener('pointerdown', (e) => {
    if (!renderer || e.button !== 0 || pointers.size === 2) return;
    flight = undefined;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.classList.add('dragging');
    moveListeners.forEach((fn) => fn());
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const before = pointers.size === 2 ? span() : 0;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const s = span(); if (before > 2 && s > 2) zoom(before / s); }
    else {
      const visible = (camera.distance * PERSPECTIVE) / Math.min(canvas.clientWidth, canvas.clientHeight);
      rotate(((e.clientX - prev.x) * visible) / RAD, ((e.clientY - prev.y) * visible) / RAD);
    }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, (e) => { pointers.delete(e.pointerId); canvas.classList.toggle('dragging', pointers.size > 0); });
  }
  canvas.addEventListener('wheel', (e) => {
    if (!renderer) return;
    e.preventDefault();
    const step = e.deltaY * (e.deltaMode === 0 ? 0.0018 : 0.05);
    zoom(Math.exp(Math.max(-0.5, Math.min(0.5, step))));
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    if (!renderer) return;
    const actions = {
      ArrowLeft: () => rotate(8, 0), ArrowRight: () => rotate(-8, 0), ArrowUp: () => rotate(0, 8), ArrowDown: () => rotate(0, -8),
      '+': () => zoom(0.72), '=': () => zoom(0.72), '-': () => zoom(1.39), Home: () => flyTo(OVERVIEW),
    };
    if (!Object.hasOwn(actions, e.key)) return;
    e.preventDefault();
    actions[e.key]();
  });

  return {
    overview: OVERVIEW, range: RANGE, perspective: PERSPECTIVE, marsRadiusKm: MARS_RADIUS_KM,
    get camera() { return camera; },
    get activeLayer() { return activeLayer; },

    /** Creates the renderer and shows the fast Viking texture; the full-resolution texture follows in the background. */
    async start() {
      const gl = canvas.getContext('webgl2', { antialias: false });
      if (!gl) throw new Error('webgl2-unavailable');
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); renderer = undefined; });
      const fast = await loadLayer('viking');
      renderer = createRenderer(gl, canvas);
      renderer.setLayer('viking', fast);
      new ResizeObserver(requestDraw).observe(canvas);
      requestDraw();
      loadImage(assetBase + meta.viking.full).then((full) => {
        data.set('viking', full);
        if (renderer && activeLayer === 'viking') { renderer.setLayer('viking', full); requestDraw(); }
      }).catch(() => { /* the fast texture stays */ });
    },

    /** Switches layer (loads data on demand). Resolves when the layer is visible. */
    async setLayer(key) {
      const request = ++layerRequest;
      const d = await loadLayer(key);
      if (request !== layerRequest || !renderer) return false;
      renderer.setLayer(key, d);
      activeLayer = key;
      requestDraw();
      return true;
    },

    /** Flat colour raster (dust). Row 0 is north, the same layout as the geology grid. */
    showRaster(pixels, width, height) {
      if (!renderer) return false;
      renderer.showRaster(pixels, width, height);
      activeLayer = 'dust';
      requestDraw();
      return true;
    },

    flyTo, zoom, rotate,
    reset() { flyTo(OVERVIEW); },
    onFrame(fn) { frameListeners.add(fn); },
    onUserMove(fn) { moveListeners.add(fn); },
    pause() { paused = true; if (frame !== undefined) { cancelAnimationFrame(frame); frame = undefined; } },
    resume() { paused = false; requestDraw(); },

    /** Value under the screen centre for the active analytic layer. */
    sampleCenter() {
      const col = ((camera.lon + 180) / 360), row = ((90 - camera.lat) / 180);
      if (activeLayer === 'mola' && data.has('mola')) {
        const { width, height, values } = data.get('mola');
        const cx = col * width - 0.5, cy = row * height - 0.5, x = Math.floor(cx), y = Math.floor(cy), fx = cx - x, fy = cy - y;
        const at = (i, j) => values[Math.max(0, Math.min(height - 1, j)) * width + ((i % width) + width) % width];
        const top = at(x, y) * (1 - fx) + at(x + 1, y) * fx, bottom = at(x, y + 1) * (1 - fx) + at(x + 1, y + 1) * fx;
        return { elevationKm: (top * (1 - fy) + bottom * fy) / 1000 };
      }
      if (activeLayer === 'geology' && data.has('geology')) {
        const { width, height, indices } = data.get('geology');
        return { unitIndex: indices[Math.min(height - 1, Math.floor(row * height)) * width + (Math.floor(col * width) % width)] };
      }
      return {};
    },
  };
}
