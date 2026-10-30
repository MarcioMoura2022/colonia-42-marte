# Arquitetura técnica — Colônia 42 · Marte

> Documento de handoff do projeto. Descreve stack, arquitetura, modelo de
> simulação, renderização, assets, persistência, testes, decisões e dívidas
> técnicas. Serve como contexto para outra pessoa ou IA continuar o trabalho.

- **Repositório:** <https://github.com/MarcioMoura2022/colonia-42-marte>
- **Demo:** <https://marciomoura2022.github.io/colonia-42-marte/>
- **Branch principal:** `master`

---

## 1. Visão geral

**Colônia 42** é um jogo idle de gerenciamento de uma colônia em Marte, em 2D
isométrico. O jogador equilibra cinco recursos, constrói módulos, expande a rede
e mantém a tripulação viva. A produção continua enquanto a aba está fechada,
com progresso offline limitado e eficiência reduzida.

### Escopo implementado

- Mapa isométrico 24 × 24.
- Cinco recursos: oxigênio, água, energia, alimentos e minérios.
- Doze módulos: habitat, gerador de oxigênio, extrator de água, painéis solares,
  dutos, dormitórios, refeitório, estufa, armazém, fábrica, mina e oficina.
- Construção, demolição, inspeção e posicionamento por tile.
- Rede de conexão por adjacência, bônus de dutos e oficinas.
- Apagão, moral, crescimento e declínio populacional.
- Save em `localStorage`, autosave e progresso offline.
- Interface responsiva para desktop, tablet e celular.
- Sprites recortados a partir dos renders originais.

---

## 2. Stack

| Camada | Tecnologia |
| --- | --- |
| Estrutura | HTML5 semântico |
| Estilo | CSS3 puro, variáveis CSS, Flexbox, Grid e media queries |
| Lógica | JavaScript moderno com ES Modules |
| Renderização | Canvas 2D |
| Persistência | `localStorage` |
| Loop | `requestAnimationFrame` |
| Entrada | Pointer Events, teclado e `wheel` |
| Assets | Python 3, Pillow, NumPy, rembg/u2net e ONNX Runtime |
| Testes | Node.js + Playwright |
| Versionamento | Git + GitHub CLI |
| Deploy | GitHub Pages |

Não há React, Vue, TypeScript, bundler, backend ou banco de dados. O jogo é
totalmente estático e não possui dependências de runtime.

### Por que JavaScript puro?

- Funciona sem etapa de build.
- Deploy direto em qualquer servidor estático ou GitHub Pages.
- Controle total sobre canvas, loop e DOM.
- Código acessível para estudo e modificação.

O custo é que a atualização de DOM, o estado e os eventos são gerenciados
manualmente.

---

## 3. Como o projeto foi construído

1. Inspeção dos 12 renders JPG (2752 × 1536, fundo de estúdio cinza).
2. Definição do modelo de dados em `js/config.js`.
3. Pipeline de recorte dos assets com `rembg`.
4. Implementação de `ResourceManager` e `Colony`.
5. Matemática isométrica e câmera.
6. Renderizador de terreno, sprites, dutos e ghost de construção.
7. HUD, menu de construção, inspetor, modais e toasts.
8. Save, autosave e progresso offline.
9. Ajustes de responsividade e correções de layout.
10. Testes com Playwright, screenshots e documentação.
11. Publicação no GitHub e GitHub Pages.

---

## 4. Estrutura de arquivos

```text
index.html                 Shell: canvas, HUD, painel, modais
css/style.css              Tema, layout, componentes e responsividade
js/config.js               Recursos, módulos, custos e balanceamento
js/main.js                 Boot, input, câmera, loop, save/offline e UI
js/core/AssetLoader.js     Carregamento de sprites com fallback
js/core/Camera.js          Pan, zoom, limites e insets
js/core/Colony.js          Simulação, rede, moral e população
js/core/GameLoop.js        requestAnimationFrame, pausa e velocidade
js/core/ResourceManager.js Quantidades, caps, custos e reembolsos
js/core/SaveManager.js     Persistência versionada em localStorage
js/render/Renderer.js      Terreno, sprites, dutos, seleção e ghost
js/ui/BuildMenu.js         Cards, categorias e gaveta mobile
js/ui/Hud.js               Recursos, Sol, população, moral e velocidade
js/ui/Inspector.js         Detalhes do módulo e demolição
js/ui/Toast.js             Notificações
js/ui/icons.js             Ícones SVG inline
js/utils/format.js         Formatação de números, taxas e tempo
js/utils/iso.js            Matemática isométrica
tools/prepare_assets.py    Pipeline de recorte dos sprites
tools/smoke-test.mjs       Teste E2E com Playwright
docs/                      Screenshots e documentação
```

---

## 5. Arquitetura e fluxo de dados

```text
config.js
   │
   ▼
ResourceManager ◄── Colony ──► eventos
   │                 │
   ▼                 ▼
  HUD          BuildMenu / Inspector
                     │
                     ▼
                  Renderer
```

### Responsabilidades

- **`config.js`** — fonte única de verdade: grade, recursos, edifícios, custos,
  produção, consumo, bônus e layout inicial.
- **`ResourceManager`** — estado dos recursos, capacidades, custos, reembolso e
  atualização numérica.
- **`Colony`** — ocupação da grade, validação, construção/demolição, produção,
  apagão, moral e população.
- **`Renderer`** — desenha a cena; não altera o estado.
- **`Hud` / `BuildMenu` / `Inspector`** — leem o estado e atualizam o DOM.
- **`main.js`** — orquestra boot, entrada, câmera, save e offline.
- **`GameLoop`** — chama `update(dt)` e `render()`.

### Loop principal

```js
realDt = min(0.1, (now - lastTime) / 1000);
if (!paused && speed > 0) {
  colony.update(realDt * speed);
}
render();
```

- Delta real limitado a **0,1 s** para evitar saltos após travadas.
- Velocidade multiplica o delta: **1×, 2× ou 4×**.
- O render acontece sempre, mesmo pausado.
- A UI é atualizada a cada **120 ms**, não a cada frame.

---

## 6. Modelo de simulação

### Recursos

| Recurso | Inicial | Cap base |
| --- | ---: | ---: |
| Oxigênio | 150 | 500 |
| Água | 120 | 400 |
| Energia | 220 | 600 |
| Alimentos | 100 | 350 |
| Minérios | 260 | 600 |

Atualização:

```js
amount = clamp(amount + netRate * dt, 0, cap);
```

### Ordem de um tick

1. Soma a produção de todos os módulos.
2. Aplica bônus de rede.
3. Soma o consumo dos módulos e da população.
4. Detecta apagão.
5. Aplica eficiência apenas na produção.
6. Atualiza os recursos.
7. Calcula a moral.
8. Atualiza a população.

### Bônus de rede

```js
production *= (1 + ductBonus) * (1 + workshopBonus);
```

- **Dutos:** cada duto adjacente ao footprint concede **+3%**, até **+15%**.
- **Oficinas:** cada oficina concede **+5% global**, até **+25%**.
- Os bônus são multiplicativos entre si.

### Apagão

```js
brownout = energy <= 0.5 && (energyProduction - energyConsumption) < 0;
```

Quando ativo:

- produção cai para **55%**;
- moral recebe penalidade;
- um evento dispara toast de aviso.

### Moral

Alvo:

```text
55 + somaMoralDosMódulos
- 10 por colono acima da capacidade
- 40 se oxigênio zerado
- 25 se água zerada
- 35 se comida zerada
- 15 em apagão
- 8 se energia zerada
```

A moral se aproxima do alvo suavemente:

```js
happiness += (target - happiness) * min(1, dt * 0.4);
```

Efeito na produção:

- moral < 30 → **85%**;
- moral > 75 → **105%**;
- caso contrário → **100%**.

### População

Cresce se:

- população < capacidade;
- moral ≥ 45;
- oxigênio, água e comida > 2.

Taxa:

```text
0.006 + moral * 0.00012 por segundo
```

Declínio:

- quando comida ou oxigênio chegam a zero;
- taxa de **0,01/s**;
- população mínima de 1 colono.

Durante o progresso offline, a população **não morre**. Os recursos podem cair,
mas a decadência só começa quando o jogador retorna.

### Consumo por colono

```text
0,03 O₂/s
0,035 H₂O/s
0,045 kcal/s
```

### Construção

Validações em `Colony.validate()`:

1. posição inteira e dentro da grade;
2. footprint sem sobreposição;
3. conexão com a colônia — precisa encostar em módulo ou duto;
4. recursos suficientes.

O posicionamento é centralizado no cursor:

```js
x = tileX - floor(footprint.w / 2);
y = tileY - floor(footprint.h / 2);
```

Demolição devolve **50%** do custo e exige confirmação em modal.

---

## 7. Renderização isométrica

### Projeção

Grade **24 × 24**, tile **128 × 64** (projeção 2:1).

```js
x = (gx - gy) * tileW / 2;
y = (gx + gy) * tileH / 2;
```

A função inversa converte tela/mundo de volta para a grade.

### Câmera

- Guarda o ponto do mundo no centro da área visível.
- `zoom` entre **0,5 e 2,2**.
- Zoom inicial:
  - mobile: `0,66`;
  - tablet: `0,78`;
  - desktop: `0,95–0,98`.
- Os **insets** descontam o HUD e o painel lateral, centralizando a colônia no
  espaço realmente livre.
- O zoom com scroll é ancorado no cursor.
- O pan por arraste usa limiar de **5 px** para diferenciar clique de arraste.

### Canvas

- `getContext('2d', { alpha: false })`.
- `devicePixelRatio` limitado a **2** para equilibrar nitidez e performance.
- O canvas é redimensionado para tamanho CSS × DPR.
- A cena é desenhada em coordenadas de mundo e transformada pela câmera.

### Ordem de desenho

1. Fundo gradiente marciano.
2. Partículas de poeira.
3. Plataforma isométrica com espessura.
4. 576 tiles com textura procedural determinística.
5. Preenchimento do módulo selecionado.
6. Entidades ordenadas por profundidade.
7. Contorno do selecionado.
8. Hover.
9. Ghost de construção.
10. Vinheta.

Ordenação:

```js
depth = x + y + footprint.w + footprint.h - 2;
```

### Sprites

- PNGs transparentes em `assets/buildings/`.
- Largura base:

```js
width = footprint.w * tileW * 1.02 * spriteScale;
```

- Altura proporcional à imagem.
- Âncora vertical padrão `0.96`, para o sprite “pisar” na borda frontal do
  footprint.
- Sombra de contato desenhada proceduralmente.
- `imageSmoothingQuality = 'high'`.

### Dutos

Dutos **não usam o PNG no mapa**; são desenhados proceduralmente:

- verificam vizinhos nas quatro direções;
- desenham tubos com múltiplas camadas de stroke;
- flanges nas extremidades;
- junção central;
- luz de status pulsante;
- o PNG do duto aparece apenas no card do menu.

### Textura do terreno

Cada tile usa `hash2d(x, y)` para gerar:

- variação de cor;
- pedrinhas;
- rachaduras;
- crateras raras.

Isso evita salvar textura no estado e mantém o mesmo resultado entre sessões.

---

## 8. Interface e responsividade

### HUD

Gerado dinamicamente a partir de `RESOURCES`:

- cinco chips de recursos;
- valor atual;
- taxa por segundo;
- barra de capacidade;
- estados `is-low`, `is-empty`, `is-full`;
- Sol, população e moral;
- pausa, velocidades, construção e ajuda.

### Menu de construção

- Cards gerados a partir de `BUILDING_LIST`.
- Categorias: Todos, Suporte vital, Habitação, Produção, Logística.
- Mostra custo, footprint, produção e moral.
- No desktop: painel lateral fixo.
- No mobile: gaveta inferior com scrim.

### Inspetor

Ao clicar em um módulo:

- nome e descrição;
- eficiência real;
- produção/consumo efetivos;
- bônus de dutos;
- botão de demolição com confirmação.

### Responsividade

Breakpoints principais:

```text
1400, 1365, 1240, 1060, 900, 700, 420, 360 px
```

Soluções aplicadas:

- HUD em duas linhas abaixo de 1240 px;
- “Sol” oculto em telas menores;
- controles compactos no mobile;
- painel em bottom sheet abaixo de 700 px;
- botões de zoom no mobile;
- toasts reposicionados quando o painel está aberto;
- `body.panel-open` para evitar sobreposição.

### Controles

- Mouse: arrastar, scroll, clique.
- Toque: arrastar, tocar, botões de zoom.
- Teclado:
  - `Espaço` pausa;
  - `1/2/3` velocidades;
  - `B` painel;
  - `G` grade;
  - `H` ajuda;
  - `Delete` demolição;
  - `Esc` cancela/fecha.

**Limitação atual:** não há pinch-to-zoom; no mobile o zoom é feito pelos botões
`+`/`−`.

---

## 9. Assets

### Origem

12 renders JPG em `assets/`, cada um com 2752 × 1536 e fundo de estúdio.

### Pipeline

`tools/prepare_assets.py`:

1. abre o JPG;
2. opcionalmente recorta uma região fracionária — usado no duto;
3. remove o fundo com **rembg/u2net**;
4. recorta margens transparentes;
5. redimensiona para até **620 px** de largura;
6. adiciona padding de **6 px**;
7. salva PNG otimizado em `assets/buildings/`.

Se o `rembg` não estiver disponível, há fallback com flood-fill + Pillow.

### Mapeamento

| Render original | ID no jogo |
| --- | --- |
| `area_convivencia` | `habitat` |
| `gerador_co2` | `oxygen-generator` |
| `extrator_agua` | `water-extractor` |
| `painel_solar` | `solar-panel` |
| `dutos_conexao` | `duct` |
| `dormitorio` | `dormitory` |
| `cozinha` | `cafeteria` |
| `estufa` | `greenhouse` |
| `estoque` | `warehouse` |
| `fabrica` | `factory` |
| `mina_recursos` | `mine` |
| `oficina` | `workshop` |

Os PNGs já estão versionados; o jogo não precisa de Python para rodar.

---

## 10. Persistência e progresso offline

### Save

- Chave: `colonia42.save.v1`
- Versão: `1`
- Formato: JSON no `localStorage`
- Salva:
  - construções (`id`, `x`, `y`);
  - recursos;
  - população;
  - moral;
  - progresso de crescimento;
  - `uidCounter`;
  - tempo decorrido;
  - `savedAt`.

### Quando salva

- a cada **20 s**, se a aba estiver visível;
- ao esconder a aba;
- ao fechar/recarregar (`beforeunload`);
- 1,2 s após construir ou demolir;
- manualmente pela janela de ajuda.

### Offline

No boot:

```js
elapsed = clamp((Date.now() - savedAt) / 1000, 0, 8 * 60 * 60);
colony.simulate(elapsed * 0.5);
```

- limite de **8 horas**;
- eficiência de **50%**;
- simulação em passos de até **2 s**;
- eventos silenciados;
- população protegida;
- resumo no toast com as maiores variações e recursos esgotados.

### Aba em segundo plano

`visibilitychange`:

- ao esconder: salva;
- ao voltar, se passou mais de 60 s: simula o período com 50% de eficiência e
  mostra um toast.

---

## 11. Testes e publicação

### Testes feitos

- `node --check` em todos os arquivos JS.
- Smoke test Playwright em 1600 × 900:
  - boot;
  - 4 construções iniciais;
  - seleção do gerador de oxigênio;
  - ghost válido;
  - construção;
  - abertura do inspetor;
  - pausa;
  - velocidade 4×;
  - save manual.
- Checagem de layout em:
  - 320 × 568;
  - 360 × 640;
  - 390 × 844;
  - 768 × 1024;
  - 1024 × 768;
  - 1366 × 768;
  - 1600 × 900.
- Verificação de:
  - overflow horizontal;
  - cinco chips de recursos visíveis;
  - erros de console;
  - sprites carregados.
- Teste da versão publicada no GitHub Pages.

### Publicação

- Repositório público.
- GitHub Pages configurado para servir a raiz da branch `master`.
- URL: <https://marciomoura2022.github.io/colonia-42-marte/>

---

## 12. Decisões de design e trade-offs

### Pontos fortes

- Dados de gameplay centralizados em `config.js`.
- Simulação separada de renderização e DOM.
- Nenhuma dependência de runtime.
- Fácil de hospedar em qualquer servidor estático.
- Assets com pipeline reproduzível.
- Layout testado em várias larguras.
- Save e offline implementados sem backend.

### Trade-offs

- Sem framework: mais código manual de DOM e eventos.
- Canvas: ótimo para isométrico, mas acessibilidade limitada.
- Sprites pré-renderizados: visual bonito, porém sem animação de construção.
- Rede por adjacência: simples e legível, mas não é um grafo logístico real.
- Save em `localStorage`: simples, mas limitado a um slot e ao mesmo navegador.

---

## 13. Limitações conhecidas / dívidas técnicas

1. **Sem pinch-to-zoom** no mobile; apenas botões.
2. **Pausa não é persistida**; o progresso offline pode avançar mesmo se o
   jogador pausou antes de sair.
3. **Possível pequena dupla contagem em segundo plano**: o `GameLoop` continua
   com delta limitado e o handler de `visibilitychange` também simula o período.
4. **Dutos não roteiam recursos**: são validação de conexão, bônus de eficiência
   e elemento visual.
5. **Sem rotação de módulos.**
6. **Sem atribuição de trabalhadores**; produção é automática.
7. **Sem ciclo dia/noite ou clima**; solar produz constante.
8. **Sem migração de save**: versão diferente é ignorada.
9. **Sem testes unitários da simulação**; apenas smoke/E2E.
10. **Sem CI** configurado.
11. **JPGs originais somam ~30 MB** no repositório; os PNGs, ~6 MB.
12. **Sem culling** no canvas: todos os 576 tiles são redesenhados por frame.
    Funciona bem em 24 × 24, mas não escalaria para mapas muito maiores.
13. **Textos fixos em pt-BR**; sem i18n.
14. **Sem áudio.**
15. **Acessibilidade parcial**: há ARIA e teclado, mas o jogo em canvas não é
    totalmente navegável por leitor de tela.
16. **Uso de `innerHTML`** para templates de UI; seguro no contexto atual porque
    os dados vêm do config, mas não é sanitização genérica.
17. **Estado inicial já em déficit** de O₂, água e comida — escolha intencional
    para gerar pressão, mas pode ser considerada punitiva.

---

## 14. Prompt para análise por outra IA

```text
Analise o jogo "Colônia 42 · Marte", um jogo idle de gerenciamento
de colônia em 2D isométrico.

Repositório:
https://github.com/MarcioMoura2022/colonia-42-marte

Demo:
https://marciomoura2022.github.io/colonia-42-marte/

Stack: HTML5, CSS3, JavaScript puro com ES Modules, Canvas 2D,
localStorage, Python/Pillow/rembg para os assets e Playwright para testes.
Não há framework, bundler nem backend.

Leia principalmente:
- README.md
- docs/ARQUITETURA.md
- js/config.js
- js/core/Colony.js
- js/core/ResourceManager.js
- js/core/GameLoop.js
- js/core/Camera.js
- js/render/Renderer.js
- js/main.js
- js/ui/BuildMenu.js
- js/ui/Hud.js
- js/ui/Inspector.js
- css/style.css
- tools/prepare_assets.py
- tools/smoke-test.mjs

Contexto de arquitetura:
- config.js concentra recursos, módulos, custos, produção e balanceamento.
- Colony.update(dt) calcula produção, consumo, apagão, moral e população.
- ResourceManager guarda quantidades, caps, custos e reembolsos.
- Renderer desenha grade isométrica 24x24, sprites, dutos procedurais,
  seleção e ghost de construção.
- main.js orquestra boot, input, câmera, loop, save e progresso offline.
- HUD, menu e inspetor são DOM; o mapa é canvas.

O que eu quero que você avalie:
1. Corretude da simulação e possíveis bugs de balanceamento.
2. Qualidade da arquitetura e acoplamento entre módulos.
3. Performance do loop e do renderizador.
4. Consistência do save/offline, incluindo pausa e segundo plano.
5. UX/UI e responsividade.
6. Acessibilidade.
7. Segurança de innerHTML e persistência.
8. O que falta para transformar isso em um jogo comercializável.
9. Quais testes automatizados deveriam existir.
10. Um roadmap priorizado com esforço e impacto.

Não altere arquivos ainda. Primeiro produza uma análise técnica,
com problemas concretos, referências de arquivo/linha e sugestões
de correção. Depois proponha um plano de implementação em etapas.
```
