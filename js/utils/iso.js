/**
 * utils/iso.js
 * ---------------------------------------------------------------------------
 * Matemática da projeção isométrica 2:1 usada pelo grid.
 *
 *   mundo (px)  ──►  tela (px)
 *   gx, gy      ──►  x = (gx - gy) * tileW / 2
 *                    y = (gx + gy) * tileH / 2
 *
 * O mundo é desenhado com a câmera aplicada por cima; estas funções não
 * conhecem zoom nem offset, apenas a grade.
 */

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Converte coordenadas fracionárias da grade para o mundo isométrico. */
export function gridToWorld(gx, gy, grid) {
  return {
    x: (gx - gy) * (grid.tileW / 2),
    y: (gx + gy) * (grid.tileH / 2),
  };
}

/** Converte um ponto do mundo isométrico de volta para coordenadas da grade. */
export function worldToGrid(wx, wy, grid) {
  const a = wx / (grid.tileW / 2);
  const b = wy / (grid.tileH / 2);
  return {
    x: (a + b) / 2,
    y: (b - a) / 2,
  };
}

/** Retorna o tile (inteiro) sob um ponto do mundo. */
export function tileAtWorld(wx, wy, grid) {
  const g = worldToGrid(wx, wy, grid);
  return { x: Math.floor(g.x), y: Math.floor(g.y) };
}

/** Centro do tile em coordenadas de mundo. */
export function tileCenter(x, y, grid) {
  return {
    x: (x - y) * (grid.tileW / 2),
    y: (x + y + 1) * (grid.tileH / 2),
  };
}

/** Centro do footprint (w × h) em coordenadas de mundo. */
export function footprintCenter(x, y, w, h, grid) {
  const gx = x + w / 2;
  const gy = y + h / 2;
  return {
    x: (gx - gy) * (grid.tileW / 2),
    y: (gx + gy) * (grid.tileH / 2),
  };
}

/** Adiciona o losango de um tile ao path atual do contexto. */
export function pathTile(ctx, x, y, grid) {
  const top = gridToWorld(x, y, grid);
  const right = gridToWorld(x + 1, y, grid);
  const bottom = gridToWorld(x + 1, y + 1, grid);
  const left = gridToWorld(x, y + 1, grid);

  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
}

/** Adiciona o contorno de um footprint retangular ao path atual. */
export function pathFootprint(ctx, x, y, w, h, grid) {
  const a = gridToWorld(x, y, grid);
  const b = gridToWorld(x + w, y, grid);
  const c = gridToWorld(x + w, y + h, grid);
  const d = gridToWorld(x, y + h, grid);

  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

/** Itera todos os tiles ocupados por um footprint. */
export function forEachFootprintTile(x, y, w, h, callback) {
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      callback(tx, ty);
    }
  }
}

/**
 * Hash determinístico 0..1 para texturas procedurais (pedras, variação de cor).
 * O mesmo tile sempre recebe o mesmo valor, sem precisar salvar nada.
 */
export function hash2d(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Chave estável para o mapa de ocupação. */
export const cellKey = (x, y) => `${x},${y}`;
