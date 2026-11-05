# 40 Swords

RPG de ação top-down, multiplayer online, no estilo das aventuras clássicas em telas: o mundo é uma grade de telas, a câmera mostra uma tela por vez e desliza para a próxima quando o herói sai pela borda. Cada partida é uma corrida de roguelite com **uma vida só**: a partida começa quando todos os jogadores da sala estão prontos, todos começam no nível 1 no centro, ficam mais fortes explorando, depois de 5 minutos podem se enfrentar, e quem cai está fora. Vence o último de pé; se aos 30 minutos ainda houver mais de um, a decisão é numa arena de battle royale.

> Toda a arte atual é **provisória, feita em código** (formas, cores e emojis). Veja "Trocar a arte" abaixo.

## Como jogar (etapa 5)

1. No menu, digite o nome e clique em **Jogar**.
2. Escolha o **herói** (cada classe mostra os atributos), a **cor** (as cores extras se desbloqueiam com a carreira; veja "Progressão") e depois o **mapa** (por enquanto só o Vale das Espadas). A escolha acontece antes de entrar na sala; o último herói e a última cor ficam lembrados.
3. Você entra na **sala de espera**: dá para andar pelo mundo, mas nada fere e nada pode ser pego. Aperte **Pronto** (botão no painel, tecla R ou Start no controle). Quando todos estão prontos, há uma contagem de 5 s e a partida começa, com todos de volta à praça (veja "A partida"). Com **🤖 Bots: ligados** (o padrão), bots completam a partida até 40 heróis; qualquer um na sala pode desligar no mesmo painel (veja "Bots").
4. Você começa na praça, no centro de um mundo de **16×8 telas**. Quanto mais longe do centro, mais fortes os inimigos (e mais XP e rupees). Mate inimigos para ganhar **XP** e pegue os **rupees** que eles deixam cair. O **minimapa** (no painel de vida) mostra as telas que você já viu, as cavernas (amarelo) e as masmorras (vermelho) encontradas.
5. **Baús** espalhados pelo mapa: encoste para abrir e ganhar uma **relíquia** aleatória. Eles voltam a encher depois de 2 minutos.
6. **Cavernas** (8 espalhadas pelo mundo): entre pela abertura escura. Duas guardam baús; nas outras seis um **vendedor** oferece uma relíquia, uma arma e uma poção. Ande até o item para comprar. Cada jogador vê as próprias ofertas, sorteadas com a sua sorte e renovadas a cada 3 minutos. Para sair, use a passagem no fundo da caverna.
7. **Masmorras** (4, atrás de portas com pilares): 3×3 salas com inimigos mais fortes, um **minichefe** no caminho e o **chefe** na sala do fundo. Chefes e minichefes soltam um **baú** (raro ou melhor do chefe; incomum ou melhor do minichefe) e todos ficam sabendo quem venceu. Eles voltam depois de alguns minutos.
8. **Elites** (dourados e maiores): qualquer inimigo comum pode nascer elite (10%, 20% nas masmorras). Têm o triplo de vida, batem mais forte, dão o triplo de XP e rupees e têm 30% de chance de soltar um baú.
9. **Armas** disparam com o mesmo botão da espada, cada uma com a sua recarga. Segurando o botão, a espada e as armas atacam sozinhas assim que podem.
10. Ao subir de nível, os atributos melhoram e a vida enche. **Cuidado: é uma vida só.** Quem cai (para um monstro, outro herói ou a tempestade) está fora da partida e passa a assistir. Se foi outro herói, ele leva **uma relíquia sua, sorteada, e todos os seus rupees**.
11. **Curar:** monstros às vezes deixam cair um **coração** ❤ (10%; elites 50%; chefes e minichefes sempre), que devolve 25% da vida (só um herói ferido o pega; com a vida cheia ele fica no chão para os outros). Fora de combate (6 s sem levar dano) a vida também volta devagar, 1% por segundo, menos na arena. E há as poções das lojas.

| Ação | Teclado | Controle | Toque |
|---|---|---|---|
| Mover (8 direções) | WASD / setas | analógico esquerdo | joystick |
| Espada e armas | Espaço / J | A / X | botão "Espada" |
| Atributos e relíquias | C | Y | toque no painel de vida |
| Pronto (sala de espera) | R | Start | botão "Pronto" no painel |

Um toque rápido no botão de ataque nunca se perde, mesmo mais curto que um quadro.

> Segurar o botão de ataque dispara as armas sem parar. Durante o golpe de espada o herói continua andando, mas a meia velocidade e virado para o golpe: dá para bater e recuar. Para correr, solte o ataque.

## A partida

O relógio no canto superior direito mostra a fase atual, quanto falta para a próxima e quantos heróis ainda estão de pé (👥). Avisos aparecem 1 minuto antes do PvP e da arena.

| Fase | Quando | O que acontece |
|---|---|---|
| Sala de espera | antes da partida | Os jogadores entram e andam à vontade; monstros parados, nada fere, baús e lojas fechados. Cada um aperta **Pronto**. Com **todos** prontos: contagem de 5 s (se alguém cancelar ou um jogador novo entrar, a contagem para). |
| Calmaria | 0 a 5 min | A sala **fecha**: ninguém mais entra. Todos começam na praça, no nível 1. Só monstros: explore, junte relíquias e rupees, compre nas cavernas. Heróis não se ferem. |
| PvP | 5 a 30 min | Heróis podem se ferir com a espada e com as armas (golpes entre heróis tiram **metade** do dano, para dar tempo de fugir); os nomes dos rivais ficam vermelhos. Quem vence a luta leva **uma relíquia sorteada e todos os rupees** do derrotado. |
| Arena | aos 30 min, se ainda houver mais de um | Os heróis ainda de pé vão para a **arena**, com a vida cheia, espalhados num anel. Contagem de 5 s sem dano, e então: battle royale. A câmera acompanha o herói. |
| Tempestade | durante a luta na arena | A zona segura (o círculo) fecha dos cantos até o centro em 2 min 30 s. Fora dela, o herói perde 10% da vida máxima por segundo (ignora defesa). |
| Resultado | quando sobra 1 (a qualquer momento) | O último de pé vence (se os últimos caírem juntos, ninguém vence). O resultado fica 15 s na tela e todos voltam para a **sala de espera**: nível 1, sem relíquias nem rupees, mundo renovado (inimigos, baús, lojas), e a sala volta a aceitar jogadores. |

- **Uma vida só:** quem cai (monstro, herói ou tempestade) está fora até a próxima partida. Todos veem no feed (embaixo, no centro) quem caiu e para quê. Quem caiu vê a própria posição e **assiste** a partida, primeiro quem o derrotou; o botão de ataque troca o herói acompanhado.
- A partida também pode terminar antes da arena: se só sobrar um, ele vence na hora.
- Quem tentar entrar com a partida em andamento vai para outra sala (a sala fecha quando a partida começa). Se alguém ainda conseguir entrar no último instante, assiste e joga na partida seguinte.
- Quem cai da conexão tem 20 s para voltar. Na sala de espera, ele aparece como ausente (⏳) e não segura o início; se a partida começar sem ele, ao voltar ele assiste.
- Partida sozinho e sem bots (para testar): começa quando você aperta Pronto e só termina se você cair ou chegar à arena (aí você vence). Com bots, é uma partida normal de 40.

**Testar a partida mais rápido:** os tempos vêm de variáveis de ambiente do servidor (validadas ao iniciar):

| Variável | Padrão | Para quê |
|---|---|---|
| `MATCH_PVP_SECONDS` | `300` | Segundos até o PvP ligar |
| `MATCH_ARENA_SECONDS` | `1800` | Segundos até a arena (mínimo 10) |

Exemplo: `MATCH_PVP_SECONDS=30 MATCH_ARENA_SECONDS=120 pnpm dev` (no Windows, `set MATCH_PVP_SECONDS=30` e `set MATCH_ARENA_SECONDS=120` antes de `pnpm dev`). O jogador nunca controla esses tempos: só o servidor.

As durações fixas (contagem da sala de espera e da arena, tempestade, dano da tempestade, tempo do resultado) ficam em `game/shared/src/match.ts`.

## Progressão

Toda partida começa igual para todos (nível 1, sem relíquias nem rupees), então nada do que se ganha entre partidas dá vantagem no PvP: a progressão é de **resultado e aparência**.

- **Resumo da partida:** quando o seu herói cai (ou quando a partida termina com ele de pé), aparece um painel com a colocação, heróis derrotados, monstros abatidos, chefes e minichefes, baús abertos, nível alcançado, relíquias e o tempo na partida. Ele some quando a próxima partida começa (ou no botão OK).
- **Placar da sala:** vitórias e heróis derrotados de cada jogador continuam de uma partida para a outra enquanto ele estiver na sala. As vitórias aparecem na sala de espera (🏆).
- **Carreira:** cada resumo soma na carreira do jogador, **salva no navegador** (partidas, vitórias, melhor colocação, heróis derrotados, monstros, chefes, maior nível e tempo jogado). Ela aparece na escolha de herói e no resumo.
- **Cores do herói:** marcos da carreira desbloqueiam cores, que todos na partida veem (os bots usam cores sorteadas):

| Cor | Como desbloquear |
|---|---|
| Cor da classe | sempre |
| Floresta | jogar 3 partidas |
| Brasa | derrotar 10 heróis |
| Sombra | terminar entre os 3 primeiros |
| Gelo | chegar ao nível 20 numa partida |
| Ouro | vencer uma partida |

As cores e as regras ficam em `game/shared/src/progress.ts` (os índices vão pela rede: acrescente cores novas no fim). Como a carreira fica no navegador do jogador, o servidor aceita qualquer cor conhecida: é só aparência.

## Bots

Para a sala nunca ficar vazia, **bots** completam cada partida até **40 heróis** (contando os jogadores). Eles entram quando a partida começa e saem quando ela termina; na sala de espera, o botão **🤖 Bots** liga e desliga (vale para a próxima partida e todos na sala veem a escolha). Os nomes dos bots começam com 🤖 (na lista de jogadores, no placar, no feed e acima do herói).

Bots jogam com as mesmas regras dos jogadores: o servidor manda **uma entrada por tick** (mover, atacar) para cada bot e ela passa pela mesma simulação (`stepPlayer`) que a dos jogadores, sem atalhos. Eles só "veem" o que um jogador veria: a própria tela, os heróis perto, as ofertas da loja em que estão. Cada um tem uma personalidade sorteada (ousadia, coragem no PvP, cautela com a vida, reflexo).

O que um bot faz, em ordem de prioridade (decide 5 vezes por segundo):

1. **Na arena:** fica dentro da zona segura e luta com o herói mais perto (recua se estiver fraco).
2. **No PvP:** luta com heróis que consegue vencer (compara vida, dano, defesa e armas) e foge dos mais fortes.
3. **Monstros:** luta com os que consegue vencer com folga (estima golpes e dano recebido) e foge dos fortes demais, saindo da tela (monstros não saem da tela deles) e evitando aquela tela por um tempo.
4. **Vida baixa:** vai à loja mais perto comprar poção, se tiver rupees.
5. **Loja, baús e rupees:** compra a melhor relíquia que pode pagar (sem pisar nas outras ofertas), abre baús e pega rupees da tela.
6. **Explorar:** vai para telas que não viu há algum tempo, cada vez mais longe da praça (inimigos mais fortes) conforme sobe de nível e junta relíquias, sem atravessar telas perigosas demais.

O caminho usa um grafo das partes transitáveis de cada tela (ligadas pelas bordas abertas e pelos portais das cavernas e masmorras) e mapas de distância dentro da tela; se um bot ficar preso numa parede, ele tenta outro caminho. Com 40 heróis, o servidor gasta cerca de 1 ms por tick (de 33 ms disponíveis).

O teste `game/server/test/bots.test.ts` simula uma partida inteira acelerada (calmaria, PvP, arena) com 39 bots e confere que eles se espalham, sobem de nível, se enfrentam e que alguém vence.

**Equilíbrio medido com os bots** (partidas simuladas de 30 min com 40 bots, tempos padrão):

| Momento | Heróis de pé | Níveis |
|---|---|---|
| 5 min (começa o PvP) | 38–39 | 2 a 11 |
| 10 min | 24–27 | 4 a 18 |
| 15 min | 18–19 | 9 a 22 |
| 20 min | 15–16 | 15 a 26 |
| 30 min (arena) | 11–14 | 22 a 30 |

Antes dos ajustes da etapa 5B, os melhores chegavam ao nível 30 em 7 minutos, cerca de 1 em cada 5 heróis caía para monstros na calmaria e o começo do PvP derrubava 2/3 dos heróis em 5 minutos.

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

Por nível, cada classe ganha vida, dano, defesa e um pouco de chance de crítico (`game/shared/src/classes.ts`). XP para o próximo nível: `10 + nível × 10 + 2 × nível²` (os últimos níveis custam bem mais: quem é forte caça monstros mais fortes, que dão mais XP). Nível máximo: 30.

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

`content/maps/overworld.tmj`: um mundo **original** de 16×8 telas de 20×11 tiles, mais 4 fileiras de interiores embaixo (as 4 masmorras de 3×3 salas, as 8 cavernas e a arena), ligados por portais. São 320×132 tiles, ~530 inimigos e ~40 baús.

A **arena** é uma sala de 2×2 telas (40×22 tiles) de areia com muralhas, pilares para se proteger e 16 pontos de entrada num anel. Não há portal até ela: só o servidor leva os heróis para lá.

Regiões, de cima para baixo: montanhas e colinas ao norte, uma floresta larga, o cemitério e o pântano a oeste, lagos e prados no centro (a praça de início no meio), o deserto a leste e uma praia no canto sudeste.

Nem toda tela vizinha se liga: as ligações formam um labirinto (uma árvore a partir da praça, mais atalhos). Quando ligadas, as telas se abrem nas linhas 4–6 (esquerda/direita) e nas colunas 8–11 (cima/baixo).

### Editar o mapa

Há dois caminhos:

- **Gerador (recomendado):** o mundo sai de `tools/world-gen`. Em `src/world.ts` ficam o mapa de biomas (uma letra por tela), a posição das masmorras e cavernas, a praça, as cavernas e a arena (`ARENA`) desenhadas à mão, e a `SEED`. Em `src/build.ts` ficam as regras de cada bioma e das salas de masmorra. Rode `pnpm --filter @tools/world-gen generate`: o gerador confere as bordas entre telas e se tudo é alcançável a partir da praça (inclusive passando pelos portais), e regrava `content/maps/overworld.tmj` e `content/tilesets/overworld.png`. Trocar a `SEED` gera outro mundo com o mesmo layout de biomas.
- **Tiled:** abra `content/maps/game.tiled-project` e edite o `.tmj` direto. Classes de objeto do jogo:
  - `spawn`: onde os jogadores nascem;
  - `enemy`: ponto com as propriedades `kind` (tipo do inimigo), `tier` (nível de dificuldade) e `dungeon` (dentro de masmorra);
  - `chest`: ponto com um baú;
  - `vendor`: ponto do vendedor; as 3 ofertas ficam numa fileira 2 tiles à frente dele, e precisam estar livres;
  - `portal`: retângulo com a propriedade `target`, o nome do objeto para onde o herói vai ao entrar (use um ponto da classe `dest`);
  - `arenaSpawn`: ponto onde um herói aparece na arena (pelo menos 8). A área da arena vem da propriedade `areas` do mapa (tipo `arena`).
  
  Se editar no Tiled, não rode mais o gerador (ele sobrescreve o mapa).

Depois de qualquer mudança: `pnpm content:validate` e `pnpm test` (há testes que conferem portais, baús e vendedores do mapa).

## Trocar a arte

- **Tileset:** substitua `content/tilesets/overworld.png` mantendo a ordem dos 29 tiles (8 colunas, 16×16, margem 1, espaçamento 2), ou crie outro tileset e remapeie no Tiled.
- **Heróis e inimigos:** exporte do Aseprite para `content/sprites/<nome>.png + .json` com as tags `idle` e `walk`, usando os nomes `knight`, `rogue`, `barbarian` e os dos inimigos (`slime`, `goblin`, `bat`, `skeleton`, `scorpion`, `wolf`, `lurker`, `brute`, `hexer`, `warden`, `witch`, `matriarch`, `colossus`). O jogo passa a usar o sprite no lugar da forma provisória automaticamente (`game/client/src/render/placeholderArt.ts`).
- **Baús, vendedor, pedestais, projéteis (dos heróis e dos inimigos) e o brilho dos elites:** desenhados em `game/client/src/render/placeholderArt.ts`.
- **Ícones de relíquias e itens:** emojis em `game/client/src/ui/relicText.ts`.
- **Sons:** arquivos em `content/audio/sfx` e `content/audio/music` (veja `content/README.md`). Os efeitos provisórios (espada, golpe, dano, rupee, coração, baú, nível, armas, derrota e vitória) são sintetizados por `pnpm sfx` (`tools/sfx/src/generate.ts`); para trocar um, coloque um arquivo com o mesmo nome (`swing.ogg`, por exemplo) e apague o `.wav`.

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
| Regras da partida (fases, sala de espera, tempestade) | `game/shared/src/match.ts` |
| Tempos da partida por variável de ambiente | `game/server/src/config.ts` |
| Sala do mundo (IA e ataques dos inimigos, combate, PvP e saque, projéteis, baús, lojas, níveis, sala de espera, fases da partida, eliminação e espectadores, arena) | `game/server/src/rooms/WorldRoom.ts` |
| Progressão: resumo da partida, carreira, cores e como se desbloqueiam | `game/shared/src/progress.ts` |
| Carreira salva no navegador, painel de resumo, cores na escolha de herói | `game/client/src/career.ts`, `game/client/src/ui/summary.ts`, `game/client/src/ui/heroSelect.ts` |
| Bots: decisões, combate e nomes | `game/server/src/bots/BotBrain.ts`, `game/server/src/bots/names.ts` |
| Bots: caminhos (partes das telas, bordas, portais, mapas de distância) | `game/server/src/bots/navigation.ts` |
| Gerador do mundo (biomas, masmorras, cavernas) | `tools/world-gen/src/` |
| Efeitos sonoros provisórios | `tools/sfx/src/generate.ts` |
| Minimapa, barra de chefe | `game/client/src/ui/minimap.ts`, `game/client/src/ui/bossBar.ts` |
| Cena, câmera por telas (e a que acompanha o herói na arena), tempestade, espectador, predição, projéteis | `game/client/src/scenes/GameScene.ts` |
| Relógio da partida, feed de derrotas, faixa de vitória/eliminação | `game/client/src/ui/matchHud.ts` |
| Painel da sala de espera (Pronto, bots) | `game/client/src/ui/lobby.ts` |
| Escolha de herói e mapa (antes de entrar) | `game/client/src/ui/heroSelect.ts` |
| HUD: vida, relíquias, atributos, avisos | `game/client/src/ui/` |
| Textos (14 idiomas) | `game/client/src/messages.ts` |

## Roteiro

1. ✅ **Base:** escolha de herói (3 classes), mapa, movimento em 8 direções, espada, inimigos com XP e rupees, níveis.
2. ✅ **Relíquias e lojas:** relíquias com raridade (sorte), armas com recarga e multiplicação de projéteis, baús, vendedores em cavernas.
3. ✅ **Mundo:** mapa grande (16×8 telas) com cavernas e masmorras, minichefes, chefes com baú, inimigos de elite e minimapa.
4. ✅ **Partida:** sala de espera com Pronto, uma vida só, PvP liberado após 5 minutos, saque de relíquia e rupees no PvP, último de pé vence, arena battle royale aos 30 minutos com tempestade, espectadores.
5. ✅ **Bots, equilíbrio e progressão:** bots com IA que completam a partida até 40 heróis; combate e equilíbrio (corações, regeneração fora de combate, golpe sem travar, sons, PvP com metade do dano, curva de XP; medidos com os bots); progressão entre partidas (resumo, placar da sala, carreira no navegador e cores desbloqueáveis).
