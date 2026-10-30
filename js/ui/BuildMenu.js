/**
 * ui/BuildMenu.js
 * ---------------------------------------------------------------------------
 * Painel lateral de construção. Gera os cards a partir de BUILDING_LIST e
 * permite filtrar por categoria.
 *
 * O callback onSelect retorna true quando o módulo foi selecionado; no mobile,
 * isso fecha o painel para liberar o mapa.
 */

import { BUILDING_LIST, BUILDINGS, CATEGORIES, RESOURCES } from '../config.js';
import { formatCost } from '../utils/format.js';
import { icon } from './icons.js';

export class BuildMenu {
  /**
   * @param {{
   *   panel: HTMLElement,
   *   list: HTMLElement,
   *   filter: HTMLElement,
   *   scrim: HTMLElement,
   *   closeButton: HTMLElement,
   *   onSelect: (def:object)=>boolean,
   *   onToggle?: (open:boolean)=>void,
   * }} options
   */
  constructor(options) {
    this.options = options;
    this.category = 'all';
    this.selectedId = null;
    this.cards = new Map();

    this.options.filter.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-category]');
      if (!chip) return;
      this.setCategory(chip.dataset.category);
      chip.blur();
    });

    this.options.list.addEventListener('click', (event) => {
      const card = event.target.closest('.build-card');
      if (!card) return;
      const def = BUILDINGS[card.dataset.id];
      if (!def) return;

      const accepted = this.options.onSelect(def);
      card.blur();
      if (accepted && window.innerWidth <= 700) this.close();
    });

    this.options.closeButton.addEventListener('click', () => this.close());
    this.options.scrim.addEventListener('click', () => this.close());

    window.addEventListener('resize', () => this.syncScrim());
  }

  mount() {
    this.renderFilters();
    this.renderList();
    this.syncScrim();

    if (window.innerWidth <= 700) this.close();
    else this.open();
  }

  renderFilters() {
    this.options.filter.innerHTML = CATEGORIES.map(
      (category) => `
        <button
          class="category-chip${category.id === this.category ? ' is-active' : ''}"
          type="button"
          role="tab"
          aria-selected="${category.id === this.category}"
          data-category="${category.id}"
        >${category.label}</button>
      `
    ).join('');
  }

  setCategory(category) {
    this.category = category;

    for (const chip of this.options.filter.querySelectorAll('[data-category]')) {
      const active = chip.dataset.category === category;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-selected', String(active));
    }

    this.renderList();
  }

  renderList() {
    const defs =
      this.category === 'all'
        ? BUILDING_LIST
        : BUILDING_LIST.filter((def) => def.category === this.category);

    this.options.list.innerHTML = defs.map((def) => this.cardMarkup(def)).join('');
    this.cards.clear();

    for (const card of this.options.list.querySelectorAll('.build-card')) {
      this.cards.set(card.dataset.id, card);
    }

    this.setSelected(this.selectedId);
  }

  cardMarkup(def) {
    const size = `${def.footprint.w}×${def.footprint.h}`;
    const costs = Object.entries(def.cost ?? {})
      .map(([resource, value]) => {
        const res = RESOURCES[resource];
        return `
          <span class="cost-chip" data-cost="${resource}" title="${res?.name ?? resource}">
            ${icon(res?.icon ?? 'minerals', 9)}${formatCost(value)}
          </span>
        `;
      })
      .join('');

    return `
      <button
        class="build-card"
        type="button"
        data-id="${def.id}"
        aria-pressed="false"
        title="${def.description}"
      >
        <span class="build-card__thumb">
          <img src="${def.sprite}" alt="" draggable="false" />
        </span>
        <span class="build-card__body">
          <span class="build-card__title-row">
            <span class="build-card__name">${def.name}</span>
            <span class="build-card__size">${size}</span>
          </span>
          <span class="build-card__effect">${this.effectText(def)}</span>
          <span class="build-card__cost">${costs}</span>
        </span>
      </button>
    `;
  }

  /** Resumo curto dos efeitos para caber no card. */
  effectText(def) {
    const parts = [];

    if (def.housing) parts.push(`+${def.housing} tripulantes`);
    if (def.globalBonus) {
      parts.push(`+${Math.round(def.globalBonus * 100)}% eficiência global`);
    }
    if (def.isConnector) parts.push('+3% por duto adjacente');
    if (def.storage) {
      const total = Math.max(...Object.values(def.storage));
      parts.push(`+${total} capacidade`);
    }

    for (const [resource, rate] of Object.entries(def.produces ?? {})) {
      const res = RESOURCES[resource];
      parts.push(`+${rate.toFixed(1)} ${res?.short ?? resource}/s`);
    }

    if (def.morale && parts.length < 2) {
      parts.push(`${def.morale > 0 ? '+' : ''}${def.morale} moral`);
    }

    if (parts.length === 0) {
      for (const [resource, rate] of Object.entries(def.consumes ?? {})) {
        const res = RESOURCES[resource];
        parts.push(`−${rate.toFixed(1)} ${res?.short ?? resource}/s`);
      }
    }

    return parts.slice(0, 2).join(' · ');
  }

  /** Marca módulos que o jogador ainda não pode pagar. */
  update(resources) {
    for (const [id, card] of this.cards) {
      const def = BUILDINGS[id];
      if (!def) continue;

      let affordable = true;
      for (const [resource, value] of Object.entries(def.cost ?? {})) {
        const has = (resources.amounts[resource] ?? 0) >= value;
        if (!has) affordable = false;

        const chip = card.querySelector(`[data-cost="${resource}"]`);
        chip?.classList.toggle('is-missing', !has);
      }

      card.classList.toggle('is-locked', !affordable);
    }
  }

  setSelected(id) {
    this.selectedId = id;

    for (const [cardId, card] of this.cards) {
      const selected = cardId === id;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    }
  }

  /* ======================================================================
     ABRIR / FECHAR
     ====================================================================== */

  isOpen() {
    return this.options.panel.classList.contains('is-open');
  }

  open() {
    this.options.panel.classList.add('is-open');
    document.body.classList.add('panel-open');
    this.syncScrim();
    this.options.onToggle?.(true);
  }

  close() {
    this.options.panel.classList.remove('is-open');
    document.body.classList.remove('panel-open');
    this.options.scrim.hidden = true;
    this.options.onToggle?.(false);
  }

  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  }

  syncScrim() {
    const mobile = window.innerWidth <= 700;
    this.options.scrim.hidden = !(mobile && this.isOpen());
  }
}
