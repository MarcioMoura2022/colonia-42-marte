/**
 * Smoke test de interface com Playwright.
 * Uso:
 *   npx --yes -p playwright node tools/smoke-test.mjs
 * Requer o servidor local rodando em http://127.0.0.1:8080.
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE_URL = process.env.GAME_URL ?? 'http://127.0.0.1:8080/';
const OUT_DIR = 'docs';

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});

const messages = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    messages.push(`[${msg.type()}] ${msg.text()}`);
  }
});
page.on('pageerror', (error) => messages.push(`[pageerror] ${error.message}`));

/** Captura sem notificações temporárias cobrindo o mapa. */
async function capture(name) {
  await page.waitForTimeout(350);
  await page.evaluate(() => window.__colonia42?.toast.clear());
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT_DIR}/${name}` });
}

await page.goto(BASE_URL, { waitUntil: 'networkidle' });
await page.waitForFunction(
  () => window.__colonia42 && !document.getElementById('loading'),
  null,
  { timeout: 30000 }
);
await page.waitForTimeout(1200);

const initial = await page.evaluate(() => {
  const game = window.__colonia42;
  return {
    buildings: game.colony.buildings.map((b) => ({ id: b.id, x: b.x, y: b.y })),
    population: game.colony.population,
    capacity: game.colony.capacity,
    resources: { ...game.colony.resources.amounts },
    rates: { ...game.colony.rates.net },
    speed: game.loop.speed,
  };
});
console.log('INITIAL', JSON.stringify(initial, null, 2));

await capture('screenshot-01-map.png');

// Seleciona o gerador de oxigênio e posiciona ao lado do painel solar.
await page.click('[data-id="oxygen-generator"]');
await page.waitForTimeout(350);

// Centro do tile (16,14). O fantasma de um módulo 2×2 é centralizado no
// cursor, então o canto superior ficará em (15,13), encostado no painel solar.
const target = await page.evaluate(() => {
  const { camera } = window.__colonia42;
  const tileX = 16;
  const tileY = 14;
  const wx = (tileX - tileY) * 64;
  const wy = (tileX + tileY + 1) * 32;
  return camera.worldToScreen(wx, wy);
});

await page.mouse.move(target.x, target.y);
await page.waitForTimeout(400);
await capture('screenshot-02-placement.png');

const ghostState = await page.evaluate(() => {
  const p = window.__colonia42.colony;
  return {
    placementHint: document.querySelector('[data-hint]')?.textContent,
    resources: { ...p.resources.amounts },
  };
});
console.log('GHOST', JSON.stringify(ghostState, null, 2));

if (!/Clique no mapa/.test(ghostState.placementHint ?? '')) {
  throw new Error(`Posicionamento deveria ser válido: ${ghostState.placementHint}`);
}

await page.mouse.click(target.x, target.y);
await page.waitForTimeout(700);
await capture('screenshot-03-built.png');

const afterBuild = await page.evaluate(() => {
  const game = window.__colonia42;
  return {
    buildings: game.colony.buildings.map((b) => ({ id: b.id, x: b.x, y: b.y })),
    capacity: game.colony.capacity,
    rates: { ...game.colony.rates.net },
    placementOpen: !document.getElementById('placement-bar').hidden,
  };
});
console.log('AFTER BUILD', JSON.stringify(afterBuild, null, 2));

if (afterBuild.buildings.length !== 5) {
  throw new Error(`Esperava 5 módulos após construir, encontrei ${afterBuild.buildings.length}`);
}
if (afterBuild.placementOpen) {
  throw new Error('A barra de posicionamento deveria fechar após construir.');
}

// Seleciona o módulo recém-construído para abrir o inspetor.
await page.mouse.click(target.x, target.y);
await page.waitForTimeout(500);
await capture('screenshot-04-inspector.png');

const inspectorState = await page.evaluate(() => {
  const root = document.getElementById('inspector');
  return {
    open: !root.hidden,
    title: root.querySelector('h3')?.textContent ?? null,
    efficiency: root.querySelector('[data-eff]')?.textContent ?? null,
  };
});
console.log('INSPECTOR', JSON.stringify(inspectorState, null, 2));

if (!inspectorState.open || !inspectorState.title) {
  throw new Error('O inspetor deveria abrir ao clicar no módulo recém-construído.');
}

// Pausa e velocidade.
await page.click('#btn-pause');
const paused = await page.evaluate(() => window.__colonia42.loop.isPaused);
await page.click('#btn-pause');
await page.click('[data-speed="4"]');
const speed = await page.evaluate(() => window.__colonia42.loop.speed);

// Save manual.
const saved = await page.evaluate(() => window.__colonia42.saveNow());
console.log('CONTROLS', JSON.stringify({ paused, speed, saved }));

console.log('MESSAGES', messages.length ? messages : 'none');
await browser.close();
