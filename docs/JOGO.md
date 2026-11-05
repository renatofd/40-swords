# 40 Swords

RPG de ação top-down, multiplayer online, no estilo das aventuras clássicas em telas: o mundo é uma grade de telas, a câmera mostra uma tela por vez e desliza para a próxima quando o herói sai pela borda. Partidas de roguelite com PvP (etapas futuras).

> Toda a arte atual é **provisória, feita em código** (formas, cores e emojis). Veja "Trocar a arte" abaixo.

## Como jogar (etapa 3)

1. No menu, digite o nome e clique em **Jogar**.
2. Escolha o **herói** (cada classe mostra os atributos) e depois o **mapa** (por enquanto só o Vale das Espadas). A escolha acontece antes de entrar na sala; o último herói fica lembrado.
3. Você nasce na praça, no centro de um mundo de **16×8 telas**. Quanto mais longe do centro, mais fortes os inimigos (e mais XP e rupees). Mate inimigos para ganhar **XP** e pegue os **rupees** que eles deixam cair. O **minimapa** (no painel de vida) mostra as telas que você já viu, as cavernas (amarelo) e as masmorras (vermelho) encontradas.
4. **Baús** espalhados pelo mapa: encoste para abrir e ganhar uma **relíquia** aleatória. Eles voltam a encher depois de 2 minutos.
5. **Cavernas** (8 espalhadas pelo mundo): entre pela abertura escura. Duas guardam baús; nas outras seis um **vendedor** oferece uma relíquia, uma arma e uma poção. Ande até o item para comprar. Cada jogador vê as próprias ofertas, sorteadas com a sua sorte e renovadas a cada 3 minutos. Para sair, use a passagem no fundo da caverna.
6. **Masmorras** (4, atrás de portas com pilares): 3×3 salas com inimigos mais fortes, um **minichefe** no caminho e o **chefe** na sala do fundo. Chefes e minichefes soltam um **baú** (raro ou melhor do chefe; incomum ou melhor do minichefe) e todos ficam sabendo quem venceu. Eles voltam depois de alguns minutos.
7. **Elites** (dourados e maiores): qualquer inimigo comum pode nascer elite (10%, 20% nas masmorras). Têm o triplo de vida, batem mais forte, dão o triplo de XP e rupees e têm 30% de chance de soltar um baú.
8. **Armas** disparam com o mesmo botão da espada, cada uma com a sua recarga. Segurando o botão, a espada e as armas atacam sozinhas assim que podem.
9. Ao subir de nível, os atributos melhoram e a vida enche. Se morrer, volta à praça em 3 segundos (sem perder nada).

| Ação | Teclado | Controle | Toque |
|---|---|---|---|
| Mover (8 direções) | WASD / setas | analógico esquerdo | joystick |
| Espada e armas | Espaço / J | A / X | botão "Espada" |
| Atributos e relíquias | C | Y | toque no painel de vida |

Um toque rápido no botão de ataque nunca se perde, mesmo mais curto que um quadro.

O PvP está desligado nesta etapa: jogadores não se ferem.

> Segurar o botão de ataque dispara as armas sem parar, mas cada golpe de espada prende o herói por um instante. Andar segurando o botão é mais lento: para correr, solte o ataque.

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

Valores de base (nível 0, perto da praça). Cada nível de dificuldade soma +30% de vida, +15% de dano e +35% de XP. O nível é a distância da praça, em telas, e nas masmorras vai de 4 a 7.

| Inimigo | Onde | Vida | Dano | Comportamento | XP |
|---|---|---|---|---|---|
| Slime | prados, lagos, pântano | 18 | 6 | vagueia | 4 |
| Goblin | colinas, montanhas | 34 | 10 | persegue | 10 |
| Morcego | florestas, masmorras | 12 | 5 | voo errático e rápido | 5 |
| Esqueleto | cemitério, montanhas | 40 | 9 | persegue e atira ossos | 14 |
| Escorpião | deserto | 30 | 12 | persegue e dá investidas | 12 |
| Lobo | florestas, prados | 28 | 9 | persegue rápido | 12 |
| Espreitador | pântano, lagos | 26 | 10 | anda aos saltos | 11 |

**Minichefes:** Bruto (investidas e pedras) e Feiticeiro (anéis de magia, rajadas e teleporte).

**Chefes** (um por masmorra):

| Masmorra | Chefe | Ataques |
|---|---|---|
| Cripta das Cinzas | Guardião de Ossos | rajadas de ossos, investida, invoca esqueletos |
| Covil da Bruxa | Bruxa do Brejo | anéis e rajadas de magia, teleporte, invoca espreitadores |
| Tumba Soterrada | Matriarca das Areias | investidas, rajadas de ferrões, invoca escorpiões |
| Salão do Colosso | Colosso de Pedra | anéis de pedras, investida, rajadas de pedras |

Cada inimigo fica na tela onde nasceu e só age quando há um herói por perto. Dados em `game/shared/src/enemies.ts`.

## Lojas

| Item | Preço |
|---|---|
| Relíquia de atributo | 6 (comum), 12, 25, 50, 100 (lendária) |
| Arma | 50% a mais que uma relíquia da mesma raridade |
| 🧪 Poção de Vida (enche a vida) | 10 |

## O mapa

`content/maps/overworld.tmj`: um mundo **original** de 16×8 telas de 20×11 tiles, mais 3 fileiras de interiores embaixo (as 4 masmorras de 3×3 salas e as 8 cavernas), ligados por portais. São 320×121 tiles, ~530 inimigos e ~40 baús.

Regiões, de cima para baixo: montanhas e colinas ao norte, uma floresta larga, o cemitério e o pântano a oeste, lagos e prados no centro (a praça de início no meio), o deserto a leste e uma praia no canto sudeste.

Nem toda tela vizinha se liga: as ligações formam um labirinto (uma árvore a partir da praça, mais atalhos). Quando ligadas, as telas se abrem nas linhas 4–6 (esquerda/direita) e nas colunas 8–11 (cima/baixo).

### Editar o mapa

Há dois caminhos:

- **Gerador (recomendado):** o mundo sai de `tools/world-gen`. Em `src/world.ts` ficam o mapa de biomas (uma letra por tela), a posição das masmorras e cavernas, a praça e as cavernas desenhadas à mão, e a `SEED`. Em `src/build.ts` ficam as regras de cada bioma e das salas de masmorra. Rode `pnpm --filter @tools/world-gen generate`: o gerador confere as bordas entre telas e se tudo é alcançável a partir da praça (inclusive passando pelos portais), e regrava `content/maps/overworld.tmj` e `content/tilesets/overworld.png`. Trocar a `SEED` gera outro mundo com o mesmo layout de biomas.
- **Tiled:** abra `content/maps/game.tiled-project` e edite o `.tmj` direto. Classes de objeto do jogo:
  - `spawn`: onde os jogadores nascem;
  - `enemy`: ponto com as propriedades `kind` (tipo do inimigo), `tier` (nível de dificuldade) e `dungeon` (dentro de masmorra);
  - `chest`: ponto com um baú;
  - `vendor`: ponto do vendedor; as 3 ofertas ficam numa fileira 2 tiles à frente dele, e precisam estar livres;
  - `portal`: retângulo com a propriedade `target`, o nome do objeto para onde o herói vai ao entrar (use um ponto da classe `dest`).
  
  Se editar no Tiled, não rode mais o gerador (ele sobrescreve o mapa).

Depois de qualquer mudança: `pnpm content:validate` e `pnpm test` (há testes que conferem portais, baús e vendedores do mapa).

## Trocar a arte

- **Tileset:** substitua `content/tilesets/overworld.png` mantendo a ordem dos 25 tiles (8 colunas, 16×16, margem 1, espaçamento 2), ou crie outro tileset e remapeie no Tiled.
- **Heróis e inimigos:** exporte do Aseprite para `content/sprites/<nome>.png + .json` com as tags `idle` e `walk`, usando os nomes `knight`, `rogue`, `barbarian` e os dos inimigos (`slime`, `goblin`, `bat`, `skeleton`, `scorpion`, `wolf`, `lurker`, `brute`, `hexer`, `warden`, `witch`, `matriarch`, `colossus`). O jogo passa a usar o sprite no lugar da forma provisória automaticamente (`game/client/src/render/placeholderArt.ts`).
- **Baús, vendedor, pedestais, projéteis (dos heróis e dos inimigos) e o brilho dos elites:** desenhados em `game/client/src/render/placeholderArt.ts`.
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
| Inimigos, elites, minichefes, chefes e a escala por nível | `game/shared/src/enemies.ts` |
| Sala do mundo (IA e ataques dos inimigos, combate, projéteis, baús, lojas, níveis) | `game/server/src/rooms/WorldRoom.ts` |
| Gerador do mundo (biomas, masmorras, cavernas) | `tools/world-gen/src/` |
| Minimapa, barra de chefe | `game/client/src/ui/minimap.ts`, `game/client/src/ui/bossBar.ts` |
| Cena, câmera por telas, predição, projéteis | `game/client/src/scenes/GameScene.ts` |
| Escolha de herói e mapa (antes de entrar) | `game/client/src/ui/heroSelect.ts` |
| HUD: vida, relíquias, atributos, avisos | `game/client/src/ui/` |
| Textos (14 idiomas) | `game/client/src/messages.ts` |

## Roteiro

1. ✅ **Base:** escolha de herói (3 classes), mapa, movimento em 8 direções, espada, inimigos com XP e rupees, níveis.
2. ✅ **Relíquias e lojas:** relíquias com raridade (sorte), armas com recarga e multiplicação de projéteis, baús, vendedores em cavernas.
3. ✅ **Mundo:** mapa grande (16×8 telas) com cavernas e masmorras, minichefes, chefes com baú, inimigos de elite e minimapa.
4. Partida: PvP liberado após 5 minutos, saque de relíquia e rupees no PvP, arena battle royale aos 30 minutos.
