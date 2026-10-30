/**
 * core/GameLoop.js
 * ---------------------------------------------------------------------------
 * Loop principal baseado em requestAnimationFrame.
 *
 * - O update recebe o delta em segundos já multiplicado pela velocidade.
 * - O render é chamado sempre (mesmo pausado) para manter a câmera fluida.
 * - Deltas muito grandes (aba em background) são limitados para evitar
 *   saltos absurdos na simulação. O progresso offline é tratado à parte.
 */

const MAX_REAL_DELTA = 0.1; // s

export class GameLoop {
  /**
   * @param {{ update:(dt:number)=>void, render:(now:number)=>void }} handlers
   */
  constructor({ update, render }) {
    this.update = update;
    this.render = render;

    this.speed = 1;
    this.paused = false;
    this.lastSpeed = 1;
    this.running = false;

    this._raf = null;
    this._lastTime = 0;
    this._fps = 60;
    this._boundFrame = this._frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = performance.now();
    this._raf = requestAnimationFrame(this._boundFrame);
  }

  stop() {
    this.running = false;
    if (this._raf !== null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  _frame(now) {
    if (!this.running) return;

    const realDt = Math.min(MAX_REAL_DELTA, Math.max(0, (now - this._lastTime) / 1000));
    this._lastTime = now;

    if (realDt > 0) {
      this._fps += ((1 / realDt) - this._fps) * 0.05;
    }

    if (!this.paused && this.speed > 0) {
      this.update(realDt * this.speed);
    }

    this.render(now);
    this._raf = requestAnimationFrame(this._boundFrame);
  }

  setSpeed(speed) {
    const value = Number(speed);
    if (!Number.isFinite(value) || value < 0) return;

    if (value === 0) {
      this.paused = true;
    } else {
      this.speed = value;
      this.lastSpeed = value;
      this.paused = false;
    }
  }

  togglePause() {
    if (this.paused) {
      this.paused = false;
      this.speed = this.lastSpeed || 1;
    } else {
      this.lastSpeed = this.speed || 1;
      this.paused = true;
    }
    return this.paused;
  }

  get fps() {
    return Math.round(this._fps);
  }

  get isPaused() {
    return this.paused;
  }
}
