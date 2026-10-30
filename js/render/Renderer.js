/**
 * render/Renderer.js
 * ---------------------------------------------------------------------------
 * Desenha toda a cena isométrica no canvas:
 *   - fundo marciano e partículas de poeira
 *   - plataforma e tiles do grid (com textura procedural determinística)
 *   - edifícios ordenados por profundidade
 *   - dutos desenhados de forma procedural, conectando-se aos vizinhos
 *   - pré-visualização de construção, hover e seleção
 *
 * Os sprites vêm de assets/buildings/*.png (já recortados, com transparência).
 * Para trocar a arte, basta substituir o PNG e ajustar spriteScale/anchor em
 * js/config.js.
 */

import { footprintCenter, gridToWorld, hash2d, pathFootprint, pathTile, tileCenter } from '../utils/iso.js';

const DIRS = [
  { dx: 1, dy: 0, edge: [1, 0.5] },
  { dx: 0, dy: 1, edge: [0.5, 1] },
  { dx: -1, dy: 0, edge: [0, 0.5] },
  { dx: 0, dy: -1, edge: [0.5, 0] },
];

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../core/Camera.js').Camera} camera
   * @param {{size:number,tileW:number,tileH:number}} grid
   * @param {import('../core/AssetLoader.js').AssetLoader} assets
   */
  constructor(canvas, camera, grid, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.camera = camera;
    this.grid = grid;
    this.assets = assets;

    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
    this.showGrid = true;

    this.particles = [];
    this.time = 0;
    this.lastFrame = performance.now();

    this._bgGradient = null;
    this._vignette = null;

    this.resize();
    this.initParticles();
  }

  /* ======================================================================
     TAMANHO / VIEWPORT
     ====================================================================== */

  resize(insets = this.insets) {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);

    this.insets = { top: 0, right: 0, bottom: 0, left: 0, ...insets };
    this.camera.setViewport(this.width, this.height, this.insets);

    this.buildScreenGradients();
  }

  setInsets(insets) {
    this.insets = { top: 0, right: 0, bottom: 0, left: 0, ...insets };
    this.camera.setViewport(this.width, this.height, this.insets);
  }

  buildScreenGradients() {
    const ctx = this.ctx;

    const bg = ctx.createLinearGradient(0, 0, 0, this.height);
    bg.addColorStop(0, '#241512');
    bg.addColorStop(0.45, '#150d0b');
    bg.addColorStop(1, '#080605');
    this._bgGradient = bg;

    const v = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.48,
      Math.min(this.width, this.height) * 0.28,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.78
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.72, 'rgba(0,0,0,0.18)');
    v.addColorStop(1, 'rgba(0,0,0,0.62)');
    this._vignette = v;
  }

  initParticles() {
    this.particles = Array.from({ length: 64 }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      speed: 3 + Math.random() * 14,
      size: 0.4 + Math.random() * 1.5,
      alpha: 0.035 + Math.random() * 0.1,
      drift: -0.1 + Math.random() * 0.2,
    }));
  }

  /* ======================================================================
     DESENHO PRINCIPAL
     ====================================================================== */

  /**
   * @param {import('../core/Colony.js').Colony} colony
   * @param {{
   *   hover: {x:number,y:number}|null,
   *   placement: {defId:string,x:number,y:number,valid:boolean}|null,
   *   selectedUid: string|null,
   * }} view
   */
  draw(colony, view) {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.time += dt;

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.drawBackground(dt);
    this.drawParticles(dt);

    ctx.save();
    ctx.translate(this.camera.screenCenterX, this.camera.screenCenterY);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    this.drawPlatform();
    this.drawTiles();

    const selected = view.selectedUid
      ? colony.getBuildingByUid(view.selectedUid)
      : null;

    if (selected) this.drawFootprintFill(selected, 'rgba(249, 115, 22, 0.12)');

    this.drawEntities(colony);

    if (selected) {
      this.drawFootprintOutline(selected, 'rgba(249, 115, 22, 0.9)', 2.2);
    }

    this.drawHover(view);
    this.drawGhost(colony, view);

    ctx.restore();

    ctx.fillStyle = this._vignette;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawBackground(dt) {
    const ctx = this.ctx;
    ctx.fillStyle = this._bgGradient;
    ctx.fillRect(0, 0, this.width, this.height);

    // Brilho quente atrás da colônia.
    const glow = ctx.createRadialGradient(
      this.camera.screenCenterX,
      this.camera.screenCenterY,
      0,
      this.camera.screenCenterX,
      this.camera.screenCenterY,
      Math.max(this.width, this.height) * 0.48
    );
    glow.addColorStop(0, 'rgba(249, 115, 22, 0.075)');
    glow.addColorStop(0.55, 'rgba(180, 60, 20, 0.025)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);

    // Linha de horizonte sutil.
    const horizon = this.height * 0.58;
    const hg = ctx.createLinearGradient(0, horizon - 120, 0, horizon + 160);
    hg.addColorStop(0, 'rgba(120, 45, 25, 0)');
    hg.addColorStop(0.5, 'rgba(120, 45, 25, 0.05)');
    hg.addColorStop(1, 'rgba(120, 45, 25, 0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, horizon - 120, this.width, 280);
  }

  drawParticles(dt) {
    const ctx = this.ctx;
    ctx.save();
    for (const p of this.particles) {
      p.x += p.speed * dt;
      p.y += p.drift * p.speed * dt;
      if (p.x > this.width + 4) p.x = -4;
      if (p.y < -4) p.y = this.height + 4;
      if (p.y > this.height + 4) p.y = -4;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = '#ffcfae';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ======================================================================
     PLATAFORMA / TILES
     ====================================================================== */

  drawPlatform() {
    const ctx = this.ctx;
    const s = this.grid.size;
    const depth = 22;

    const top = gridToWorld(0, 0, this.grid);
    const right = gridToWorld(s, 0, this.grid);
    const bottom = gridToWorld(s, s, this.grid);
    const left = gridToWorld(0, s, this.grid);

    // Sombra difusa ao redor da plataforma.
    ctx.save();
    ctx.translate(0, bottom.y + 30);
    ctx.scale(1, 0.18);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, s * this.grid.tileW * 0.55);
    shadow.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, s * this.grid.tileW * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Faces laterais (dão espessura à laje).
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(bottom.x, bottom.y + depth);
    ctx.lineTo(left.x, left.y + depth);
    ctx.closePath();
    ctx.fillStyle = '#2a1713';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(bottom.x, bottom.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + depth);
    ctx.lineTo(bottom.x, bottom.y + depth);
    ctx.closePath();
    ctx.fillStyle = '#3b2119';
    ctx.fill();

    // Arestas iluminadas.
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(right.x, right.y);
    ctx.strokeStyle = 'rgba(255, 160, 110, 0.16)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Base escura sob os tiles (evita frestas).
    pathFootprint(ctx, 0, 0, s, s, this.grid);
    ctx.fillStyle = '#4b2a20';
    ctx.fill();
  }

  drawTiles() {
    const ctx = this.ctx;
    const s = this.grid.size;

    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const h = hash2d(x, y);
        const light = 23 + h * 6;
        const hue = 12 + h * 4;

        pathTile(ctx, x, y, this.grid);
        ctx.fillStyle = `hsl(${hue}, 32%, ${light}%)`;
        ctx.fill();

        // Bordas do grid.
        ctx.strokeStyle = this.showGrid
          ? 'rgba(255, 175, 130, 0.075)'
          : 'rgba(0, 0, 0, 0.055)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Textura: pedrinhas determinísticas.
        const center = tileCenter(x, y, this.grid);
        const h1 = hash2d(x + 17, y + 31);
        const h2 = hash2d(x + 71, y + 13);

        if (h1 > 0.28) {
          const px = center.x + (h1 - 0.5) * this.grid.tileW * 0.46;
          const py = center.y + (h2 - 0.5) * this.grid.tileH * 0.4;
          ctx.beginPath();
          ctx.ellipse(
            px,
            py,
            0.8 + h2 * 1.8,
            0.5 + h2 * 1.1,
            h1 * Math.PI,
            0,
            Math.PI * 2
          );
          ctx.fillStyle =
            h1 > 0.72
              ? 'rgba(255, 190, 150, 0.055)'
              : 'rgba(0, 0, 0, 0.16)';
          ctx.fill();
        }

        // Rachaduras ocasionais.
        if (h > 0.93) {
          const len = 5 + h2 * 9;
          ctx.beginPath();
          ctx.moveTo(center.x - len, center.y - len * 0.2);
          ctx.lineTo(center.x, center.y);
          ctx.lineTo(center.x + len * 0.7, center.y + len * 0.35);
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Crateras raras.
        if (h < 0.018) {
          ctx.beginPath();
          ctx.ellipse(
            center.x,
            center.y,
            this.grid.tileW * 0.12,
            this.grid.tileH * 0.12,
            0,
            0,
            Math.PI * 2
          );
          ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 170, 120, 0.1)';
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }
    }
  }

  /* ======================================================================
     ENTIDADES
     ====================================================================== */

  drawEntities(colony) {
    const entities = colony.buildings
      .map((building) => {
        const def = colony.getDef(building);
        if (!def) return null;
        return {
          building,
          def,
          depth:
            building.x +
            building.y +
            def.footprint.w +
            def.footprint.h -
            2,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.depth - b.depth);

    for (const { building, def } of entities) {
      if (def.isConnector) {
        this.drawDuct(colony, building);
      } else {
        this.drawBuilding(building, def);
      }
    }
  }

  drawBuilding(building, def, { alpha = 1 } = {}) {
    const ctx = this.ctx;
    const image = this.assets.get(building.id);
    if (!image) return;

    const { w, h } = def.footprint;
    const center = footprintCenter(building.x, building.y, w, h, this.grid);
    const anchorY = center.y + this.grid.tileH * (def.anchor ?? 0.96);

    const width = w * this.grid.tileW * 1.02 * (def.spriteScale ?? 1);
    const height = width * (image.height / image.width);

    // Sombra de contato.
    if (alpha >= 0.9) {
      ctx.save();
      ctx.translate(center.x, anchorY - 4);
      ctx.scale(1, 0.34);
      const radius = w * this.grid.tileW * 0.34;
      const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      shadow.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
      shadow.addColorStop(0.55, 'rgba(0, 0, 0, 0.22)');
      shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, center.x - width / 2, anchorY - height, width, height);
    ctx.restore();
  }

  drawDuct(colony, building) {
    const ctx = this.ctx;
    const center = tileCenter(building.x, building.y, this.grid);
    const connections = [];

    for (const dir of DIRS) {
      const neighbor = colony.getBuildingAt(
        building.x + dir.dx,
        building.y + dir.dy
      );
      if (neighbor) {
        const edge = gridToWorld(
          building.x + dir.edge[0],
          building.y + dir.edge[1],
          this.grid
        );
        connections.push(edge);
      }
    }

    // Sombra dos tubos.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.lineWidth = 17;
    for (const edge of connections) {
      ctx.beginPath();
      ctx.moveTo(center.x + 2, center.y + 5);
      ctx.lineTo(edge.x + 2, edge.y + 5);
      ctx.stroke();
    }
    ctx.restore();

    // Tubos.
    for (const edge of connections) {
      const ex = edge.x + (edge.x - center.x) * 0.06;
      const ey = edge.y + (edge.y - center.y) * 0.06;

      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = '#24130d';
      ctx.lineWidth = 18;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 13;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = '#ea8a1e';
      ctx.lineWidth = 8;
      ctx.stroke();

      // Brilho superior.
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - 3.5);
      ctx.lineTo(ex, ey - 3.5);
      ctx.strokeStyle = 'rgba(253, 186, 116, 0.55)';
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    // Flanges nas pontas.
    for (const edge of connections) {
      const angle = Math.atan2(edge.y - center.y, edge.x - center.x);
      ctx.save();
      ctx.translate(edge.x, edge.y);
      ctx.rotate(angle);
      ctx.fillStyle = '#2b160e';
      ctx.beginPath();
      ctx.roundRect(-3, -9, 7, 18, 2);
      ctx.fill();
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.roundRect(-1.5, -7, 4, 14, 1.5);
      ctx.fill();
      ctx.restore();
    }

    // Junção central.
    ctx.beginPath();
    ctx.arc(center.x, center.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#2b160e';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#b45309';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center.x, center.y, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = '#7c2d12';
    ctx.fill();

    // Luz de status piscando.
    const pulse = 0.55 + Math.sin(this.time * 3 + building.x * 0.7 + building.y) * 0.35;
    ctx.beginPath();
    ctx.arc(center.x, center.y - 1, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(52, 211, 153, ${pulse})`;
    ctx.fill();
  }

  /* ======================================================================
     HOVER / SELEÇÃO / GHOST
     ====================================================================== */

  drawFootprintFill(building, color) {
    const ctx = this.ctx;
    const info = building.def ?? null;
    const w = info?.footprint?.w ?? 1;
    const h = info?.footprint?.h ?? 1;

    ctx.save();
    ctx.fillStyle = color;
    for (let ty = building.y; ty < building.y + h; ty++) {
      for (let tx = building.x; tx < building.x + w; tx++) {
        pathTile(ctx, tx, ty, this.grid);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawFootprintOutline(building, color, lineWidth = 2, dash = null) {
    const ctx = this.ctx;
    const info = building.def ?? null;
    const w = info?.footprint?.w ?? 1;
    const h = info?.footprint?.h ?? 1;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash);
    pathFootprint(ctx, building.x, building.y, w, h, this.grid);
    ctx.stroke();
    ctx.restore();
  }

  drawHover(view) {
    if (view.placement || !view.hover) return;

    const ctx = this.ctx;
    const { x, y } = view.hover;

    if (
      x < 0 ||
      y < 0 ||
      x >= this.grid.size ||
      y >= this.grid.size
    ) {
      return;
    }

    ctx.save();
    pathTile(ctx, x, y, this.grid);
    ctx.fillStyle = 'rgba(255, 230, 210, 0.035)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 220, 190, 0.2)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  drawGhost(colony, view) {
    const placement = view.placement;
    if (!placement) return;

    const def = colony.getDef({ id: placement.defId });
    if (!def) return;

    const ghost = {
      id: placement.defId,
      x: placement.x,
      y: placement.y,
      def,
      ductBonus: 0,
    };

    const color = placement.valid
      ? 'rgba(52, 211, 153, 0.16)'
      : 'rgba(248, 113, 113, 0.16)';
    const stroke = placement.valid
      ? 'rgba(52, 211, 153, 0.95)'
      : 'rgba(248, 113, 113, 0.95)';

    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    for (let ty = placement.y; ty < placement.y + def.footprint.h; ty++) {
      for (let tx = placement.x; tx < placement.x + def.footprint.w; tx++) {
        pathTile(ctx, tx, ty, this.grid);
        ctx.fill();
      }
    }
    ctx.restore();

    if (!def.isConnector) {
      this.drawBuilding(ghost, def, { alpha: 0.52 });
    } else {
      // Para dutos, desenha um pequeno anel de pré-visualização.
      const center = tileCenter(placement.x, placement.y, this.grid);
      ctx.save();
      ctx.beginPath();
      ctx.arc(center.x, center.y, 15, 0, Math.PI * 2);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.restore();
    }

    this.drawFootprintOutline(
      ghost,
      stroke,
      2.2,
      placement.valid ? null : [7, 5]
    );
  }
}
