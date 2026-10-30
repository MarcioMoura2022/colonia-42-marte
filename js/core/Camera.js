/**
 * core/Camera.js
 * ---------------------------------------------------------------------------
 * Câmera 2D com pan e zoom ancorado no cursor.
 *
 * O canvas é desenhado em "coordenadas de mundo" (isométricas). A câmera
 * guarda o ponto do mundo que fica no centro da área visível e o zoom.
 *
 * A área visível desconta o HUD e o painel lateral, para que a colônia fique
 * centralizada no espaço realmente livre da tela.
 */

import { clamp } from '../utils/iso.js';

export class Camera {
  constructor({ minZoom = 0.5, maxZoom = 2.2 } = {}) {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.minZoom = minZoom;
    this.maxZoom = maxZoom;

    this.viewWidth = window.innerWidth;
    this.viewHeight = window.innerHeight;
    this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
  }

  setViewport(width, height, insets = {}) {
    this.viewWidth = width;
    this.viewHeight = height;
    this.insets = { top: 0, right: 0, bottom: 0, left: 0, ...insets };
  }

  /** Centro da área visível em pixels de tela. */
  get screenCenterX() {
    const { left, right } = this.insets;
    return left + (this.viewWidth - left - right) / 2;
  }

  get screenCenterY() {
    const { top, bottom } = this.insets;
    return top + (this.viewHeight - top - bottom) / 2;
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom + this.screenCenterX,
      y: (wy - this.y) * this.zoom + this.screenCenterY,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.screenCenterX) / this.zoom + this.x,
      y: (sy - this.screenCenterY) / this.zoom + this.y,
    };
  }

  centerOn(wx, wy) {
    this.x = wx;
    this.y = wy;
  }

  panByScreen(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  /** Zoom mantendo o ponto sob o cursor fixo. */
  zoomAt(screenX, screenY, factor) {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  setZoom(zoom, screenX = this.screenCenterX, screenY = this.screenCenterY) {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = clamp(zoom, this.minZoom, this.maxZoom);
    const after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  /**
   * Impede que a câmera se afaste demais do mapa.
   * A margem é generosa de propósito: o jogador pode explorar o entorno.
   */
  clampToGrid(grid) {
    const halfW = (grid.size * grid.tileW) / 2;
    const height = grid.size * grid.tileH;

    const marginX = 420;
    const marginY = 320;

    this.x = clamp(this.x, -halfW - marginX, halfW + marginX);
    this.y = clamp(this.y, -marginY, height + marginY);
  }

  /** Zoom inicial confortável para o tamanho da tela. */
  static suggestedZoom(width, height) {
    if (width < 700) return 0.66;
    if (width < 1100) return 0.78;
    if (height > 1000) return 0.98;
    return 0.95;
  }
}
