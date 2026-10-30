/**
 * config.js
 * ---------------------------------------------------------------------------
 * Todo o "design data" do jogo fica aqui: grade, recursos, edifícios,
 * custos, produção, consumo, capacidade e constantes de balanceamento.
 *
 * Para adicionar um novo módulo:
 *   1. Coloque o PNG em assets/buildings/.
 *   2. Adicione uma entrada em BUILDINGS.
 *   3. (Opcional) ajuste spriteScale / anchor para encaixar no tile.
 *
 * Nada neste arquivo depende do DOM ou do canvas — ele é a fonte única de
 * verdade usada pela simulação, pelo HUD e pelo renderizador.
 */

/* --------------------------------------------------------------------------
   GRADE ISOMÉTRICA
   -------------------------------------------------------------------------- */
export const GRID = Object.freeze({
  size: 24,       // 24 × 24 tiles
  tileW: 128,     // largura do losango em px (mundo)
  tileH: 64,      // altura do losango em px (mundo)
});

/** Segundos que um "sol" marciano leva no relógio decorativo do HUD. */
export const SOL_LENGTH = 300;

/** Chave usada no localStorage. Mude a versão para invalidar saves antigos. */
export const SAVE_KEY = 'colonia42.save.v1';
export const SAVE_VERSION = 1;

/* --------------------------------------------------------------------------
   RECURSOS
   icon  -> nome do ícone em js/ui/icons.js
   start -> quantidade inicial em um novo jogo
   cap   -> capacidade base (armazéns aumentam)
   -------------------------------------------------------------------------- */
export const RESOURCES = Object.freeze({
  oxygen: {
    id: 'oxygen',
    name: 'Oxigênio',
    short: 'O₂',
    icon: 'oxygen',
    color: '#67e8f9',
    start: 150,
    cap: 500,
    description: 'Consumido pela tripulação e pelos módulos pressurizados.',
  },
  water: {
    id: 'water',
    name: 'Água',
    short: 'H₂O',
    icon: 'water',
    color: '#38bdf8',
    start: 120,
    cap: 400,
    description: 'Essencial para beber, cultivar alimentos e gerar oxigênio.',
  },
  energy: {
    id: 'energy',
    name: 'Energia',
    short: 'kW',
    icon: 'energy',
    color: '#fbbf24',
    start: 220,
    cap: 600,
    description: 'Mantém os módulos funcionando. Sem energia, a colônia entra em apagão.',
  },
  food: {
    id: 'food',
    name: 'Alimentos',
    short: 'kcal',
    icon: 'food',
    color: '#a3e635',
    start: 100,
    cap: 350,
    description: 'Produzido nas estufas e consumido pela tripulação.',
  },
  minerals: {
    id: 'minerals',
    name: 'Minérios',
    short: 't',
    icon: 'minerals',
    color: '#c084fc',
    start: 260,
    cap: 600,
    description: 'Material de construção extraído pela mina.',
  },
});

export const RESOURCE_ORDER = Object.freeze([
  'oxygen',
  'water',
  'energy',
  'food',
  'minerals',
]);

/* --------------------------------------------------------------------------
   CATEGORIAS DO MENU
   -------------------------------------------------------------------------- */
export const CATEGORIES = Object.freeze([
  { id: 'all', label: 'Todos' },
  { id: 'support', label: 'Suporte vital' },
  { id: 'housing', label: 'Habitação' },
  { id: 'production', label: 'Produção' },
  { id: 'logistics', label: 'Logística' },
]);

/* --------------------------------------------------------------------------
   EDIFÍCIOS
   --------------------------------------------------------------------------
   footprint  { w, h } em tiles
   cost       recursos pagos na construção
   produces   recurso por segundo (antes dos multiplicadores)
   consumes   recurso por segundo
   housing    tripulantes que o módulo abriga
   morale     bônus/malus de moral
   storage    capacidade extra de armazenamento
   globalBonus +5% de eficiência global por oficina (acumulativo, com teto)
   -------------------------------------------------------------------------- */
export const BUILDINGS = Object.freeze({
  habitat: {
    id: 'habitat',
    name: 'Habitat',
    category: 'support',
    sprite: 'assets/buildings/habitat.png',
    footprint: { w: 2, h: 2 },
    cost: { minerals: 80, energy: 25 },
    produces: {},
    consumes: { oxygen: 0.12, water: 0.12, energy: 0.25 },
    housing: 6,
    morale: 6,
    description:
      'Núcleo habitacional pressurizado. Abriga 6 colonos e serve de ponto de partida para a rede.',
    spriteScale: 1,
    anchor: 0.96,
  },

  'oxygen-generator': {
    id: 'oxygen-generator',
    name: 'Gerador de Oxigênio',
    category: 'support',
    sprite: 'assets/buildings/oxygen-generator.png',
    footprint: { w: 2, h: 2 },
    cost: { minerals: 55, energy: 20 },
    produces: { oxygen: 1.4 },
    consumes: { water: 0.3, energy: 1.1 },
    morale: 0,
    description:
      'Separa o CO₂ da atmosfera marciana e gera oxigênio respirável para toda a colônia.',
    spriteScale: 0.98,
    anchor: 0.96,
  },

  'water-extractor': {
    id: 'water-extractor',
    name: 'Extrator de Água',
    category: 'support',
    sprite: 'assets/buildings/water-extractor.png',
    footprint: { w: 2, h: 2 },
    cost: { minerals: 55, energy: 20 },
    produces: { water: 1.3 },
    consumes: { energy: 1.3 },
    morale: 0,
    description:
      'Perfura o permafrost e derrete o gelo subterrâneo para abastecer a colônia.',
    spriteScale: 1,
    anchor: 0.96,
  },

  'solar-panel': {
    id: 'solar-panel',
    name: 'Painéis Solares',
    category: 'support',
    sprite: 'assets/buildings/solar-panel.png',
    footprint: { w: 2, h: 2 },
    cost: { minerals: 45 },
    produces: { energy: 2.4 },
    consumes: {},
    morale: 0,
    description:
      'Converte a luz do Sol marciano em energia elétrica limpa e silenciosa.',
    spriteScale: 1.04,
    anchor: 0.96,
  },

  duct: {
    id: 'duct',
    name: 'Dutos',
    category: 'logistics',
    sprite: 'assets/buildings/duct.png',
    footprint: { w: 1, h: 1 },
    cost: { minerals: 5 },
    produces: {},
    consumes: {},
    morale: 0,
    description:
      'Conectores de rede. Cada duto adjacente a um módulo concede +3% de eficiência (máx. +15%).',
    spriteScale: 1,
    anchor: 0.4,
    isConnector: true,
  },

  dormitory: {
    id: 'dormitory',
    name: 'Dormitórios',
    category: 'housing',
    sprite: 'assets/buildings/dormitory.png',
    footprint: { w: 2, h: 2 },
    cost: { minerals: 100, energy: 30 },
    produces: {},
    consumes: { oxygen: 0.2, water: 0.25, energy: 0.3, food: 0.08 },
    housing: 10,
    morale: 8,
    description:
      'Alojamento individual para 10 colonos. Dormir bem mantém o moral elevado.',
    spriteScale: 1,
    anchor: 0.96,
  },

  cafeteria: {
    id: 'cafeteria',
    name: 'Refeitório',
    category: 'housing',
    sprite: 'assets/buildings/cafeteria.png',
    footprint: { w: 2, h: 2 },
    cost: { minerals: 90, energy: 25 },
    produces: {},
    consumes: { food: 0.9, water: 0.35, energy: 0.6 },
    morale: 14,
    description:
      'Cozinha e refeitório comunitário. Distribui refeições quentes e eleva bastante o moral.',
    spriteScale: 1,
    anchor: 0.96,
  },

  greenhouse: {
    id: 'greenhouse',
    name: 'Estufa',
    category: 'production',
    sprite: 'assets/buildings/greenhouse.png',
    footprint: { w: 2, h: 2 },
    cost: { minerals: 70, energy: 20 },
    produces: { food: 1.5 },
    consumes: { water: 0.7, energy: 0.7 },
    morale: 4,
    description:
      'Cultivo hidropônico sob domo. Produz alimentos frescos e deixa a colônia mais verde.',
    spriteScale: 1,
    anchor: 0.96,
  },

  warehouse: {
    id: 'warehouse',
    name: 'Armazém',
    category: 'logistics',
    sprite: 'assets/buildings/warehouse.png',
    footprint: { w: 2, h: 2 },
    cost: { minerals: 60, energy: 15 },
    produces: {},
    consumes: {},
    storage: { oxygen: 150, water: 150, energy: 100, food: 150, minerals: 250 },
    morale: 0,
    description:
      'Amplia a capacidade de estocagem de todos os recursos. Evita desperdício em picos de produção.',
    spriteScale: 1,
    anchor: 0.96,
  },

  factory: {
    id: 'factory',
    name: 'Fábrica',
    category: 'production',
    sprite: 'assets/buildings/factory.png',
    footprint: { w: 2, h: 2 },
    cost: { minerals: 110, energy: 35 },
    produces: { energy: 2.6 },
    consumes: { minerals: 0.55, water: 0.1 },
    morale: -2,
    description:
      'Células de combustível: processa minérios em energia estável, independente do clima.',
    spriteScale: 1,
    anchor: 0.96,
  },

  mine: {
    id: 'mine',
    name: 'Mina',
    category: 'production',
    sprite: 'assets/buildings/mine.png',
    footprint: { w: 2, h: 2 },
    cost: { minerals: 75, energy: 25 },
    produces: { minerals: 1.6 },
    consumes: { energy: 1.1, water: 0.15 },
    morale: -3,
    description:
      'Escava o solo marciano em busca de minérios para novas construções e para a fábrica.',
    spriteScale: 1.04,
    anchor: 0.96,
  },

  workshop: {
    id: 'workshop',
    name: 'Oficina',
    category: 'production',
    sprite: 'assets/buildings/workshop.png',
    footprint: { w: 2, h: 2 },
    cost: { minerals: 95, energy: 30 },
    produces: {},
    consumes: { energy: 0.8, minerals: 0.15 },
    morale: 2,
    globalBonus: 0.05,
    description:
      'Manutenção preventiva e reparos. Cada oficina concede +5% de eficiência global (máx. +25%).',
    spriteScale: 1,
    anchor: 0.96,
  },
});

/** Lista na ordem em que aparece no menu lateral. */
export const BUILDING_ORDER = Object.freeze([
  'habitat',
  'oxygen-generator',
  'water-extractor',
  'solar-panel',
  'duct',
  'dormitory',
  'cafeteria',
  'greenhouse',
  'warehouse',
  'factory',
  'mine',
  'workshop',
]);

export const BUILDING_LIST = Object.freeze(
  BUILDING_ORDER.map((id) => BUILDINGS[id])
);

/* --------------------------------------------------------------------------
   BALANCEAMENTO
   -------------------------------------------------------------------------- */
export const BALANCE = Object.freeze({
  /** Consumo por colono, por segundo. */
  populationConsumption: Object.freeze({
    oxygen: 0.03,
    water: 0.035,
    food: 0.045,
  }),

  /** Crescimento populacional (1 colono a cada ~1/rate segundos). */
  growthBase: 0.006,
  growthPerMorale: 0.00012,
  growthMinMorale: 45,
  declineRate: 0.01,

  /** Multiplicadores de eficiência. */
  brownoutEfficiency: 0.55,
  lowMoraleEfficiency: 0.85,
  highMoraleEfficiency: 1.05,
  lowMoraleThreshold: 30,
  highMoraleThreshold: 75,

  /** Bônus de rede. */
  ductBonus: 0.03,
  ductBonusCap: 0.15,
  workshopBonus: 0.05,
  workshopBonusCap: 0.25,

  /** Reembolso ao demolir. */
  refundRate: 0.5,

  /** Progresso offline. */
  offlineCapSeconds: 8 * 60 * 60,
  offlineEfficiency: 0.5,
});

/* --------------------------------------------------------------------------
   ESTADO INICIAL
   -------------------------------------------------------------------------- */
export const STARTING_POPULATION = 4;
export const STARTING_HAPPINESS = 62;

/**
 * Módulos pré-instalados no primeiro jogo: módulo de pouso, dois trechos de
 * duto e o painel solar. A posição é o canto superior do footprint.
 */
export const STARTING_LAYOUT = Object.freeze([
  { id: 'habitat', x: 11, y: 11 },
  { id: 'duct', x: 13, y: 11 },
  { id: 'duct', x: 14, y: 11 },
  { id: 'solar-panel', x: 15, y: 11 },
]);

/* --------------------------------------------------------------------------
   HELPERS
   -------------------------------------------------------------------------- */
export const getBuilding = (id) => BUILDINGS[id] ?? null;

/** Custo total de um edifício em um formato fácil de percorrer. */
export function costEntries(def) {
  return Object.entries(def.cost ?? {});
}
