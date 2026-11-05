# 40 Swords

RPG de ação top-down, multiplayer online, no estilo das aventuras clássicas em telas: o mundo é uma grade de telas, a câmera mostra uma tela por vez e desliza para a próxima quando o herói sai pela borda. Partidas de roguelite com PvP (etapas futuras).

> Toda a arte atual é **provisória, feita em código** (formas e cores). Veja "Trocar a arte" abaixo.

## Como jogar (etapa 1)

1. No menu, digite o nome e clique em **Jogar**.
2. Escolha o **herói** (cada classe mostra os atributos) e depois o **mapa** (por enquanto só o Vale das Espadas).
3. Você nasce na praça central. Explore as 9 regiões, mate inimigos para ganhar **XP** e pegue os **rupees** que eles deixam cair.
4. Ao subir de nível, a vida máxima e o dano aumentam e a vida enche.
5. Se morrer, volta à praça em 3 segundos.

| Ação | Teclado | Controle | Toque |
|---|---|---|---|
| Mover (8 direções) | WASD / setas | analógico esquerdo | joystick |
| Espada | Espaço / J | A / X | botão "Espada" |

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

- **Dano:** `força × (dano crítico, se critar) − defesa do alvo`, no mínimo 1.
- **Sorte (etapa 1):** chance de 4% por ponto (máx. 60%) de dobrar os rupees de um inimigo. Na etapa 2 passa a melhorar a raridade das relíquias.

## Inimigos

| Inimigo | Vida | Dano ao tocar | Comportamento | XP | Rupees |
|---|---|---|---|---|---|
| Slime | 18 | 6 | vagueia | 4 | 1–2 |
| Goblin | 34 | 10 | persegue quem chega perto (80 px) | 10 | 2–4 |

Cada inimigo fica na tela onde nasceu e reaparece 20–25 s depois de morto. Dados em `game/shared/src/enemies.ts`.

## O mapa

`content/maps/overworld.tmj`: 3×3 telas de 20×11 tiles (o mundo grande, de ~16×8 telas, vem na etapa 3). Layout **original**:

| | | |
|---|---|---|
| Rochedos Cinzentos (porta da masmorra, fechada) | Bosque dos Sussurros | Colinas de Pedra (caverna, fechada) |
| Prado Florido | **Praça das Espadas** (início) | Lago Espelhado |
| Pântano Sombrio | Velhos Túmulos | Dunas de Âmbar (caverna, fechada) |

Telas vizinhas se ligam pelas linhas 4–6 (esquerda/direita) e pelas colunas 8–11 (cima/baixo).

### Editar o mapa

Há dois caminhos:

- **ASCII (rápido para layout):** edite as telas em `tools/world-gen/src/screens.ts` e rode `pnpm --filter @tools/world-gen generate`. O gerador confere as bordas entre telas e se todo inimigo é alcançável a partir da praça, e regrava `content/maps/overworld.tmj` e `content/tilesets/overworld.png`.
- **Tiled:** abra `content/maps/game.tiled-project` e edite o `.tmj` direto. Inimigos são pontos da classe **`enemy`** com a propriedade `kind` (`slime` ou `goblin`); jogadores nascem nos pontos `spawn`. Se editar no Tiled, não rode mais o gerador (ele sobrescreve o mapa).

Depois de qualquer mudança: `pnpm content:validate`.

## Trocar a arte

- **Tileset:** substitua `content/tilesets/overworld.png` mantendo a ordem dos 16 tiles (8 colunas × 2 linhas, 16×16, margem 1, espaçamento 2), ou crie outro tileset e remapeie no Tiled.
- **Heróis e inimigos:** exporte do Aseprite para `content/sprites/<nome>.png + .json` com as tags `idle` e `walk`, usando os nomes `knight`, `rogue`, `barbarian`, `slime` ou `goblin`. O jogo passa a usar o sprite no lugar da forma provisória automaticamente (`game/client/src/render/placeholderArt.ts`).
- **Sons:** arquivos em `content/audio/sfx` e `content/audio/music` (veja `content/README.md`).

## Onde fica cada coisa

| O quê | Onde |
|---|---|
| Classes, atributos, XP | `game/shared/src/classes.ts` |
| Movimento, espada, recuo (simulação compartilhada, determinística) | `game/shared/src/simulation/player.ts` |
| Fórmulas de dano, crítico, roubo de vida, sorte | `game/shared/src/combat.ts` |
| Sala do mundo (inimigos, combate, drops, níveis) | `game/server/src/rooms/WorldRoom.ts` |
| Cena, câmera por telas, predição | `game/client/src/scenes/GameScene.ts` |
| Escolha de herói e mapa, HUD | `game/client/src/ui/` |
| Textos (14 idiomas) | `game/client/src/messages.ts` |

## Roteiro

1. ✅ **Base:** escolha de herói (3 classes), mapa, movimento em 8 direções, espada, inimigos com XP e rupees, níveis.
2. Relíquias com raridade (sorte), armas com cooldown e multiplicação de projéteis, baús, vendedores nas cavernas.
3. Mundo grande (~16×8 telas) com cavernas e masmorras, minichefes, chefes com baú, inimigos de elite.
4. Partida: PvP liberado após 5 minutos, saque de relíquia e rupees no PvP, arena battle royale aos 30 minutos.
