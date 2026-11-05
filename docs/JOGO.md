# 40 Swords

RPG de ação top-down, multiplayer online, no estilo das aventuras clássicas em telas: o mundo é uma grade de telas, a câmera mostra uma tela por vez e desliza para a próxima quando o herói sai pela borda. Partidas de roguelite com PvP (etapas futuras).

> Toda a arte atual é **provisória, feita em código** (formas, cores e emojis). Veja "Trocar a arte" abaixo.

## Como jogar (etapa 2)

1. No menu, digite o nome e clique em **Jogar**.
2. Escolha o **herói** (cada classe mostra os atributos) e depois o **mapa** (por enquanto só o Vale das Espadas). A escolha acontece antes de entrar na sala; o último herói fica lembrado.
3. Você nasce na praça central. Explore as 9 regiões, mate inimigos para ganhar **XP** e pegue os **rupees** que eles deixam cair.
4. **Baús** espalhados pelo mapa: encoste para abrir e ganhar uma **relíquia** aleatória. Eles voltam a encher depois de 2 minutos.
5. **Cavernas** (nas Colinas de Pedra e nas Dunas de Âmbar): entre pela abertura escura. Lá dentro um **vendedor** oferece uma relíquia, uma arma e uma poção. Ande até o item para comprar. Cada jogador vê as próprias ofertas, sorteadas com a sua sorte e renovadas a cada 3 minutos. Para sair, use a passagem no fundo da caverna.
6. **Armas** disparam com o mesmo botão da espada, cada uma com a sua recarga. Segurando o botão, a espada e as armas atacam sozinhas assim que podem.
7. Ao subir de nível, os atributos melhoram e a vida enche. Se morrer, volta à praça em 3 segundos (sem perder nada).

| Ação | Teclado | Controle | Toque |
|---|---|---|---|
| Mover (8 direções) | WASD / setas | analógico esquerdo | joystick |
| Espada e armas | Espaço / J | A / X | botão "Espada" |
| Atributos e relíquias | C | Y | toque no painel de vida |

Um toque rápido no botão de ataque nunca se perde, mesmo mais curto que um quadro.

O PvP está desligado nesta etapa: jogadores não se ferem.

## Classes

| Atributo | Cavaleiro | Ladino | Bárbaro |
|---|---|---|---|
| Vida | 120 | 80 | 100 |
| Força (dano por golpe) | 10 | 8 | 14 |
| Velocidade (px/s) | 80 | 100 | 86 |
| Ataques por segundo | 2,5 | 3,8 | 1,9 |
| Alcance da espada (px) | 18 | 15 | 21 |
| Defesa (reduz cada golpe recebido) | 4 | 1 | 2 |
| Chance de crítico | 5% | 15% | 8% |
| Dano crítico | 150% | 175% | 200% |
| Roubo de vida | 0% | 3% | 6% |
| Sorte | 2 | 8 | 3 |

Por nível, cada classe ganha vida, dano, defesa e um pouco de chance de crítico (`game/shared/src/classes.ts`). XP para o próximo nível: `10 + nível × 10`. Nível máximo: 30.

- **Dano:** `força × (dano crítico, se critar) − defesa do alvo`, no mínimo 1. Vale para a espada e para os projéteis.
- **Roubo de vida:** cura uma parte do dano causado (espada e armas).

## Relíquias e raridade

Cinco raridades: **comum**, **incomum**, **rara**, **épica** e **lendária**. Quanto mais rara, mais forte:

| | Comum | Incomum | Rara | Épica | Lendária |
|---|---|---|---|---|---|
| Efeito das relíquias de atributo | ×1 | ×1,5 | ×2,2 | ×3,2 | ×5 |
| Dano das armas | ×1 | ×1,35 | ×1,8 | ×2,5 | ×3,5 |
| Chance com sorte 0 | 60% | 25% | 10% | 4% | 1% |
| Aumento da chance por ponto de sorte | — | +6% | +10% | +15% | +25% |

Com sorte 8 (Ladino), por exemplo, uma lendária sai em cerca de 2% dos sorteios, e com sorte 20 em cerca de 4%. A sorte também dá chance (4% por ponto, máx. 60%) de dobrar os rupees de um inimigo. Fórmulas em `game/shared/src/relics.ts`.

**Relíquias de atributo** (valor da comum; se acumulam sem limite):

| Relíquia | Efeito |
|---|---|
| ❤️ Amuleto do Coração | Vida +12 |
| 💪 Manopla do Gigante | Força +1,5 |
| 👢 Botas do Vento | Velocidade +5 (máximo físico: 200) |
| 🍀 Trevo de Quatro Folhas | Sorte +2 |
| 🎯 Olho de Falcão | Chance de crítico +3% |
| 💥 Marca do Carrasco | Dano crítico +15% |
| 🩸 Presa de Vampiro | Roubo de vida +1,5% (máximo 50%) |
| 🛡️ Escudo de Pedra | Defesa +1 |
| ⏳ Amuleto da Ampulheta | Recarga −4% da espada e das armas (mínimo 30%) |

**Armas** (disparam com o botão da espada). Cada cópia repetida **soma projéteis**, sem limite, e cada cópia mantém a própria raridade:

| Arma | Projéteis por cópia | Dano (comum) | Recarga | Alcance | Detalhe |
|---|---|---|---|---|---|
| 🗡️ Adagas de Arremesso | 1, em leque | 5 | 0,8 s | 120 px | rápidas |
| 🔥 Varinha de Fogo | 1, em leque | 12 | 1,4 s | 150 px | lenta, empurra forte |
| 🏹 Arco do Caçador | 1, em leque | 7 | 1,1 s | 220 px | atravessa 2 inimigos |
| ❄️ Cristal de Gelo | 8, em círculo | 6 | 2 s | 72 px | anel em volta do herói |

O dano de cada projétil soma uma parte da força do herói (20% a 40%, conforme a arma).

## Inimigos

| Inimigo | Vida | Dano ao tocar | Comportamento | XP | Rupees |
|---|---|---|---|---|---|
| Slime | 18 | 6 | vagueia | 4 | 1–2 |
| Goblin | 34 | 10 | persegue quem chega perto (80 px) | 10 | 2–4 |

Cada inimigo fica na tela onde nasceu e reaparece 20–25 s depois de morto. Dados em `game/shared/src/enemies.ts`.

## Lojas

| Item | Preço |
|---|---|
| Relíquia de atributo | 6 (comum), 12, 25, 50, 100 (lendária) |
| Arma | 50% a mais que uma relíquia da mesma raridade |
| 🧪 Poção de Vida (enche a vida) | 10 |

## O mapa

`content/maps/overworld.tmj`: 3×3 telas de 20×11 tiles, mais uma fileira de cavernas embaixo, ligadas por portais (o mundo grande, de ~16×8 telas, vem na etapa 3). O layout é **original**:

| | | |
|---|---|---|
| Rochedos Cinzentos (porta da masmorra, fechada) | Bosque dos Sussurros | Colinas de Pedra (caverna com vendedor) |
| Prado Florido | **Praça das Espadas** (início) | Lago Espelhado |
| Pântano Sombrio | Velhos Túmulos | Dunas de Âmbar (caverna com vendedor) |

8 baús: um em cada região, menos na praça. Telas vizinhas se ligam pelas linhas 4–6 (esquerda/direita) e pelas colunas 8–11 (cima/baixo).

### Editar o mapa

Há dois caminhos:

- **ASCII (rápido para layout):** edite as telas em `tools/world-gen/src/screens.ts` (a legenda está no topo do arquivo) e rode `pnpm --filter @tools/world-gen generate`. O gerador confere as bordas entre telas e se tudo é alcançável a partir da praça (inclusive passando pelos portais), e regrava `content/maps/overworld.tmj` e `content/tilesets/overworld.png`.
- **Tiled:** abra `content/maps/game.tiled-project` e edite o `.tmj` direto. Classes de objeto do jogo:
  - `spawn`: onde os jogadores nascem;
  - `enemy`: ponto com a propriedade `kind` (`slime` ou `goblin`);
  - `chest`: ponto com um baú;
  - `vendor`: ponto do vendedor; as 3 ofertas ficam numa fileira 2 tiles à frente dele, e precisam estar livres;
  - `portal`: retângulo com a propriedade `target`, o nome do objeto para onde o herói vai ao entrar (use um ponto da classe `dest`).
  
  Se editar no Tiled, não rode mais o gerador (ele sobrescreve o mapa).

Depois de qualquer mudança: `pnpm content:validate` e `pnpm test` (há testes que conferem portais, baús e vendedores do mapa).

## Trocar a arte

- **Tileset:** substitua `content/tilesets/overworld.png` mantendo a ordem dos 21 tiles (8 colunas, 16×16, margem 1, espaçamento 2), ou crie outro tileset e remapeie no Tiled.
- **Heróis e inimigos:** exporte do Aseprite para `content/sprites/<nome>.png + .json` com as tags `idle` e `walk`, usando os nomes `knight`, `rogue`, `barbarian`, `slime` ou `goblin`. O jogo passa a usar o sprite no lugar da forma provisória automaticamente (`game/client/src/render/placeholderArt.ts`).
- **Baús, vendedor, pedestais e projéteis:** desenhados em `game/client/src/render/placeholderArt.ts`.
- **Ícones de relíquias e itens:** emojis em `game/client/src/ui/relicText.ts`.
- **Sons:** arquivos em `content/audio/sfx` e `content/audio/music` (veja `content/README.md`).

## Onde fica cada coisa

| O quê | Onde |
|---|---|
| Classes, atributos, XP | `game/shared/src/classes.ts` |
| Relíquias, raridade, sorte, preços | `game/shared/src/relics.ts` |
| Armas e projéteis | `game/shared/src/weapons.ts` |
| Movimento, espada, armas, recuo, portais (simulação compartilhada, determinística) | `game/shared/src/simulation/player.ts` |
| Fórmulas de dano, crítico, roubo de vida | `game/shared/src/combat.ts` |
| Objetos do mapa (inimigos, baús, vendedores, portais) | `game/shared/src/worldObjects.ts` |
| Sala do mundo (inimigos, combate, projéteis, baús, lojas, níveis) | `game/server/src/rooms/WorldRoom.ts` |
| Cena, câmera por telas, predição, projéteis | `game/client/src/scenes/GameScene.ts` |
| Escolha de herói e mapa (antes de entrar) | `game/client/src/ui/heroSelect.ts` |
| HUD: vida, relíquias, atributos, avisos | `game/client/src/ui/` |
| Textos (14 idiomas) | `game/client/src/messages.ts` |

## Roteiro

1. ✅ **Base:** escolha de herói (3 classes), mapa, movimento em 8 direções, espada, inimigos com XP e rupees, níveis.
2. ✅ **Relíquias e lojas:** relíquias com raridade (sorte), armas com recarga e multiplicação de projéteis, baús, vendedores em cavernas.
3. Mundo grande (~16×8 telas) com cavernas e masmorras, minichefes, chefes com baú, inimigos de elite.
4. Partida: PvP liberado após 5 minutos, saque de relíquia e rupees no PvP, arena battle royale aos 30 minutos.
