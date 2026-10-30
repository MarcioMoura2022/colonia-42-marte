/**
 * core/Colony.js
 * ---------------------------------------------------------------------------
 * Coração da simulação: grade de ocupação, construção/demolição, produção,
 * consumo, eficiência da rede, moral e crescimento populacional.
 *
 * Fluxo de um tick:
 *   1. soma produção/consumo de todos os módulos
 *   2. aplica bônus de dutos + oficinas
 *   3. detecta apagão (energia zerada com saldo negativo)
 *   4. aplica eficiência (apagão + moral)
 *   5. atualiza os recursos e a população
 */

import {
  BALANCE,
  BUILDINGS,
  GRID,
  RESOURCE_ORDER,
  SAVE_VERSION,
  STARTING_HAPPINESS,
  STARTING_LAYOUT,
  STARTING_POPULATION,
} from '../config.js';
import { cellKey, clamp, forEachFootprintTile } from '../utils/iso.js';

const zeroResources = () =>
  Object.fromEntries(RESOURCE_ORDER.map((id) => [id, 0]));

const copyResources = (source) =>
  Object.fromEntries(RESOURCE_ORDER.map((id) => [id, source[id] ?? 0]));

export class Colony {
  /** @param {import('./ResourceManager.js').ResourceManager} resources */
  constructor(resources, { population = STARTING_POPULATION } = {}) {
    this.resources = resources;

    /** @type {Array<{uid:string,id:string,x:number,y:number}>} */
    this.buildings = [];
    /** @type {Map<string, object>} */
    this.occupancy = new Map();

    this.uidCounter = 1;
    this.elapsed = 0;
    this.population = population;
    this.happiness = STARTING_HAPPINESS;
    this.growthProgress = 0;

    this.capacity = 0;
    this.moraleBase = 0;
    this.workshopBonus = 0;
    this.storageBonus = zeroResources();
    this.efficiency = 1;
    this.brownout = false;

    this.rates = {
      production: zeroResources(),
      consumption: zeroResources(),
      net: zeroResources(),
    };

    /** Eventos consumidos pela camada de UI (toasts, avisos). */
    this.events = [];
    this.silent = false;
    this.offline = false;

    this._depleted = new Set();
    this._lastBrownout = false;
  }

  /* ======================================================================
     ESTRUTURA / OCUPAÇÃO
     ====================================================================== */

  getDef(building) {
    return BUILDINGS[building?.id] ?? null;
  }

  getBuildingAt(x, y) {
    return this.occupancy.get(cellKey(x, y)) ?? null;
  }

  getBuildingByUid(uid) {
    return this.buildings.find((b) => b.uid === uid) ?? null;
  }

  /** Reconstrói o mapa de ocupação a partir da lista de edifícios. */
  rebuildOccupancy() {
    this.occupancy.clear();
    for (const building of this.buildings) {
      const def = this.getDef(building);
      if (!def) continue;
      forEachFootprintTile(
        building.x,
        building.y,
        def.footprint.w,
        def.footprint.h,
        (tx, ty) => this.occupancy.set(cellKey(tx, ty), building)
      );
    }
  }

  /**
   * Recalcula capacidades, moral, armazenamento e bônus de dutos.
   * Chamado apenas quando a colônia muda (construir/demolir/carregar).
   */
  refreshInfrastructure() {
    this.rebuildOccupancy();

    let housing = 0;
    let morale = 0;
    let workshopCount = 0;
    const storage = zeroResources();

    for (const building of this.buildings) {
      const def = this.getDef(building);
      if (!def) continue;

      building.def = def;
      building.ductBonus = def.isConnector
        ? 0
        : Math.min(
            BALANCE.ductBonusCap,
            this.countAdjacentDucts(building) * BALANCE.ductBonus
          );

      housing += def.housing ?? 0;
      morale += def.morale ?? 0;
      if (def.globalBonus) workshopCount += 1;

      for (const [resource, amount] of Object.entries(def.storage ?? {})) {
        storage[resource] = (storage[resource] ?? 0) + amount;
      }
    }

    this.capacity = housing;
    this.moraleBase = morale;
    this.workshopBonus = Math.min(
      BALANCE.workshopBonusCap,
      workshopCount * BALANCE.workshopBonus
    );
    this.storageBonus = storage;

    this.resources.setCaps(storage);
  }

  /** Quantos dutos encostam no footprint deste módulo (sem repetir). */
  countAdjacentDucts(building) {
    const def = this.getDef(building);
    if (!def) return 0;

    const found = new Set();
    const { w, h } = def.footprint;

    forEachFootprintTile(building.x, building.y, w, h, (tx, ty) => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx >= building.x && nx < building.x + w && ny >= building.y && ny < building.y + h) {
          continue;
        }
        const neighbor = this.getBuildingAt(nx, ny);
        if (neighbor && neighbor.id === 'duct') found.add(neighbor.uid);
      }
    });

    return found.size;
  }

  /** O footprint encosta em algum módulo/duto já existente? */
  isConnected(x, y, w, h) {
    let connected = false;

    forEachFootprintTile(x, y, w, h, (tx, ty) => {
      if (connected) return;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx >= x && nx < x + w && ny >= y && ny < y + h) continue;
        if (this.getBuildingAt(nx, ny)) {
          connected = true;
          return;
        }
      }
    });

    return connected;
  }

  /* ======================================================================
     VALIDAÇÃO / CONSTRUÇÃO
     ====================================================================== */

  /**
   * @returns {{ok:boolean, reason?:string}}
   */
  validate(defId, x, y, { skipConnectivity = false, skipCost = false } = {}) {
    const def = BUILDINGS[defId];
    if (!def) return { ok: false, reason: 'Módulo desconhecido' };

    const { w, h } = def.footprint;

    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return { ok: false, reason: 'Posição inválida' };
    }

    if (x < 0 || y < 0 || x + w > GRID.size || y + h > GRID.size) {
      return { ok: false, reason: 'Fora do perímetro do mapa' };
    }

    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        if (this.occupancy.has(cellKey(tx, ty))) {
          return { ok: false, reason: 'Espaço ocupado' };
        }
      }
    }

    if (
      !skipConnectivity &&
      this.buildings.length > 0 &&
      !this.isConnected(x, y, w, h)
    ) {
      return { ok: false, reason: 'Sem conexão com a colônia' };
    }

    if (!skipCost && !this.resources.canAfford(def.cost)) {
      return { ok: false, reason: 'Recursos insuficientes' };
    }

    return { ok: true };
  }

  /**
   * Constrói um módulo.
   * @returns {{ok:boolean, building?:object, reason?:string}}
   */
  place(defId, x, y, { free = false } = {}) {
    const result = this.validate(defId, x, y, {
      skipConnectivity: free,
      skipCost: free,
    });

    if (!result.ok) return result;

    const def = BUILDINGS[defId];

    if (!free && !this.resources.spend(def.cost)) {
      return { ok: false, reason: 'Recursos insuficientes' };
    }

    const building = {
      uid: `b${this.uidCounter++}`,
      id: defId,
      x,
      y,
    };

    this.buildings.push(building);
    forEachFootprintTile(x, y, def.footprint.w, def.footprint.h, (tx, ty) => {
      this.occupancy.set(cellKey(tx, ty), building);
    });

    this.refreshInfrastructure();
    this.emit('build', { building, def });

    return { ok: true, building };
  }

  /**
   * Demole um módulo e devolve parte do custo.
   * @returns {{ok:boolean, refund?:object, building?:object}}
   */
  remove(uid, { refund = true } = {}) {
    const index = this.buildings.findIndex((b) => b.uid === uid);
    if (index === -1) return { ok: false };

    const [building] = this.buildings.splice(index, 1);
    const def = this.getDef(building);

    forEachFootprintTile(
      building.x,
      building.y,
      def?.footprint.w ?? 1,
      def?.footprint.h ?? 1,
      (tx, ty) => {
        const key = cellKey(tx, ty);
        if (this.occupancy.get(key)?.uid === uid) this.occupancy.delete(key);
      }
    );

    let refunded = {};
    if (refund && def) {
      refunded = this.resources.refund(def.cost, BALANCE.refundRate);
    }

    this.refreshInfrastructure();
    this.emit('demolish', { building, def, refund: refunded });

    return { ok: true, building, refund: refunded };
  }

  /* ======================================================================
     SIMULAÇÃO
     ====================================================================== */

  /**
   * Avança a colônia em dt segundos.
   * @param {number} dt
   */
  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;

    this.elapsed += dt;

    /* 1. Produção e consumo brutos ------------------------------------- */
    const production = zeroResources();
    const consumption = zeroResources();

    for (const building of this.buildings) {
      const def = this.getDef(building);
      if (!def) continue;

      const networkMultiplier =
        (1 + (building.ductBonus ?? 0)) * (1 + this.workshopBonus);

      for (const [resource, rate] of Object.entries(def.produces ?? {})) {
        production[resource] += rate * networkMultiplier;
      }
      for (const [resource, rate] of Object.entries(def.consumes ?? {})) {
        consumption[resource] += rate;
      }
    }

    /* Consumo da tripulação --------------------------------------------- */
    for (const [resource, rate] of Object.entries(BALANCE.populationConsumption)) {
      consumption[resource] += rate * this.population;
    }

    /* 2. Apagão --------------------------------------------------------- */
    const energyNet = production.energy - consumption.energy;
    const wasBrownout = this._lastBrownout;
    this.brownout = this.resources.amounts.energy <= 0.5 && energyNet < 0;

    if (this.brownout && !wasBrownout) {
      this.emit('brownout');
    } else if (!this.brownout && wasBrownout) {
      this.emit('power-restored');
    }
    this._lastBrownout = this.brownout;

    /* 3. Eficiência ----------------------------------------------------- */
    const moraleFactor =
      this.happiness < BALANCE.lowMoraleThreshold
        ? BALANCE.lowMoraleEfficiency
        : this.happiness > BALANCE.highMoraleThreshold
          ? BALANCE.highMoraleEfficiency
          : 1;

    const efficiency = (this.brownout ? BALANCE.brownoutEfficiency : 1) * moraleFactor;
    this.efficiency = efficiency;

    for (const resource of RESOURCE_ORDER) {
      production[resource] *= efficiency;
    }

    const net = zeroResources();
    for (const resource of RESOURCE_ORDER) {
      net[resource] = production[resource] - consumption[resource];
    }

    this.rates = { production, consumption, net };

    /* 4. Recursos ------------------------------------------------------- */
    this.resources.setRates(production, consumption);
    this.resources.update(dt);

    /* Eventos de escassez ----------------------------------------------- */
    for (const resource of RESOURCE_ORDER) {
      const amount = this.resources.amounts[resource];
      if (amount <= 0.01 && !this._depleted.has(resource)) {
        this._depleted.add(resource);
        this.emit('depleted', { resource });
      } else if (amount > 0.01) {
        this._depleted.delete(resource);
      }
    }

    /* 5. Moral ---------------------------------------------------------- */
    const target = this.computeMoraleTarget(net);
    this.happiness = clamp(
      this.happiness + (target - this.happiness) * Math.min(1, dt * 0.4),
      0,
      100
    );

    /* 6. População ------------------------------------------------------ */
    this.updatePopulation(dt);
  }

  computeMoraleTarget(net) {
    let target = 55 + this.moraleBase;

    const overCapacity = Math.max(0, this.population - this.capacity);
    target -= overCapacity * 10;

    const amounts = this.resources.amounts;
    const caps = this.resources.caps;

    if (amounts.oxygen <= 0.01) target -= 40;
    else if (net.oxygen < 0 && amounts.oxygen < caps.oxygen * 0.1) target -= 8;

    if (amounts.water <= 0.01) target -= 25;
    else if (net.water < 0 && amounts.water < caps.water * 0.1) target -= 6;

    if (amounts.food <= 0.01) target -= 35;
    else if (net.food < 0 && amounts.food < caps.food * 0.1) target -= 8;

    if (this.brownout) target -= 15;
    if (amounts.energy <= 0.01) target -= 8;
    if (this.population === 0) target -= 20;

    return clamp(target, 0, 100);
  }

  updatePopulation(dt) {
    const amounts = this.resources.amounts;
    const starving = amounts.food <= 0.01 || amounts.oxygen <= 0.01;

    const canGrow =
      this.population < this.capacity &&
      this.happiness >= BALANCE.growthMinMorale &&
      amounts.food > 2 &&
      amounts.oxygen > 2 &&
      amounts.water > 2;

    if (canGrow) {
      const rate =
        BALANCE.growthBase + this.happiness * BALANCE.growthPerMorale;
      this.growthProgress += dt * rate;

      while (this.growthProgress >= 1 && this.population < this.capacity) {
        this.growthProgress -= 1;
        this.population += 1;
        this.emit('colonist', { population: this.population });
      }

      // Se a capacidade está cheia, segura o progresso perto de 1 para que
      // um novo dormitório gere um colono rapidamente.
      this.growthProgress = Math.min(this.growthProgress, 0.999);
      return;
    }

    if (starving) {
      // Durante o progresso offline a tripulação não morre: seria punitivo
      // demais voltar e encontrar a colônia dizimada. Os recursos ainda caem,
      // e a decadência começa assim que o jogador retorna.
      if (this.offline) {
        this.growthProgress = 0;
        return;
      }

      this.growthProgress -= dt * BALANCE.declineRate;
      if (this.growthProgress <= -1) {
        this.growthProgress = 0;
        if (this.population > 1) {
          this.population -= 1;
          this.emit('colonist-lost', { population: this.population });
        }
      }
      return;
    }

    // Situação estável, mas sem condições de crescer: esfria o progresso.
    this.growthProgress = Math.max(0, this.growthProgress - dt * 0.05);
  }

  /** Simulação em blocos para o progresso offline. */
  simulate(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;

    const wasSilent = this.silent;
    const wasOffline = this.offline;
    this.silent = true;
    this.offline = true;

    const stepCount = Math.max(1, Math.ceil(seconds / 2));
    const step = seconds / stepCount;

    for (let i = 0; i < stepCount; i++) {
      this.update(step);
    }

    this.silent = wasSilent;
    this.offline = wasOffline;
  }

  /* ======================================================================
     CONSULTAS PARA A UI
     ====================================================================== */

  /** Multiplicador real aplicado à produção de um módulo. */
  getBuildingMultiplier(building) {
    return (
      (1 + (building.ductBonus ?? 0)) *
      (1 + this.workshopBonus) *
      this.efficiency
    );
  }

  /** Produção/consumo efetivos de um módulo, para o inspetor. */
  getBuildingRates(building) {
    const def = this.getDef(building);
    if (!def) return { production: {}, consumption: {} };

    const multiplier = this.getBuildingMultiplier(building);
    const production = {};
    const consumption = {};

    for (const [resource, rate] of Object.entries(def.produces ?? {})) {
      production[resource] = rate * multiplier;
    }
    for (const [resource, rate] of Object.entries(def.consumes ?? {})) {
      consumption[resource] = rate;
    }

    return { production, consumption };
  }

  /** Resumo do problema mais crítico, usado pelo banner de aviso. */
  getCriticalAlert() {
    const a = this.resources.amounts;

    if (a.oxygen <= 0.01) {
      return { level: 'critical', message: 'Oxigênio esgotado — a tripulação está em perigo' };
    }
    if (a.food <= 0.01) {
      return { level: 'critical', message: 'Alimentos esgotados — construa uma estufa' };
    }
    if (a.water <= 0.01) {
      return { level: 'critical', message: 'Água esgotada — construa um extrator' };
    }
    if (this.brownout) {
      return { level: 'critical', message: 'APAGÃO — energia insuficiente, produção reduzida' };
    }
    if (this.population > this.capacity) {
      return {
        level: 'warn',
        message: `Superlotação — ${this.population} tripulantes para ${this.capacity} vagas`,
      };
    }
    if (a.energy < this.resources.caps.energy * 0.08) {
      return { level: 'warn', message: 'Reserva de energia baixa' };
    }
    return null;
  }

  /* ======================================================================
     EVENTOS
     ====================================================================== */

  emit(type, payload = {}) {
    if (this.silent) return;
    this.events.push({ type, ...payload });
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  /* ======================================================================
     SAVE / LOAD / NOVO JOGO
     ====================================================================== */

  serialize() {
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      elapsed: this.elapsed,
      population: this.population,
      happiness: this.happiness,
      growthProgress: this.growthProgress,
      uidCounter: this.uidCounter,
      resources: this.resources.serialize(),
      buildings: this.buildings.map((b) => ({ id: b.id, x: b.x, y: b.y })),
    };
  }

  /**
   * Restaura um save. Retorna false se não houver nenhum edifício válido.
   * @param {object} data
   */
  deserialize(data) {
    if (!data || typeof data !== 'object') return false;

    this.buildings = [];
    this.occupancy.clear();
    this.uidCounter = 1;

    this.elapsed = Number.isFinite(data.elapsed) ? Math.max(0, data.elapsed) : 0;
    this.population = Number.isFinite(data.population)
      ? Math.max(1, Math.floor(data.population))
      : STARTING_POPULATION;
    this.happiness = Number.isFinite(data.happiness)
      ? clamp(data.happiness, 0, 100)
      : STARTING_HAPPINESS;
    this.growthProgress = Number.isFinite(data.growthProgress)
      ? clamp(data.growthProgress, -1, 1)
      : 0;

    for (const raw of Array.isArray(data.buildings) ? data.buildings : []) {
      const def = BUILDINGS[raw?.id];
      if (!def) continue;

      const x = Number(raw.x);
      const y = Number(raw.y);
      if (!Number.isInteger(x) || !Number.isInteger(y)) continue;

      const { w, h } = def.footprint;
      if (x < 0 || y < 0 || x + w > GRID.size || y + h > GRID.size) continue;

      let overlaps = false;
      forEachFootprintTile(x, y, w, h, (tx, ty) => {
        if (this.occupancy.has(cellKey(tx, ty))) overlaps = true;
      });
      if (overlaps) continue;

      const building = {
        uid: `b${this.uidCounter++}`,
        id: raw.id,
        x,
        y,
      };
      this.buildings.push(building);
      forEachFootprintTile(x, y, w, h, (tx, ty) => {
        this.occupancy.set(cellKey(tx, ty), building);
      });
    }

    if (this.buildings.length === 0) return false;

    this.uidCounter = Math.max(
      Number.isFinite(data.uidCounter) ? data.uidCounter : 1,
      this.uidCounter
    );

    // Os armazéns precisam existir antes de restaurar as quantidades, para
    // que o limite de estoque já contemple o bônus deles.
    this.refreshInfrastructure();
    this.resources.deserialize(data.resources ?? {});
    this.resources.setCaps(this.storageBonus);

    if (this.population > this.capacity) {
      // Mantém a tripulação, mas ela ficará superlotada até novos dormitórios.
      this.population = Math.max(1, this.population);
    }

    this._lastBrownout = false;
    this.brownout = false;
    this.events = [];

    return true;
  }

  /** Cria o layout inicial (módulo de pouso + painel solar). */
  seedStartingColony() {
    this.buildings = [];
    this.occupancy.clear();
    this.uidCounter = 1;
    this.elapsed = 0;
    this.population = STARTING_POPULATION;
    this.happiness = STARTING_HAPPINESS;
    this.growthProgress = 0;
    this.silent = true;

    for (const entry of STARTING_LAYOUT) {
      this.place(entry.id, entry.x, entry.y, { free: true });
    }

    this.silent = false;
    this.events = [];
    this.refreshInfrastructure();
  }
}
