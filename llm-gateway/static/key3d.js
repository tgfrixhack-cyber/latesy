/* Landing hero object: the «k» logo as a keycap you can spin (the «true ApiKey» line). Plain WebGL 1, no dependencies.
   Drag to turn it (flick to spin), click to press it; left alone it turns slowly and settles upright.
   Without WebGL the stage shows the flat logo instead (.nogl). Mounted by landingPage() in landing.js. */
'use strict';
window.Key3D = (() => {
  const GLYPH = 'M7.1 4.5v15M7.1 14.5l7.2-6.2M10.8 11.3l4.3 6.2'; // stroke part of LOGO in app.js, 24×24 box
  // keycap in world units: base half-size 1, top half-size TOP, height H, top dished by DISH, rounded over by FIL
  const TOP = .74, H = .9, DISH = .07, FIL = .09, R0 = .2, R1 = .17, K = 8, LEG = 1.25;
  const TILT = .62, SPIN = .5, PRESS = .2, ROT = .0095, FOV = .5, DIST = 7.4;

  // quaternions [x, y, z, w]
  const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const qax = (x, y, z, a) => { const s = Math.sin(a / 2); return [x * s, y * s, z * s, Math.cos(a / 2)]; };
  const qnorm = q => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return q.map(v => v / l); };
  const qlerp = (a, b, t) => { const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
    return qnorm(a.map((v, i) => v + (s * b[i] - v) * t)); };
  function qrot([x, y, z, w], [ax, ay, az]) {
    const ux = y * az - z * ay, uy = z * ax - x * az, uz = x * ay - y * ax;
    return [ax + 2 * (w * ux + y * uz - z * uy), ay + 2 * (w * uy + z * ux - x * uz), az + 2 * (w * uz + x * uy - y * ux)];
  }
  const rest = yaw => qmul(qax(1, 0, 0, TILT), qax(0, 1, 0, yaw)); // upright, printed top tipped towards the viewer
  const yawOf = q => { const f = qrot(qmul(qax(1, 0, 0, -TILT), q), [0, 0, 1]); return Math.atan2(f[0], f[2]); };
  function mat([x, y, z, w], tx, ty, tz) { // rotation, then translation; column-major
    const xx = 2 * x * x, yy = 2 * y * y, zz = 2 * z * z, xy = 2 * x * y, xz = 2 * x * z, yz = 2 * y * z, wx = 2 * w * x, wy = 2 * w * y, wz = 2 * w * z;
    return [1 - yy - zz, xy + wz, xz - wy, 0, xy - wz, 1 - xx - zz, yz + wx, 0, xz + wy, yz - wx, 1 - xx - yy, 0, tx, ty, tz, 1];
  }
  function proj(aspect) { // perspective × camera at (0, 0, DIST); narrow stages shrink the object instead of cropping it
    const f = 1 / Math.tan(FOV / 2) * Math.min(1, aspect / 1.15), n = .5, fa = 30, a = (fa + n) / (n - fa), b = 2 * fa * n / (n - fa);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, a, -1, 0, 0, b - DIST * a, DIST];
  }
  const lin = hex => { const m = /^#?([\da-f]{6})$/i.exec((hex || '').trim()), n = parseInt(m ? m[1] : 'FF5B1F', 16);
    return [n >> 16, n >> 8 & 255, n & 255].map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }); };

  // vertex: position, normal, [u, v, legend mask, shade]
  function keycap() {
    const V = [], I = [], M = 4 * (K + 1);
    const vert = (x, y, z, n, u = 0, v = 0, leg = 0, sh = 1) => { V.push(x, y, z, n[0], n[1], n[2], u, v, leg, sh); return V.length / 10 - 1; };
    const ring = (s, r, y) => { const o = [], c = s - r; // rounded square, each point with its tangent
      for (let q = 0; q < 4; q++) for (let k = 0; k <= K; k++) { const a = (q + k / K) * Math.PI / 2;
        o.push([(q % 3 ? -c : c) + r * Math.cos(a), y, (q < 2 ? c : -c) + r * Math.sin(a), -Math.sin(a), Math.cos(a)]); }
      return o; };
    const quads = (a, b) => { for (let i = 0; i < M; i++) { const j = (i + 1) % M; I.push(a + i, b + j, a + j, a + i, b + i, b + j); } };
    const fan = (a, c) => { for (let i = 0; i < M; i++) I.push(a + i, c, a + (i + 1) % M); };
    function loft(rings, flip, top, sh) { // smooth surface through the rings; normal = profile tangent × ring tangent
      const s0 = V.length / 10;
      rings.forEach((rg, j) => { const pa = rings[Math.max(j - 1, 0)], pb = rings[Math.min(j + 1, rings.length - 1)];
        rg.forEach((p, i) => { const tx = pb[i][0] - pa[i][0], ty = pb[i][1] - pa[i][1], tz = pb[i][2] - pa[i][2];
          const n = [ty * p[4], tz * p[3] - tx * p[4], -ty * p[3]], l = (flip ? -1 : 1) / (Math.hypot(...n) || 1);
          vert(p[0], p[1], p[2], n.map(v => v * l), .5 + p[0] / LEG, .5 + p[2] / LEG, j >= top ? 1 : 0, sh); }); });
      for (let j = 0; j + 1 < rings.length; j++) quads(s0 + j * M, s0 + (j + 1) * M);
      return s0;
    }
    function box(x0, x1, y0, y1, z0, z1, sh) {
      for (const [n, ps] of [[[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]], [[-1, 0, 0], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]]],
        [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]], [[0, -1, 0], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]]],
        [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]], [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]]]) {
        const b = V.length / 10; ps.forEach(p => vert(p[0], p[1], p[2], n, 0, 0, 0, sh)); I.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    // outer shell: slightly bulging side → rounded top edge → dished top with the legend, one continuous surface
    const out = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8; out.push(ring(1 - (1 - TOP - FIL) * t + .012 * Math.sin(Math.PI * t), R0 + (R1 - R0) * t, (H - FIL) * t)); }
    for (let k = 1; k <= 6; k++) { const a = k / 6 * Math.PI / 2; out.push(ring(TOP + FIL * Math.cos(a), R1, H - FIL + FIL * Math.sin(a))); }
    const top = out.length - 1;
    for (let k = 1; k <= 10; k++) { const s = TOP * (1 - k / 10.5); out.push(ring(s, R1 * s / TOP, H - DISH * (1 - (s / TOP) ** 2))); }
    const so = loft(out, 0, top, 1);
    fan(so + (out.length - 1) * M, vert(0, H - DISH, 0, [0, 1, 0], .5, .5, 1, 1));
    // underside, for whoever flips it: rim, hollow inside and the cross stem
    const W = .09, CEIL = H - .32, side = y => 1 - (1 - TOP - FIL) * y / (H - FIL);
    const cav = [0, .5, 1].map(t => ring(side(CEIL * t) - W, R0 - W * .5, CEIL * t)), rim = V.length / 10;
    for (const p of out[0].concat(cav[0])) vert(p[0], 0, p[2], [0, -1, 0], 0, 0, 0, .9);
    quads(rim, rim + M);
    loft(cav, 1, Infinity, .75);
    const ce = V.length / 10;
    for (const p of cav[2]) vert(p[0], CEIL, p[2], [0, -1, 0], 0, 0, 0, .75);
    fan(ce, vert(0, CEIL, 0, [0, -1, 0], 0, 0, 0, .75));
    box(-.055, .055, .12, CEIL, -.2, .2, .9); box(-.2, .2, .12, CEIL, -.055, .055, .9);
    return { v: new Float32Array(V), i: new Uint16Array(I) };
  }

  const VS = `attribute vec3 aP, aN; attribute vec4 aX;
uniform mat4 uM, uVP;
varying vec3 vN, vW; varying vec4 vX;
void main() {
  vec4 w = uM * vec4(aP, 1.0);
  vW = w.xyz; vN = (uM * vec4(aN, 0.0)).xyz; vX = aX;
  gl_Position = uVP * w;
}`;
  // matte plastic in linear light: warm key light, cool fill, sky/ground ambient, soft highlight and a rim
  const FS = `precision mediump float;
uniform sampler2D uT; uniform vec3 uBase, uInk, uCam;
varying vec3 vN, vW; varying vec4 vX;
void main() {
  vec3 n = normalize(vN), v = normalize(uCam - vW), l = normalize(vec3(-0.5, 0.9, 0.6));
  vec3 a = mix(uBase * vX.w, uInk, vX.z * texture2D(uT, vX.xy).a);
  vec3 amb = mix(vec3(0.16, 0.12, 0.1), vec3(0.6, 0.6, 0.64), 0.5 + 0.5 * n.y);
  vec3 c = a * (amb + vec3(1.0, 0.96, 0.9) * max(dot(n, l), 0.0) + 0.3 * max(dot(n, normalize(vec3(0.9, 0.1, 0.3))), 0.0));
  c += 0.2 * pow(max(dot(n, normalize(l + v)), 0.0), 32.0) + 0.5 * a * pow(1.0 - max(dot(n, v), 0.0), 3.0);
  gl_FragColor = vec4(pow(c, vec3(0.4545)), 1.0);
}`;
  function program(gl) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
  }
  function legend(gl) { // the glyph, white on transparent; the shader inks it onto the top
    const c = document.createElement('canvas'), g = c.getContext('2d'), n = 512;
    c.width = c.height = n; g.scale(n / 24, n / 24);
    g.lineWidth = 3; g.lineCap = 'round'; g.strokeStyle = g.fillStyle = '#fff';
    g.stroke(new Path2D(GLYPH));
    g.beginPath(); g.arc(16.2, 6.7, 2.2, 0, 7); g.moveTo(18.6, 18.6); g.arc(16.4, 18.6, 2.2, 0, 7); g.fill();
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function mount(el) {
    const cv = el && el.querySelector('canvas');
    let gl = null;
    try { gl = cv && cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true }); } catch (e) { gl = null; }
    const prog = gl && program(gl);
    if (!prog) { if (el) el.classList.add('nogl'); return null; }
    const mesh = keycap(), U = n => gl.getUniformLocation(prog, n);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, mesh.v, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.i, gl.STATIC_DRAW);
    gl.useProgram(prog);
    for (const [n, k, o] of [['aP', 3, 0], ['aN', 3, 12], ['aX', 4, 24]]) {
      const l = gl.getAttribLocation(prog, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, k, gl.FLOAT, false, 40, o);
    }
    legend(gl);
    gl.uniform1i(U('uT'), 0); gl.uniform3fv(U('uInk'), lin('#141310')); gl.uniform3f(U('uCam'), 0, 0, DIST);
    gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
    const uM = U('uM'), uVP = U('uVP'), uBase = U('uBase'), reduced = matchMedia('(prefers-reduced-motion: reduce)');

    let q = rest(-.65), w = [0, 0], tilt = [0, 0], tiltTo = [0, 0], spin = reduced.matches ? 0 : 5, idle = 9, t = 0; // w: rad/s about screen x, y
    let pd = 0, pv = 0, held = false, drag = null, raf = 0, last = 0, vis = true, dead = false, shown = false, theme = '';
    function frame(now) {
      raf = 0;
      if (!cv.isConnected) return destroy();
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60, calm = reduced.matches;
      last = now; t += dt;
      if (!drag) {
        if (Math.hypot(w[0], w[1]) > .01) { // flick
          q = qnorm(qmul(qmul(qax(0, 1, 0, w[1] * dt), qax(1, 0, 0, w[0] * dt)), q));
          const k = Math.exp(-2.4 * dt); w = [w[0] * k, w[1] * k]; idle = 0;
        } else if ((idle += dt) > 1.2 && !calm) { // left alone: turn about its own axis and settle upright
          spin += (SPIN - spin) * (1 - Math.exp(-1.2 * dt));
          q = qlerp(qmul(q, qax(0, 1, 0, spin * dt)), rest(yawOf(q)), 1 - Math.exp(-2 * dt));
        }
      }
      const e = 1 - Math.exp(-6 * dt);
      tilt = [tilt[0] + (tiltTo[0] - tilt[0]) * e, tilt[1] + (tiltTo[1] - tilt[1]) * e];
      pv += ((held ? PRESS : 0) - pd) * 900 * dt - pv * 28 * dt; pd += pv * dt; // key travel: a bouncy spring
      draw(calm ? 0 : Math.sin(t * 1.3) * .05);
      const busy = !calm || drag || held || Math.abs(pv) > 1e-3 || Math.abs(pd) > 1e-3 || Math.hypot(w[0], w[1]) > .01
        || Math.abs(tilt[0] - tiltTo[0]) + Math.abs(tilt[1] - tiltTo[1]) > 1e-3;
      if (busy) start();
    }
    function draw(bob) {
      const th = document.documentElement.dataset.theme;
      if (th !== theme) { theme = th; gl.uniform3fv(uBase, lin(getComputedStyle(document.documentElement).getPropertyValue('--accent'))); }
      const qd = qmul(qmul(qax(1, 0, 0, tilt[0]), qax(0, 1, 0, tilt[1])), q), o = qrot(qd, [0, -H / 2 - pd, 0]);
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(uM, false, mat(qd, o[0], o[1] + bob, o[2]));
      gl.uniformMatrix4fv(uVP, false, proj(cv.width / Math.max(cv.height, 1)));
      gl.drawElements(gl.TRIANGLES, mesh.i.length, gl.UNSIGNED_SHORT, 0);
      if (!shown) { shown = true; el.classList.add('on'); }
    }
    function start() { if (!raf && vis && !dead) { if (!last || performance.now() - last > 100) last = 0; raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    function destroy() {
      if (dead) return; dead = true; stop(); ro.disconnect(); io.disconnect();
      const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext();
    }

    cv.addEventListener('pointerdown', e => {
      if (e.button || drag) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false };
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
      held = true; pv = Math.max(pv, 2.5); w = [0, 0]; spin = 0; idle = 0; start(); // press at once, a drag lets go of it
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) { // the mouse alone tilts it a little towards the cursor
        if (e.pointerType !== 'mouse' || reduced.matches) return;
        const r = cv.getBoundingClientRect();
        tiltTo = [((e.clientY - r.top) / r.height - .5) * .35, ((e.clientX - r.left) / r.width - .5) * .5]; start(); return;
      }
      if (e.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
        drag.moved = true; held = false; tiltTo = [0, 0]; el.classList.add('grab', 'used');
      }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y, s = Math.max((e.timeStamp - drag.t) / 1000, 1 / 250);
      q = qnorm(qmul(qmul(qax(0, 1, 0, dx * ROT), qax(1, 0, 0, dy * ROT)), q));
      w = [w[0] * .5 + dy * ROT / s * .5, w[1] * .5 + dx * ROT / s * .5];
      Object.assign(drag, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    });
    const up = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const sp = Math.hypot(w[0], w[1]);
      if (e.type === 'pointercancel' || e.timeStamp - drag.t > 90) w = [0, 0]; // stopped before letting go: no flick
      else if (sp > 14) w = [w[0] * 14 / sp, w[1] * 14 / sp];
      drag = null; held = false; idle = 0; el.classList.remove('grab'); start();
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { tiltTo = [0, 0]; start(); });
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); if (!dead) { destroy(); el.classList.add('nogl'); } });

    const ro = new ResizeObserver(() => {
      const d = Math.min(window.devicePixelRatio || 1, 2), wd = Math.round(cv.clientWidth * d), ht = Math.round(cv.clientHeight * d);
      if (wd && ht && (cv.width !== wd || cv.height !== ht)) { cv.width = wd; cv.height = ht; }
      start();
    });
    const io = new IntersectionObserver(es => { vis = es[es.length - 1].isIntersecting; if (vis) start(); else stop(); });
    ro.observe(cv); io.observe(el);
    return { destroy };
  }
  return { mount };
})();
