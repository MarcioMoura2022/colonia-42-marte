/**
 * core/AssetLoader.js
 * ---------------------------------------------------------------------------
 * Carrega os sprites dos edifícios e mantém um cache id -> imagem.
 *
 * Se um arquivo falhar, gera um placeholder desenhado em canvas para que o
 * jogo continue funcionando (útil enquanto você troca os assets).
 */

export class AssetLoader {
  /**
   * @param {Record<string, string>} manifest  id do edifício -> caminho do PNG
   */
  constructor(manifest) {
    this.manifest = manifest;
    this.images = new Map();
    this.failures = [];
  }

  /**
   * @param {(loaded:number, total:number, id:string) => void} [onProgress]
   */
  async load(onProgress) {
    const entries = Object.entries(this.manifest);
    let loaded = 0;

    await Promise.all(
      entries.map(async ([id, url]) => {
        const image = await this.loadImage(url);
        if (!image) {
          this.failures.push(id);
          this.images.set(id, this.createPlaceholder(id));
        } else {
          this.images.set(id, image);
        }
        loaded += 1;
        onProgress?.(loaded, entries.length, id);
      })
    );

    return this;
  }

  loadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  /** Placeholder visual para assets ausentes. */
  createPlaceholder(id) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 384);
    gradient.addColorStop(0, '#3a241c');
    gradient.addColorStop(1, '#1a100d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 384);

    ctx.strokeStyle = 'rgba(249,115,22,.5)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(256, 60);
    ctx.lineTo(430, 160);
    ctx.lineTo(430, 300);
    ctx.lineTo(256, 380);
    ctx.lineTo(82, 300);
    ctx.lineTo(82, 160);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = 'rgba(249,115,22,.14)';
    ctx.fill();

    ctx.fillStyle = '#f4ebe5';
    ctx.font = '700 22px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(id, 256, 218);

    ctx.fillStyle = '#a8968c';
    ctx.font = '500 13px "Segoe UI", sans-serif';
    ctx.fillText('asset ausente', 256, 244);

    return canvas;
  }

  get(id) {
    return this.images.get(id) ?? null;
  }
}
