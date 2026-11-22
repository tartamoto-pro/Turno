/* Lector de la foto del calendario Shifter: encuentra la cuadrícula (6 semanas x 7 días)
   y mira el color de cada casilla. Morado = Di, turquesa = N, verde = M, blanco/gris = libre.
   Trabaja sobre {width, height, data} (RGBA), igual que un ImageData del navegador. */
(function (raiz) {
  function lum(d, i) { return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; }

  function tramos(frac, min, maxGrosor) {
    var out = [], y = 0, h = frac.length;
    while (y < h) {
      if (frac[y] >= min) {
        var a = y, best = 0; while (y < h && frac[y] >= min) { best = Math.max(best, frac[y]); y++; }
        if (y - a <= maxGrosor) out.push({ c: (a + y - 1) / 2, f: best });
      } else y++;
    }
    return out;
  }
  /* cuánto parece una línea fina en yc: oscuro justo ahí y claro un poco más arriba y más abajo
     (así no confunde la barra oscura de arriba de la app con el borde de la cuadrícula) */
  function cerca(frac, yc, r, s) {
    var m = 0, h = frac.length;
    for (var y = Math.round(yc - r); y <= Math.round(yc + r); y++) if (y >= 0 && y < h) m = Math.max(m, frac[y]);
    function lado(ks) { var t = 0, n = 0; ks.forEach(function (k) { var yy = Math.round(yc + k * s); if (yy >= 0 && yy < h) { t += frac[yy]; n++; } }); return n ? t / n : 0; }
    return m - Math.max(lado([-0.15, -0.1]), lado([0.1, 0.15]));
  }

  /* fracción de puntos oscuros por fila (eje "y") o por columna (eje "x") dentro de un rango */
  function perfil(img, umbral, eje, desde, hasta) {
    var w = img.width, h = img.height, d = img.data, n = eje === "y" ? h : w, out = new Float32Array(n);
    desde = Math.max(0, Math.round(desde)); hasta = Math.min(eje === "y" ? w : h, Math.round(hasta));
    var largo = Math.max(1, hasta - desde);
    for (var i = 0; i < n; i++) {
      var c = 0;
      for (var j = desde; j < hasta; j++) {
        var o = eje === "y" ? (i * w + j) * 4 : (j * w + i) * 4;
        if (lum(d, o) < umbral) c++;
      }
      out[i] = c / largo;
    }
    return out;
  }
  /* la serie más larga de líneas finas a la misma distancia (puede faltar alguna en medio) */
  function serie(cand, smin, smax) {
    var mejor = null;
    for (var i = 0; i < cand.length; i++) for (var j = i + 1; j < cand.length; j++) {
      var s = cand[j].c - cand[i].c;
      if (s < smin || s > smax) continue;
      var lin = [cand[i].c], ult = cand[i].c, huecos = 0;
      for (var k = j; k < cand.length; k++) {
        var dd = cand[k].c - ult, m = Math.round(dd / s);
        if (m >= 1 && m <= 2 && Math.abs(dd - m * s) <= s * 0.1) { huecos += m - 1; lin.push(cand[k].c); ult = cand[k].c; }
        else if (dd > s * 2.3) break;
      }
      var filas = Math.round((ult - lin[0]) / s);
      if (filas > 7) continue;
      var puntos = lin.length - huecos * 0.5;
      if (!mejor || puntos > mejor.puntos + 0.01 || (Math.abs(puntos - mejor.puntos) < 0.01 && s > mejor.s))
        mejor = { lin: lin, ini: lin[0], fin: ult, filas: filas, s: filas ? (ult - lin[0]) / filas : s, puntos: puntos };
    }
    return mejor;
  }

  function buscarCuadricula(img) {
    var w = img.width, h = img.height, res = null;
    [90, 120, 60].some(function (umbral) {
      var fy = perfil(img, umbral, "y", 0, w);
      var hor = serie(tramos(fy, 0.3, Math.max(3, h * 0.015)), h * 0.05, h * 0.25);
      if (!hor || hor.filas < 3) return false;
      /* columnas: líneas verticales dentro de la zona de la cuadrícula */
      var fx = perfil(img, umbral, "x", hor.ini, hor.fin);
      var ver = serie(tramos(fx, 0.2, Math.max(3, w * 0.02)), w * 0.08, w * 0.2);
      var x0, x1;
      if (ver && ver.filas >= 4) {
        var cw = ver.s, izq = ver.ini, der = ver.fin;
        /* completar hasta 7 columnas por el lado que siga habiendo línea o imagen */
        while (Math.round((der - izq) / cw) < 7) {
          var puntosIzq = izq - cw >= -cw * 0.15 ? cerca(fx, izq - cw, Math.max(3, cw * 0.1), cw) : -9;
          var puntosDer = der + cw <= w + cw * 0.15 ? cerca(fx, der + cw, Math.max(3, cw * 0.1), cw) : -9;
          if (puntosIzq === -9 && puntosDer === -9) break;
          if (puntosIzq >= puntosDer) izq -= cw; else der += cw;
        }
        x0 = Math.max(0, izq); x1 = Math.min(w, der);
      } else {
        x0 = 0; x1 = w;
      }
      /* completar hasta 6 filas: por arriba solo si hay línea fina; si no, por abajo (aunque se salga de la foto) */
      var s = hor.s, top = hor.ini, n = hor.filas;
      while (n < 6) {
        var arriba = top - s >= -s * 0.1 ? cerca(fy, top - s, Math.max(3, s * 0.06), s) : -9;
        var abajo = top + (n + 1) * s <= h + s * 0.1 ? cerca(fy, top + (n + 1) * s, Math.max(3, s * 0.06), s) : 0;
        if (arriba > abajo && arriba > 0.15) top -= s;
        n++;
      }
      res = { x0: x0, x1: x1, y0: top, y1: top + 6 * s };
      return true;
    });
    return res;
  }

  /* convierte (u = columna 0..7, v = fila 0..filas) en un punto de la foto.
     Sirve para rejilla recta {x0,x1,y0,y1} o para 4 esquinas tocadas a mano {pts:[ai, ad, bd, bi], filas} */
  function mapa(g) {
    if (g.pts) {
      var p = g.pts, F = g.filas || 6;
      return function (u, v) {
        var a = u / 7, b = v / F;
        return [(1 - a) * (1 - b) * p[0][0] + a * (1 - b) * p[1][0] + a * b * p[2][0] + (1 - a) * b * p[3][0],
                (1 - a) * (1 - b) * p[0][1] + a * (1 - b) * p[1][1] + a * b * p[2][1] + (1 - a) * b * p[3][1]];
      };
    }
    var cw = (g.x1 - g.x0) / 7, ch = (g.y1 - g.y0) / 6;
    return function (u, v) { return [g.x0 + u * cw, g.y0 + v * ch]; };
  }
  function colorCasilla(img, m, c, f) {
    var w = img.width, h = img.height, d = img.data, R = 0, G = 0, B = 0, n = 0, px = [];
    for (var j = 0; j < 10; j++) for (var i = 0; i < 14; i++) {
      var q = m(c + 0.15 + 0.7 * i / 13, f + 0.45 + 0.45 * j / 9), x = Math.round(q[0]), y = Math.round(q[1]);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      var o = (y * w + x) * 4;
      px.push([d[o], d[o + 1], d[o + 2], lum(d, o)]);
    }
    if (px.length < 20) return null;
    /* fuera las letras: nos quedamos con la parte más clara de los puntos (el fondo de la casilla) */
    px.sort(function (a, b) { return b[3] - a[3]; });
    var hasta = Math.max(1, Math.floor(px.length * 0.6));
    for (var k = Math.floor(px.length * 0.05); k < hasta; k++) { R += px[k][0]; G += px[k][1]; B += px[k][2]; n++; }
    if (!n) return null;
    return [R / n, G / n, B / n];
  }
  function clasificar(c) {
    if (!c) return "";
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var sat = mx ? (mx - mn) / mx : 0;
    if (sat < 0.07) return "";
    var hue;
    if (mx === r) hue = 60 * (((g - b) / (mx - mn)) % 6);
    else if (mx === g) hue = 60 * ((b - r) / (mx - mn) + 2);
    else hue = 60 * ((r - g) / (mx - mn) + 4);
    if (hue < 0) hue += 360;
    if (hue >= 250 && hue <= 350) return "Di";
    if (hue >= 160 && hue < 215) return "N";
    if (hue >= 85 && hue < 160) return "M";
    return "";
  }

  /* devuelve 42 valores ("Di", "N", "M" o "") de arriba a abajo y de lunes a domingo */
  function leerCasillas(img, g) {
    var m = mapa(g), filas = g.pts ? (g.filas || 6) : 6, out = [];
    for (var f = 0; f < 6; f++) for (var c = 0; c < 7; c++)
      out.push(f < filas ? clasificar(colorCasilla(img, m, c, f)) : "");
    return out;
  }

  var api = { buscarCuadricula: buscarCuadricula, leerCasillas: leerCasillas, clasificar: clasificar, mapa: mapa };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else raiz.LectorTurnos = api;
})(this);
