/**
 * core/ResourceManager.js
 * ---------------------------------------------------------------------------
 * Guarda as quantidades, os limites de armazenamento e as taxas atuais.
 * A simulação em si (quem produz/consome o quê) fica em Colony.js; aqui só
 * mora o estado dos cinco recursos e as operações de custo/reembolso.
 */

export class ResourceManager {
  /** @param {Record<string, {start:number, cap:number}>} definitions */
  constructor(definitions) {
    this.definitions = definitions;
    this.amounts = {};
    this.caps = {};
    this.production = {};
    this.consumption = {};
    this.net = {};

    for (const [id, def] of Object.entries(definitions)) {
      this.amounts[id] = def.start;
      this.caps[id] = def.cap;
      this.production[id] = 0;
      this.consumption[id] = 0;
      this.net[id] = 0;
    }
  }

  /**
   * Recalcula os limites com o bônus de armazéns.
   * @param {Record<string, number>} bonus
   */
  setCaps(bonus = {}) {
    for (const [id, def] of Object.entries(this.definitions)) {
      this.caps[id] = def.cap + (bonus[id] ?? 0);
      this.amounts[id] = Math.min(this.amounts[id], this.caps[id]);
    }
  }

  /** Define as taxas por segundo (produção e consumo já calculados). */
  setRates(production, consumption) {
    for (const id of Object.keys(this.definitions)) {
      const prod = production[id] ?? 0;
      const cons = consumption[id] ?? 0;
      this.production[id] = prod;
      this.consumption[id] = cons;
      this.net[id] = prod - cons;
    }
  }

  /** Avança os recursos em dt segundos, respeitando 0 e o limite de estoque. */
  update(dt) {
    if (dt <= 0) return;
    for (const id of Object.keys(this.definitions)) {
      const cap = this.caps[id];
      const next = this.amounts[id] + this.net[id] * dt;
      this.amounts[id] = Math.min(cap, Math.max(0, next));
    }
  }

  canAfford(cost = {}) {
    return Object.entries(cost).every(
      ([id, value]) => (this.amounts[id] ?? 0) >= value
    );
  }

  /** Retorna os recursos que faltam para pagar um custo. */
  missingFor(cost = {}) {
    const missing = {};
    for (const [id, value] of Object.entries(cost)) {
      const diff = value - (this.amounts[id] ?? 0);
      if (diff > 0) missing[id] = diff;
    }
    return missing;
  }

  spend(cost = {}) {
    if (!this.canAfford(cost)) return false;
    for (const [id, value] of Object.entries(cost)) {
      this.amounts[id] -= value;
    }
    return true;
  }

  /** Devolve uma fração do custo (usado ao demolir). */
  refund(cost = {}, rate = 0.5) {
    const refunded = {};
    for (const [id, value] of Object.entries(cost)) {
      const amount = Math.floor(value * rate);
      if (amount <= 0) continue;
      this.amounts[id] = Math.min(
        this.caps[id],
        (this.amounts[id] ?? 0) + amount
      );
      refunded[id] = amount;
    }
    return refunded;
  }

  /** Fotografia das quantidades, usada para relatórios offline. */
  snapshot() {
    return { ...this.amounts };
  }

  serialize() {
    return { ...this.amounts };
  }

  deserialize(data = {}) {
    for (const id of Object.keys(this.definitions)) {
      const value = Number(data[id]);
      if (Number.isFinite(value)) {
        this.amounts[id] = Math.min(this.caps[id], Math.max(0, value));
      }
    }
  }
}
