/**
 * ui/Inspector.js
 * ---------------------------------------------------------------------------
 * Painel flutuante com detalhes do módulo selecionado: produção/consumo
 * efetivos, eficiência, bônus de rede, capacidade e demolição.
 */

import { BALANCE, RESOURCES } from '../config.js';
import { formatPercent, formatRate } from '../utils/format.js';
import { icon } from './icons.js';

export class Inspector {
  /**
   * @param {{ root:HTMLElement, onDemolish:(uid:string)=>void }} options
   */
  constructor({ root, onDemolish }) {
    this.root = root;
    this.onDemolish = onDemolish;
    this.uid = null;
    this.rateEls = new Map();

    this.root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'close') {
        this.hide();
      } else if (action === 'demolish' && this.uid) {
        this.onDemolish(this.uid);
      }
    });
  }

  isOpen() {
    return !this.root.hidden;
  }

  /**
   * @param {object} building
   * @param {import('../core/Colony.js').Colony} colony
   */
  show(building, colony) {
    const def = colony.getDef(building);
    if (!def) return;

    this.uid = building.uid;
    this.rateEls.clear();

    const { production, consumption } = colony.getBuildingRates(building);
    const resources = new Set([
      ...Object.keys(def.produces ?? {}),
      ...Object.keys(def.consumes ?? {}),
    ]);

    const rateRows = resources.size
      ? [...resources]
          .map((resource) => {
            const res = RESOURCES[resource];
            const net = (production[resource] ?? 0) - (consumption[resource] ?? 0);
            return `
              <div class="rate" title="${res?.name ?? resource}">
                <span class="rate__label" style="--res-color:${res?.color ?? '#a8968c'}">
                  ${icon(res?.icon ?? 'minerals', 11)}${res?.short ?? resource}
                </span>
                <span class="rate__value ${net > 0.001 ? 'is-positive' : net < -0.001 ? 'is-negative' : ''}" data-rate="${resource}">
                  ${formatRate(net)}
                </span>
              </div>
            `;
          })
          .join('')
      : '<p class="inspector__empty">Sem fluxo de recursos.</p>';

    const extras = [];
    if (def.housing) extras.push(`Tripulação <strong>+${def.housing}</strong>`);
    if (def.morale) {
      extras.push(
        `Moral <strong style="color:${def.morale > 0 ? 'var(--green)' : 'var(--red)'}">${def.morale > 0 ? '+' : ''}${def.morale}</strong>`
      );
    }
    if (def.globalBonus) {
      extras.push(`Eficiência global <strong>+${Math.round(def.globalBonus * 100)}%</strong>`);
    }
    if (def.storage) {
      const list = Object.entries(def.storage)
        .slice(0, 3)
        .map(([resource, value]) => `+${value} ${RESOURCES[resource]?.short ?? resource}`)
        .join(' · ');
      extras.push(`Estoque <strong>${list}</strong>`);
    }
    if (def.isConnector) {
      extras.push(
        `Conexões <strong data-connections>${this.countConnections(building, colony)}</strong>`
      );
    }
    if ((building.ductBonus ?? 0) > 0) {
      extras.push(
        `Bônus de dutos <strong style="color:var(--green)">+${Math.round(building.ductBonus * 100)}%</strong>`
      );
    }

    const refund = Object.entries(def.cost ?? {})
      .map(([resource, value]) => {
        const amount = Math.floor(value * BALANCE.refundRate);
        return amount > 0 ? `+${amount} ${RESOURCES[resource]?.short ?? resource}` : null;
      })
      .filter(Boolean)
      .join(' · ');

    const meta = `Módulo · ${def.footprint.w}×${def.footprint.h}${
      (building.ductBonus ?? 0) > 0
        ? ` · Rede +${Math.round(building.ductBonus * 100)}%`
        : ''
    }`;

    this.root.innerHTML = `
      <button class="icon-btn inspector__close" type="button" data-action="close" title="Fechar" aria-label="Fechar detalhes">
        ${icon('close', 14)}
      </button>

      <div class="inspector__head">
        <div class="inspector__thumb">
          <img src="${def.sprite}" alt="" draggable="false" />
        </div>
        <div class="inspector__title">
          <h3>${def.name}</h3>
          <p class="inspector__meta" data-meta>${meta}</p>
        </div>
      </div>

      <p class="inspector__desc">${def.description}</p>

      <div class="inspector__section">
        <div class="inspector__section-title">
          Fluxo de recursos
          <span class="eff-pill" data-eff>100%</span>
        </div>
        <div class="rate-grid">${rateRows}</div>
      </div>

      ${
        extras.length
          ? `<div class="inspector__section">
               <div class="inspector__section-title">Efeitos</div>
               <div class="rate-grid" style="grid-template-columns:1fr">${extras
                 .map(
                   (text) =>
                     `<div class="rate"><span class="rate__label">${text}</span></div>`
                 )
                 .join('')}</div>
             </div>`
          : ''
      }

      <div class="inspector__actions">
        <button class="btn btn--danger btn--block" type="button" data-action="demolish" title="Reembolso de 50% do custo">
          ${icon('trash', 13)} Demolir
          ${refund ? `<span style="opacity:.7;font-weight:500">· ${refund}</span>` : ''}
        </button>
      </div>
    `;

    for (const resource of resources) {
      this.rateEls.set(
        resource,
        this.root.querySelector(`[data-rate="${resource}"]`)
      );
    }

    this.root.hidden = false;
    document.body.classList.add('has-inspector');
    this.update(colony);
  }

  update(colony) {
    if (!this.uid || this.root.hidden) return;

    const building = colony.getBuildingByUid(this.uid);
    if (!building) {
      this.hide();
      return;
    }

    const def = colony.getDef(building);
    if (!def) return;

    const { production, consumption } = colony.getBuildingRates(building);
    const resources = new Set([
      ...Object.keys(def.produces ?? {}),
      ...Object.keys(def.consumes ?? {}),
    ]);

    for (const resource of resources) {
      const el = this.rateEls.get(resource);
      if (!el) continue;
      const net = (production[resource] ?? 0) - (consumption[resource] ?? 0);
      el.textContent = formatRate(net);
      el.classList.toggle('is-positive', net > 0.001);
      el.classList.toggle('is-negative', net < -0.001);
    }

    const multiplier = colony.getBuildingMultiplier(building);
    const eff = this.root.querySelector('[data-eff]');
    if (eff) {
      eff.textContent = formatPercent(multiplier);
      eff.classList.toggle('is-low', multiplier < 0.9);
      eff.title =
        multiplier < 1
          ? 'Eficiência reduzida por apagão ou moral baixo'
          : 'Eficiência da rede';
    }

    const meta = this.root.querySelector('[data-meta]');
    if (meta) {
      meta.textContent = `Módulo · ${def.footprint.w}×${def.footprint.h}${
        (building.ductBonus ?? 0) > 0
          ? ` · Rede +${Math.round(building.ductBonus * 100)}%`
          : ''
      }`;
    }

    const connections = this.root.querySelector('[data-connections]');
    if (connections) {
      connections.textContent = String(this.countConnections(building, colony));
    }
  }

  countConnections(building, colony) {
    const def = colony.getDef(building);
    if (!def) return 0;

    const neighbors = new Set();
    const { w, h } = def.footprint;

    for (let ty = building.y; ty < building.y + h; ty++) {
      for (let tx = building.x; tx < building.x + w; tx++) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx >= building.x && nx < building.x + w && ny >= building.y && ny < building.y + h) {
            continue;
          }
          const neighbor = colony.getBuildingAt(nx, ny);
          if (neighbor) neighbors.add(neighbor.uid);
        }
      }
    }

    return neighbors.size;
  }

  hide() {
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.uid = null;
    this.rateEls.clear();
    document.body.classList.remove('has-inspector');
  }
}
