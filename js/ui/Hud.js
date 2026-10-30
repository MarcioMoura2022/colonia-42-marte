/**
 * ui/Hud.js
 * ---------------------------------------------------------------------------
 * HUD superior: chips de recursos, relógio solar, tripulação, moral,
 * controles de velocidade e banner de alerta crítico.
 *
 * O HUD é reconstruído uma única vez; o update só altera texto/classes para
 * evitar layout thrashing a 60 fps.
 */

import { RESOURCES, RESOURCE_ORDER, SOL_LENGTH } from '../config.js';
import { formatNumber, formatRate, formatSolTime } from '../utils/format.js';
import { hydrateStaticIcons, icon } from './icons.js';

export class Hud {
  /**
   * @param {{
   *   resourceBar: HTMLElement,
   *   alertBanner: HTMLElement,
   *   onSpeed: (speed:number)=>void,
   *   onTogglePause: ()=>void,
   *   onHelp: ()=>void,
   *   onTogglePanel: ()=>void,
   * }} options
   */
  constructor(options) {
    this.options = options;
    this.resourceEls = new Map();
    this.speedButtons = [];
    this.currentSpeed = 1;
    this.saveTimer = null;
    this.alertText = '';

    this.el = {
      resourceBar: options.resourceBar,
      alertBanner: options.alertBanner,
      solValue: document.getElementById('sol-value'),
      solTime: document.getElementById('sol-time'),
      popValue: document.getElementById('pop-value'),
      moraleValue: document.getElementById('morale-value'),
      statPop: document.getElementById('stat-pop'),
      statMorale: document.getElementById('stat-morale'),
      pauseBtn: document.getElementById('btn-pause'),
      saveFlash: document.getElementById('save-flash'),
    };
  }

  mount() {
    hydrateStaticIcons(document);
    this.buildResourceChips();
    this.bindControls();
  }

  buildResourceChips() {
    this.el.resourceBar.innerHTML = RESOURCE_ORDER.map((id) => {
      const def = RESOURCES[id];
      return `
        <div class="resource" role="listitem" data-res="${id}" style="--res-color:${def.color}">
          <div class="resource__icon">${icon(def.icon, 17)}</div>
          <div class="resource__body">
            <div class="resource__top">
              <span class="resource__value">0</span>
              <span class="resource__rate">0.0/s</span>
            </div>
            <span class="resource__label">${def.name}</span>
          </div>
          <div class="resource__bar"><i></i></div>
        </div>
      `;
    }).join('');

    for (const id of RESOURCE_ORDER) {
      const root = this.el.resourceBar.querySelector(`[data-res="${id}"]`);
      this.resourceEls.set(id, {
        root,
        value: root.querySelector('.resource__value'),
        rate: root.querySelector('.resource__rate'),
        bar: root.querySelector('.resource__bar i'),
      });
    }
  }

  bindControls() {
    this.speedButtons = Array.from(
      document.querySelectorAll('.speed-btn[data-speed]')
    );

    for (const button of this.speedButtons) {
      button.addEventListener('click', () => {
        this.options.onSpeed(Number(button.dataset.speed));
        button.blur();
      });
    }

    // Botão compacto do mobile: alterna 1× → 2× → 4× → 1×.
    const cycle = document.getElementById('btn-speed-cycle');
    if (cycle) {
      cycle.addEventListener('click', () => {
        const speeds = [1, 2, 4];
        const next = speeds[(speeds.indexOf(this.currentSpeed) + 1) % speeds.length];
        this.options.onSpeed(next);
        cycle.blur();
      });
    }

    this.el.pauseBtn?.addEventListener('click', () => {
      this.options.onTogglePause();
      this.el.pauseBtn.blur();
    });

    document.getElementById('btn-help')?.addEventListener('click', (event) => {
      this.options.onHelp();
      event.currentTarget.blur();
    });

    document
      .getElementById('btn-build-toggle')
      ?.addEventListener('click', (event) => {
        this.options.onTogglePanel();
        event.currentTarget.blur();
      });
  }

  /**
   * Atualiza valores, barras e estatísticas. Chamado ~10x por segundo.
   * @param {import('../core/Colony.js').Colony} colony
   */
  update(colony) {
    const amounts = colony.resources.amounts;
    const caps = colony.resources.caps;
    const net = colony.rates.net;

    for (const id of RESOURCE_ORDER) {
      const def = RESOURCES[id];
      const els = this.resourceEls.get(id);
      if (!els) continue;

      const amount = amounts[id] ?? 0;
      const cap = caps[id] ?? def.cap;
      const rate = net[id] ?? 0;
      const atCap = amount >= cap - 0.01;
      const displayRate = atCap && rate > 0 ? 0 : rate;

      els.value.textContent = formatNumber(amount);
      els.rate.textContent = formatRate(displayRate);
      els.rate.className =
        'resource__rate ' +
        (displayRate > 0.05
          ? 'is-positive'
          : displayRate < -0.05
            ? 'is-negative'
            : 'is-neutral');

      els.bar.style.width = `${Math.min(100, Math.max(0, (amount / cap) * 100))}%`;
      els.root.classList.toggle('is-low', amount > 0.01 && amount < cap * 0.12);
      els.root.classList.toggle('is-empty', amount <= 0.01);
      els.root.classList.toggle('is-full', atCap);
      els.root.title = `${def.name}: ${formatNumber(amount)} / ${formatNumber(cap)} (${formatRate(rate)})`;
    }

    const sol = Math.floor(colony.elapsed / SOL_LENGTH) + 1;
    const fraction = (colony.elapsed % SOL_LENGTH) / SOL_LENGTH;
    if (this.el.solValue) this.el.solValue.textContent = `Sol ${sol}`;
    if (this.el.solTime) this.el.solTime.textContent = formatSolTime(fraction);

    if (this.el.popValue) {
      this.el.popValue.textContent = `${colony.population}/${colony.capacity}`;
    }
    if (this.el.statPop) {
      this.el.statPop.classList.toggle('is-bad', colony.population > colony.capacity);
      this.el.statPop.classList.toggle(
        'is-warn',
        colony.population === colony.capacity && colony.capacity > 0
      );
    }

    if (this.el.moraleValue) {
      this.el.moraleValue.textContent = `${Math.round(colony.happiness)}%`;
    }
    if (this.el.statMorale) {
      this.el.statMorale.classList.toggle('is-good', colony.happiness >= 70);
      this.el.statMorale.classList.toggle(
        'is-warn',
        colony.happiness >= 40 && colony.happiness < 70
      );
      this.el.statMorale.classList.toggle('is-bad', colony.happiness < 40);
    }

    this.updateAlert(colony);
  }

  updateAlert(colony) {
    const alert = colony.getCriticalAlert();
    const el = this.el.alertBanner;
    if (!el) return;

    if (!alert) {
      el.classList.remove('is-visible', 'is-warn');
      this.alertText = '';
      return;
    }

    if (alert.message !== this.alertText) {
      el.textContent = alert.message;
      this.alertText = alert.message;
    }
    el.classList.add('is-visible');
    el.classList.toggle('is-warn', alert.level === 'warn');
  }

  /** Sincroniza os botões de velocidade com o loop. */
  setSpeedState({ paused, speed }) {
    this.currentSpeed = speed;

    const cycle = document.getElementById('btn-speed-cycle');
    if (cycle) {
      cycle.textContent = `${speed}×`;
      cycle.setAttribute('aria-label', `Velocidade ${speed}× — toque para alterar`);
      cycle.classList.toggle('is-active', !paused);
    }

    if (this.el.pauseBtn) {
      this.el.pauseBtn.innerHTML = icon(paused ? 'play' : 'pause', 16);
      this.el.pauseBtn.classList.toggle('is-paused', paused);
      this.el.pauseBtn.title = paused ? 'Retomar (Espaço)' : 'Pausar (Espaço)';
      this.el.pauseBtn.setAttribute(
        'aria-label',
        paused ? 'Retomar simulação' : 'Pausar simulação'
      );
    }

    for (const button of this.speedButtons) {
      const value = Number(button.dataset.speed);
      button.classList.toggle('is-active', !paused && value === speed);
      button.setAttribute(
        'aria-pressed',
        String(!paused && value === speed)
      );
    }
  }

  flashSaved() {
    const el = this.el.saveFlash;
    if (!el) return;
    el.classList.add('is-visible');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => el.classList.remove('is-visible'), 1600);
  }
}
