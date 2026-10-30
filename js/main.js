/**
 * main.js
 * ---------------------------------------------------------------------------
 * Ponto de entrada do jogo. Orquestra:
 *   - carregamento dos sprites
 *   - criação do estado (recursos + colônia) e restauração de save
 *   - câmera, renderizador, HUD, menu e inspetor
 *   - entrada (mouse, toque, teclado)
 *   - loop principal, autosave e progresso offline
 */

import {
  BALANCE,
  BUILDINGS,
  BUILDING_LIST,
  GRID,
  RESOURCES,
  RESOURCE_ORDER,
  SOL_LENGTH,
} from './config.js';
import { AssetLoader } from './core/AssetLoader.js';
import { Camera } from './core/Camera.js';
import { Colony } from './core/Colony.js';
import { GameLoop } from './core/GameLoop.js';
import { ResourceManager } from './core/ResourceManager.js';
import { SaveManager } from './core/SaveManager.js';
import { Renderer } from './render/Renderer.js';
import { BuildMenu } from './ui/BuildMenu.js';
import { Hud } from './ui/Hud.js';
import { hydrateStaticIcons, icon } from './ui/icons.js';
import { Inspector } from './ui/Inspector.js';
import { ToastManager } from './ui/Toast.js';
import { formatDelta, formatDuration } from './utils/format.js';
import {
  clamp,
  footprintCenter,
  gridToWorld,
  tileAtWorld,
} from './utils/iso.js';

/* --------------------------------------------------------------------------
   REFERÊNCIAS DE DOM
   -------------------------------------------------------------------------- */
const els = {
  canvas: document.getElementById('game-canvas'),
  hud: document.getElementById('hud'),
  loading: document.getElementById('loading'),
  loadingBar: document.getElementById('loading-progress'),
  loadingStatus: document.getElementById('loading-status'),
  resourceBar: document.getElementById('resource-bar'),
  alertBanner: document.getElementById('alert-banner'),
  panel: document.getElementById('build-panel'),
  buildList: document.getElementById('build-list'),
  categoryFilter: document.getElementById('category-filter'),
  panelScrim: document.getElementById('panel-scrim'),
  panelClose: document.getElementById('btn-panel-close'),
  inspector: document.getElementById('inspector'),
  placementBar: document.getElementById('placement-bar'),
  toasts: document.getElementById('toasts'),
  modalRoot: document.getElementById('modal-root'),
};

/* --------------------------------------------------------------------------
   ESTADO GLOBAL
   -------------------------------------------------------------------------- */
let resources = null;
let colony = null;
let camera = null;
let renderer = null;
let loop = null;
let hud = null;
let buildMenu = null;
let inspector = null;
let toast = null;

const state = {
  placement: null,   // { defId, x, y, valid, reason, hasPosition }
  hover: null,       // { x, y } em tiles
  selectedUid: null,
  drag: null,
  modalOpen: false,
  pendingDemolish: null,
  lastUiUpdate: 0,
  saveDebounce: null,
  autosaveTimer: null,
};

/* ==========================================================================
   BOOT
   ========================================================================== */

async function boot() {
  hydrateStaticIcons();

  /* 1. Sprites --------------------------------------------------------- */
  const manifest = Object.fromEntries(
    BUILDING_LIST.map((def) => [def.id, def.sprite])
  );
  const assets = new AssetLoader(manifest);

  await assets.load((loaded, total, id) => {
    const percent = Math.round((loaded / total) * 100);
    if (els.loadingBar) els.loadingBar.style.width = `${percent}%`;
    if (els.loadingStatus) {
      const name = BUILDINGS[id]?.name ?? id;
      els.loadingStatus.textContent = `Carregando ${name.toLowerCase()}…`;
    }
  });

  /* 2. Estado ---------------------------------------------------------- */
  resources = new ResourceManager(RESOURCES);
  colony = new Colony(resources);

  const saved = SaveManager.load();
  let offline = null;
  let restored = false;

  if (saved && colony.deserialize(saved)) {
    restored = true;
    const elapsed = clamp(
      (Date.now() - (saved.savedAt ?? Date.now())) / 1000,
      0,
      BALANCE.offlineCapSeconds
    );

    if (elapsed > 60) {
      const before = resources.snapshot();
      const populationBefore = colony.population;
      colony.simulate(elapsed * BALANCE.offlineEfficiency);
      offline = {
        elapsed,
        before,
        after: resources.snapshot(),
        populationBefore,
        populationAfter: colony.population,
      };
    }
  } else {
    colony.seedStartingColony();
  }

  // Um tick mínimo para o HUD já abrir com as taxas corretas.
  colony.update(0.0001);

  /* 3. Câmera e renderizador ------------------------------------------ */
  camera = new Camera();
  camera.zoom = Camera.suggestedZoom(window.innerWidth, window.innerHeight);
  const startCenter = colony.buildings.length
    ? footprintCenter(
        colony.buildings[0].x,
        colony.buildings[0].y,
        colony.getDef(colony.buildings[0])?.footprint.w ?? 2,
        colony.getDef(colony.buildings[0])?.footprint.h ?? 2,
        GRID
      )
    : gridToWorld(GRID.size / 2, GRID.size / 2, GRID);
  camera.centerOn(startCenter.x, startCenter.y);

  renderer = new Renderer(els.canvas, camera, GRID, assets);

  /* 4. Interface ------------------------------------------------------- */
  toast = new ToastManager(els.toasts);

  inspector = new Inspector({
    root: els.inspector,
    onDemolish: requestDemolish,
  });

  hud = new Hud({
    resourceBar: els.resourceBar,
    alertBanner: els.alertBanner,
    onSpeed: setSpeed,
    onTogglePause: togglePause,
    onHelp: openHelp,
    onTogglePanel: () => buildMenu?.toggle(),
  });
  hud.mount();

  buildMenu = new BuildMenu({
    panel: els.panel,
    list: els.buildList,
    filter: els.categoryFilter,
    scrim: els.panelScrim,
    closeButton: els.panelClose,
    onSelect: selectBuilding,
    onToggle: () => requestAnimationFrame(updateViewportInsets),
  });
  buildMenu.mount();

  updateViewportInsets();
  centerCameraOnColony();

  /* 5. Entrada, modais e autosave ------------------------------------- */
  setupInput();
  setupModal();
  setupAutosave();

  /* 6. Loop ------------------------------------------------------------ */
  loop = new GameLoop({
    update: (dt) => {
      colony.update(dt);
      drainColonyEvents();
    },
    render: renderGame,
  });

  hud.setSpeedState({ paused: false, speed: 1 });
  hud.update(colony);
  buildMenu.update(resources);
  loop.start();

  /* 7. Fim do carregamento -------------------------------------------- */
  setTimeout(() => els.loading?.classList.add('is-hidden'), 220);
  setTimeout(() => els.loading?.remove(), 1000);

  showBootMessages(offline, assets.failures, restored);

  // Hook de depuração (útil no console e em testes automatizados).
  window.__colonia42 = {
    colony,
    resources,
    camera,
    renderer,
    loop,
    hud,
    buildMenu,
    inspector,
    toast,
    saveNow,
    centerCameraOnColony,
  };
}

/* ==========================================================================
   LOOP / UI
   ========================================================================== */

function renderGame() {
  if (!renderer || !colony) return;

  renderer.draw(colony, {
    hover: state.hover,
    placement: state.placement?.hasPosition ? state.placement : null,
    selectedUid: state.selectedUid,
  });

  const now = performance.now();
  if (now - state.lastUiUpdate < 120) return;
  state.lastUiUpdate = now;

  hud.update(colony);
  buildMenu.update(resources);
  inspector.update(colony);

  // O inspetor pode ter sido fechado pelo usuário; mantém o estado em sincronia.
  state.selectedUid = inspector.isOpen() ? inspector.uid : null;

  // Revalida o fantasma: os recursos podem ter mudado desde o último movimento.
  if (state.placement && state.hover) {
    updatePlacement(state.hover.x, state.hover.y);
  }
}

function drainColonyEvents() {
  for (const event of colony.drainEvents()) {
    switch (event.type) {
      case 'brownout':
        toast.show(
          'APAGÃO: energia insuficiente. A produção caiu para 55%.',
          'error',
          5200
        );
        break;
      case 'power-restored':
        toast.show('Energia restaurada. Produção normalizada.', 'success', 3000);
        break;
      case 'depleted':
        toast.show(
          `${RESOURCES[event.resource]?.name ?? 'Recurso'} esgotado!`,
          'error',
          4800
        );
        break;
      case 'colonist':
        toast.show(
          `Novo colono a bordo — ${event.population} tripulantes.`,
          'success',
          2600
        );
        break;
      case 'colonist-lost':
        toast.show(
          `Um colono deixou a colônia — ${event.population} restantes.`,
          'warning',
          3400
        );
        break;
      default:
        break;
    }
  }
}

function setSpeed(speed) {
  if (!loop) return;
  loop.setSpeed(speed);
  hud.setSpeedState({ paused: loop.isPaused, speed: loop.speed });
}

function togglePause() {
  if (!loop) return;
  const paused = loop.togglePause();
  hud.setSpeedState({ paused, speed: loop.speed });
}

/* ==========================================================================
   CONSTRUÇÃO / SELEÇÃO
   ========================================================================== */

function selectBuilding(def) {
  if (!def) return false;

  // Clicar no mesmo módulo cancela o modo de construção.
  if (state.placement?.defId === def.id) {
    cancelPlacement();
    return true;
  }

  if (!resources.canAfford(def.cost)) {
    const missing = resources.missingFor(def.cost);
    const text = Object.entries(missing)
      .map(([id, value]) => `${Math.ceil(value)} ${RESOURCES[id]?.name ?? id}`)
      .join(' e ');
    toast.show(`Recursos insuficientes: faltam ${text}.`, 'error', 3800);
    return false;
  }

  if (state.placement) cancelPlacement();

  inspector.hide();
  state.selectedUid = null;

  state.placement = {
    defId: def.id,
    x: 0,
    y: 0,
    valid: false,
    reason: '',
    hasPosition: false,
  };

  buildMenu.setSelected(def.id);
  showPlacementBar(def);

  els.canvas.classList.add('is-placing');
  document.body.classList.add('is-placing');

  if (state.hover) updatePlacement(state.hover.x, state.hover.y);

  return true;
}

function showPlacementBar(def) {
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const costs = Object.entries(def.cost ?? {})
    .map(([resource, value]) => {
      const res = RESOURCES[resource];
      return `
        <span class="cost-chip" title="${res?.name ?? resource}">
          ${icon(res?.icon ?? 'minerals', 10)}${Math.round(value)}
        </span>
      `;
    })
    .join('');

  els.placementBar.innerHTML = `
    <div class="placement-bar__icon">${icon('build', 17)}</div>
    <div class="placement-bar__body">
      <div class="placement-bar__name">${def.name}</div>
      <div class="placement-bar__hint" data-hint>${
        isTouch
          ? 'Toque no mapa para posicionar'
          : 'Mova o cursor sobre o mapa para posicionar'
      }</div>
    </div>
    <div class="placement-bar__cost">${costs}</div>
    <button class="icon-btn placement-bar__cancel" type="button" data-action="cancel" title="Cancelar (Esc)" aria-label="Cancelar construção">
      ${icon('close', 15)}
    </button>
  `;

  els.placementBar.hidden = false;
  els.placementBar.classList.remove('is-invalid');
}

function updatePlacement(tx, ty) {
  const placement = state.placement;
  if (!placement) return;

  const def = BUILDINGS[placement.defId];
  if (!def) return;

  const x = tx - Math.floor(def.footprint.w / 2);
  const y = ty - Math.floor(def.footprint.h / 2);
  const result = colony.validate(placement.defId, x, y);

  placement.x = x;
  placement.y = y;
  placement.valid = result.ok;
  placement.reason = result.reason ?? '';
  placement.hasPosition = true;

  updatePlacementHint();
}

function updatePlacementHint() {
  const placement = state.placement;
  const hint = els.placementBar.querySelector('[data-hint]');
  if (!placement || !hint) return;

  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const text = placement.valid
    ? isTouch
      ? 'Toque no mapa para construir'
      : 'Clique no mapa para construir · <strong>Shift</strong> mantém o modo'
    : `<span class="is-error">${placement.reason}</span> · ${
        isTouch ? 'toque em outra posição' : 'escolha outra posição'
      }`;

  if (hint.dataset.text !== text) {
    hint.innerHTML = text;
    hint.dataset.text = text;
  }

  els.placementBar.classList.toggle('is-invalid', !placement.valid);
}

function cancelPlacement() {
  state.placement = null;
  buildMenu?.setSelected(null);
  els.placementBar.hidden = true;
  els.placementBar.innerHTML = '';
  els.canvas.classList.remove('is-placing');
  document.body.classList.remove('is-placing');
}

function tryPlace(event) {
  const placement = state.placement;
  if (!placement || !placement.hasPosition) return;

  if (!placement.valid) {
    toast.show(placement.reason || 'Posição inválida.', 'error', 2400);
    return;
  }

  const def = BUILDINGS[placement.defId];
  const result = colony.place(placement.defId, placement.x, placement.y);

  if (!result.ok) {
    toast.show(result.reason ?? 'Não foi possível construir.', 'error', 2400);
    return;
  }

  toast.show(`${def.name} construído.`, 'success', 2100);
  buildMenu.update(resources);
  scheduleSave();

  if (event?.shiftKey) {
    if (state.hover) updatePlacement(state.hover.x, state.hover.y);
  } else {
    cancelPlacement();
  }
}

function requestDemolish(uid) {
  const building = colony?.getBuildingByUid(uid);
  if (!building) return;

  const def = colony.getDef(building);
  if (!def) return;

  state.pendingDemolish = uid;

  const refund = Object.entries(def.cost ?? {})
    .map(([resource, value]) => {
      const amount = Math.floor(value * BALANCE.refundRate);
      return amount > 0 ? `+${amount} ${RESOURCES[resource]?.short ?? resource}` : null;
    })
    .filter(Boolean)
    .join(' · ');

  openModal(`
    <p class="eyebrow">DESMONTAGEM</p>
    <h2>Demolir ${def.name}?</h2>
    <p>
      O módulo será removido da colônia${
        refund ? ` e você receberá <strong>${refund}</strong> de volta` : ''
      }. A área ficará livre para uma nova construção.
    </p>
    <div class="modal__actions">
      <button class="btn btn--danger" type="button" data-action="confirm-demolish">Sim, demolir</button>
      <button class="btn" type="button" data-action="close">Cancelar</button>
    </div>
  `);
}

function demolishBuilding(uid) {
  const building = colony.getBuildingByUid(uid);
  if (!building) return;

  const def = colony.getDef(building);
  const result = colony.remove(uid);
  if (!result.ok) return;

  const refund = Object.entries(result.refund ?? {})
    .map(([id, value]) => `${value} ${RESOURCES[id]?.short ?? id}`)
    .join(' · ');

  toast.show(
    `${def?.name ?? 'Módulo'} demolido${refund ? ` · reembolso ${refund}` : ''}.`,
    'info',
    3200
  );

  inspector.hide();
  state.selectedUid = null;

  if (state.placement && state.hover) {
    updatePlacement(state.hover.x, state.hover.y);
  }

  buildMenu.update(resources);
  scheduleSave();
}

function handleCanvasClick(tile) {
  if (!tile) return;

  const building = colony.getBuildingAt(tile.x, tile.y);
  if (building) {
    state.selectedUid = building.uid;
    inspector.show(building, colony);
  } else {
    inspector.hide();
    state.selectedUid = null;
  }
}

/* ==========================================================================
   ENTRADA
   ========================================================================== */

function setupInput() {
  const getPoint = (event) => {
    const rect = els.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const updateHover = (point) => {
    const world = camera.screenToWorld(point.x, point.y);
    state.hover = tileAtWorld(world.x, world.y, GRID);

    if (state.placement) {
      updatePlacement(state.hover.x, state.hover.y);
    }
  };

  els.canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 2) return;

    const point = getPoint(event);
    els.canvas.setPointerCapture?.(event.pointerId);

    // No modo de construção, o clique esquerdo posiciona imediatamente.
    if (state.placement && event.button === 0) {
      updateHover(point);
      tryPlace(event);
      return;
    }

    state.drag = {
      id: event.pointerId,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      moved: false,
    };

    els.canvas.classList.add('is-dragging');
  });

  els.canvas.addEventListener('pointermove', (event) => {
    const point = getPoint(event);

    if (state.drag && state.drag.id === event.pointerId) {
      const dx = point.x - state.drag.lastX;
      const dy = point.y - state.drag.lastY;

      if (
        Math.abs(point.x - state.drag.startX) +
          Math.abs(point.y - state.drag.startY) >
        5
      ) {
        state.drag.moved = true;
      }

      if (state.drag.moved) {
        camera.panByScreen(dx, dy);
        camera.clampToGrid(GRID);
      }

      state.drag.lastX = point.x;
      state.drag.lastY = point.y;
    }

    updateHover(point);
  });

  els.canvas.addEventListener('pointerup', (event) => {
    if (!state.drag || state.drag.id !== event.pointerId) return;

    const point = getPoint(event);
    const wasMoved = state.drag.moved;

    state.drag = null;
    els.canvas.classList.remove('is-dragging');

    if (!wasMoved) {
      updateHover(point);
      handleCanvasClick(state.hover);
    }
  });

  els.canvas.addEventListener('pointercancel', () => {
    state.drag = null;
    els.canvas.classList.remove('is-dragging');
  });

  els.canvas.addEventListener('pointerleave', () => {
    if (!state.drag) state.hover = null;
  });

  els.canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (state.placement) cancelPlacement();
  });

  els.canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const point = getPoint(event);
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      camera.zoomAt(point.x, point.y, factor);
      camera.clampToGrid(GRID);
      updateHover(point);
    },
    { passive: false }
  );

  els.placementBar.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="cancel"]')) cancelPlacement();
  });

  /* Controles de zoom para toque (visíveis apenas no mobile) ------------- */
  const zoomControls = document.createElement('div');
  zoomControls.className = 'zoom-controls';
  zoomControls.innerHTML = `
    <button class="zoom-btn" type="button" data-zoom="in" title="Aproximar" aria-label="Aproximar">${icon('zoomIn', 16)}</button>
    <button class="zoom-btn" type="button" data-zoom="out" title="Afastar" aria-label="Afastar">${icon('zoomOut', 16)}</button>
    <button class="zoom-btn" type="button" data-zoom="center" title="Centralizar colônia" aria-label="Centralizar colônia">${icon('target', 16)}</button>
  `;
  document.body.appendChild(zoomControls);

  zoomControls.addEventListener('click', (event) => {
    const action = event.target.closest('[data-zoom]')?.dataset.zoom;
    if (!action) return;

    if (action === 'in') camera.setZoom(camera.zoom * 1.18);
    else if (action === 'out') camera.setZoom(camera.zoom / 1.18);
    else if (action === 'center') centerCameraOnColony();

    camera.clampToGrid(GRID);
  });

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);
}

function onKeyDown(event) {
  if (event.target.closest?.('input, textarea, select')) return;

  if (state.modalOpen) {
    if (event.key === 'Escape') closeModal();
    return;
  }

  switch (event.code) {
    case 'Space':
      event.preventDefault();
      if (!event.repeat) togglePause();
      break;

    case 'Escape':
      if (state.placement) cancelPlacement();
      else {
        inspector.hide();
        state.selectedUid = null;
      }
      break;

    case 'KeyB':
      if (!event.repeat) buildMenu.toggle();
      break;

    case 'KeyG':
      if (!event.repeat) {
        renderer.showGrid = !renderer.showGrid;
        toast.show(
          renderer.showGrid ? 'Grid visível.' : 'Grid oculto.',
          'info',
          1600
        );
      }
      break;

    case 'KeyH':
      if (!event.repeat) openHelp();
      break;

    case 'Digit1':
      setSpeed(1);
      break;

    case 'Digit2':
      setSpeed(2);
      break;

    case 'Digit3':
      setSpeed(4);
      break;

    case 'Delete':
    case 'Backspace':
      event.preventDefault();
      if (state.selectedUid) requestDemolish(state.selectedUid);
      break;

    default:
      if (event.key === '?') openHelp();
      break;
  }
}

function onResize() {
  if (!renderer) return;

  clearTimeout(onResize._timer);
  onResize._timer = setTimeout(() => {
    renderer.resize(getInsets());
    camera.clampToGrid(GRID);
    buildMenu?.syncScrim();
  }, 80);
}

/* ==========================================================================
   VIEWPORT / CÂMERA
   ========================================================================== */

function getInsets() {
  const mobile = window.innerWidth <= 700;
  const hudHeight = els.hud?.getBoundingClientRect().height ?? 78;
  const panelWidth =
    !mobile && buildMenu?.isOpen()
      ? els.panel.getBoundingClientRect().width
      : 0;

  return { top: hudHeight, right: panelWidth, bottom: 0, left: 0 };
}

function updateViewportInsets() {
  if (!renderer) return;
  renderer.setInsets(getInsets());
  camera.clampToGrid(GRID);
}

function centerCameraOnColony() {
  if (!colony || !camera) return;

  if (colony.buildings.length === 0) {
    const center = gridToWorld(GRID.size / 2, GRID.size / 2, GRID);
    camera.centerOn(center.x, center.y);
    return;
  }

  let sx = 0;
  let sy = 0;

  for (const building of colony.buildings) {
    const def = colony.getDef(building);
    if (!def) continue;
    const center = footprintCenter(
      building.x,
      building.y,
      def.footprint.w,
      def.footprint.h,
      GRID
    );
    sx += center.x;
    sy += center.y;
  }

  camera.centerOn(sx / colony.buildings.length, sy / colony.buildings.length);
  camera.clampToGrid(GRID);
}

/* ==========================================================================
   MODAIS / AJUDA / SAVE
   ========================================================================== */

function setupModal() {
  els.modalRoot.addEventListener('click', (event) => {
    if (event.target === els.modalRoot) {
      closeModal();
      return;
    }

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'close') {
      closeModal();
    } else if (action === 'save') {
      saveNow(true);
    } else if (action === 'reset') {
      openResetConfirm();
    } else if (action === 'confirm-demolish') {
      const uid = state.pendingDemolish;
      state.pendingDemolish = null;
      closeModal();
      if (uid) demolishBuilding(uid);
    } else if (action === 'confirm-reset') {
      SaveManager.clear();
      window.location.reload();
    }
  });
}

function openModal(html) {
  els.modalRoot.innerHTML = `
    <div class="modal">
      <button class="icon-btn modal__close" type="button" data-action="close" title="Fechar" aria-label="Fechar">
        ${icon('close', 15)}
      </button>
      ${html}
    </div>
  `;
  els.modalRoot.classList.add('is-open');
  state.modalOpen = true;
}

function closeModal() {
  els.modalRoot.classList.remove('is-open');
  state.modalOpen = false;
  state.pendingDemolish = null;
  setTimeout(() => {
    if (!state.modalOpen) els.modalRoot.innerHTML = '';
  }, 240);
}

function openHelp() {
  const resourceList = RESOURCE_ORDER.map((id) => {
    const res = RESOURCES[id];
    return `<li><strong style="color:${res.color}">${res.name}</strong> — ${res.description}</li>`;
  }).join('');

  const info = SaveManager.info();
  const saveText = info
    ? `Save: ${info.buildings} módulos · ${info.population} tripulantes · ${new Date(info.savedAt).toLocaleString('pt-BR')}`
    : 'Nenhum save salvo ainda.';

  openModal(`
    <p class="eyebrow">MANUAL DE OPERAÇÕES</p>
    <h2>Colônia 42</h2>
    <p>
      Você comanda o primeiro assentamento permanente em Marte. Mantenha o
      suporte vital funcionando, conecte novos módulos à rede e faça a colônia
      crescer — mesmo quando não estiver olhando.
    </p>

    <h3>Controles</h3>
    <div class="modal__grid">
      <div class="modal__card"><strong>Arrastar</strong><span>Move o mapa</span></div>
      <div class="modal__card"><strong>Scroll</strong><span>Zoom no cursor</span></div>
      <div class="modal__card"><strong>Clique</strong><span>Seleciona um módulo</span></div>
      <div class="modal__card"><strong><kbd>B</kbd></strong><span>Abre/fecha a construção</span></div>
      <div class="modal__card"><strong><kbd>Espaço</kbd></strong><span>Pausa / retoma</span></div>
      <div class="modal__card"><strong><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></strong><span>Velocidade 1× / 2× / 4×</span></div>
      <div class="modal__card"><strong><kbd>Shift</kbd> + clique</strong><span>Constrói vários seguidos</span></div>
      <div class="modal__card"><strong><kbd>Delete</kbd></strong><span>Demole o módulo selecionado (com confirmação)</span></div>
    </div>

    <h3>Como manter a colônia viva</h3>
    <ul>
      <li>Oxigênio, água e alimentos são consumidos pela tripulação a cada segundo.</li>
      <li>Módulos precisam estar encostados em outro módulo ou duto para serem construídos.</li>
      <li>Dutos adjacentes dão <strong>+3%</strong> de eficiência por módulo (até +15%).</li>
      <li>Se a energia chegar a zero com saldo negativo, a colônia entra em <strong>apagão</strong> e produz 55%.</li>
      <li>Moral alto acelera o crescimento populacional; moral baixo reduz a eficiência.</li>
      <li>Armazéns aumentam o teto de estoque e evitam desperdício.</li>
    </ul>

    <h3>Recursos</h3>
    <ul>${resourceList}</ul>

    <div class="modal__actions">
      <button class="btn btn--primary" type="button" data-action="save">Salvar agora</button>
      <button class="btn" type="button" data-action="close">Continuar</button>
      <button class="btn btn--danger" type="button" data-action="reset">Novo jogo</button>
    </div>
    <p class="modal__note">
      ${saveText} · Arte: renders conceituais recortados com rembg.
    </p>
  `);
}

function openResetConfirm() {
  openModal(`
    <p class="eyebrow">ZONA DE PERIGO</p>
    <h2>Reiniciar a colônia?</h2>
    <p>
      Todo o progresso, módulos e recursos serão apagados. Esta ação não pode
      ser desfeita.
    </p>
    <div class="modal__actions">
      <button class="btn btn--danger" type="button" data-action="confirm-reset">Sim, reiniciar</button>
      <button class="btn" type="button" data-action="close">Cancelar</button>
    </div>
  `);
}

function saveNow(showFeedback = false) {
  if (!colony) return false;

  const ok = SaveManager.save(colony);

  if (ok) {
    hud?.flashSaved();
    if (showFeedback) toast.show('Progresso salvo.', 'success', 2200);
  } else if (showFeedback) {
    toast.show(
      'Não foi possível salvar. O armazenamento local pode estar bloqueado.',
      'error',
      4200
    );
  }

  return ok;
}

function scheduleSave() {
  clearTimeout(state.saveDebounce);
  state.saveDebounce = setTimeout(() => saveNow(false), 1200);
}

function setupAutosave() {
  let hiddenAt = 0;

  state.autosaveTimer = setInterval(() => {
    if (!document.hidden) saveNow(false);
  }, 20000);

  window.addEventListener('beforeunload', () => SaveManager.save(colony));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      SaveManager.save(colony);
      return;
    }

    if (!hiddenAt) return;

    const elapsed = (Date.now() - hiddenAt) / 1000;
    hiddenAt = 0;

    // Abas ocultas por menos de um minuto não merecem um relatório.
    if (elapsed < 60) return;

    const before = resources.snapshot();
    const populationBefore = colony.population;
    colony.simulate(elapsed * BALANCE.offlineEfficiency);
    const info = describeProgress(
      before,
      resources.snapshot(),
      populationBefore,
      colony.population
    );

    toast.show(
      `Produção em segundo plano (${formatDuration(elapsed)}): ${
        info.summary || 'sem variações relevantes'
      }.${info.lostPopulation}${
        info.depleted.length
          ? ` Atenção: ${info.depleted.join(', ')} esgotado(s).`
          : ''
      }`,
      info.depleted.length || info.lostPopulation ? 'warning' : 'success',
      6200
    );
  });
}

/* ==========================================================================
   MENSAGENS DE BOOT
   ========================================================================== */

/** Resume as variações de recursos e população de um período offline. */
function describeProgress(before, after, populationBefore, populationAfter) {
  const parts = RESOURCE_ORDER.map((id) => ({
    id,
    diff: (after[id] ?? 0) - (before[id] ?? 0),
  }))
    .filter((entry) => Math.abs(entry.diff) >= 1)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const summary = parts
    .slice(0, 4)
    .map((entry) => `${formatDelta(entry.diff)} ${RESOURCES[entry.id].short}`)
    .join(' · ');

  const depleted = RESOURCE_ORDER.filter(
    (id) => colony.resources.amounts[id] <= 0.01
  ).map((id) => RESOURCES[id].name.toLowerCase());

  const lostPopulation =
    populationAfter < populationBefore
      ? ` A tripulação caiu de ${populationBefore} para ${populationAfter}.`
      : '';

  return { summary, depleted, lostPopulation };
}

function showBootMessages(offline, failures, restored) {
  if (failures?.length) {
    toast.show(
      `${failures.length} sprite(s) não encontrado(s). Usando placeholders.`,
      'warning',
      5000
    );
  }

  if (offline) {
    const info = describeProgress(
      offline.before,
      offline.after,
      offline.populationBefore,
      offline.populationAfter
    );

    setTimeout(() => {
      toast.show(
        `Produção offline (${formatDuration(offline.elapsed)}): ${
          info.summary || 'sem variações relevantes'
        }.${info.lostPopulation}${
          info.depleted.length
            ? ` Atenção: ${info.depleted.join(', ')} esgotado(s).`
            : ''
        }`,
        info.depleted.length || info.lostPopulation ? 'warning' : 'success',
        6800
      );
    }, 900);
  }

  if (restored) {
    const sol = Math.floor((colony.elapsed || 0) / SOL_LENGTH) + 1;
    setTimeout(() => {
      toast.show(`Colônia restaurada · Sol ${sol}.`, 'success', 2800);
    }, 500);
  } else {
    setTimeout(() => {
      toast.show(
        'Bem-vindo à Colônia 42. Selecione um módulo no painel para construir.',
        'info',
        5200
      );
    }, 700);

    setTimeout(() => {
      toast.show(
        'Dica: priorize Gerador de Oxigênio, Extrator de Água e Estufa.',
        'info',
        6000
      );
    }, 2400);
  }
}

/* ==========================================================================
   START
   ========================================================================== */

boot().catch((error) => {
  console.error('[Colônia 42] Falha ao iniciar:', error);

  if (els.loadingStatus) {
    els.loadingStatus.textContent = `Falha ao iniciar: ${error?.message ?? 'erro desconhecido'}`;
  }
  if (els.loadingBar) {
    els.loadingBar.style.width = '100%';
    els.loadingBar.style.background = '#f87171';
  }
});
