# 40 Swords

RPG de ação top-down, multiplayer online, no estilo das aventuras clássicas em telas: o mundo é uma grade de telas, a câmera mostra uma tela por vez e desliza para a próxima quando o herói sai pela borda. Cada partida é uma corrida de roguelite com **uma vida só**: a partida começa quando todos os jogadores da sala estão prontos, todos começam no nível 1 no centro, ficam mais fortes explorando, depois de 5 minutos podem se enfrentar, e quem cai está fora. Vence o último de pé; se aos 30 minutos ainda houver mais de um, a decisão é numa arena de battle royale.

> **Arte:** o mundo (chão, água, árvores, rochas, casas, masmorras, cavernas e arena) usa os tiles em pixel art de *#NotZelda Overhead Adventure Tiles*, de Raphael Azcueta, sob a licença [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). O tileset do jogo é uma obra derivada sob a mesma licença (veja [`content/CREDITS.md`](../content/CREDITS.md)). Heróis, inimigos, chefes, o vendedor, os efeitos e os projéteis também vêm desse pacote (sprites gerados por `pnpm art`, obras derivadas sob a mesma licença). Baús, rupees, corações, pedestais e os ícones de itens ainda são **provisórios, feitos em código** (formas, cores e emojis). Veja "Trocar a arte" abaixo.

## Como jogar (etapa 7)

1. No menu, digite o nome e clique em **Jogar**.
2. Escolha a **cor** (as cores extras se desbloqueiam com a carreira; veja "Progressão") e clique no **herói** (cada classe mostra os atributos) para entrar. A escolha acontece antes de entrar na sala; o último herói e a última cor ficam lembrados. Por enquanto há um mapa só (o Vale das Espadas), então não há passo de escolha de mapa: as regras da partida aparecem embaixo do título. A escolha de mapa volta quando houver mais mapas, em versões depois do lançamento.
3. Você entra na **sala de espera**: dá para andar pelo mundo, mas nada fere e nada pode ser pego. Aperte **Pronto** (botão no painel, tecla R ou Start no controle). Quando todos estão prontos, há uma contagem de 5 s e a partida começa, com todos de volta à praça (veja "A partida"). Com **🤖 Bots: ligados** (o padrão), bots completam a partida até 40 heróis; qualquer um na sala pode desligar no mesmo painel (veja "Bots").
4. Você começa na praça, no centro de um mundo de **16×8 telas**. Quanto mais longe do centro, mais fortes os inimigos (e mais XP e rupees). Mate inimigos para ganhar **XP** e pegue os **rupees** que eles deixam cair. O **minimapa** (no painel de vida) mostra as telas que você já viu, as cavernas (amarelo) e as masmorras (vermelho) encontradas.
5. **Baús** espalhados pelo mapa: encoste para abrir e ganhar uma **relíquia** aleatória. Eles voltam a encher depois de 2 minutos.
6. **Cavernas** (8 espalhadas pelo mundo): entre pela abertura escura. Duas guardam baús; nas outras seis um **vendedor** oferece uma relíquia, uma arma e uma poção. Ande até o item para comprar. Cada jogador vê as próprias ofertas, sorteadas com a sua sorte e renovadas a cada 3 minutos. Para sair, use a passagem no fundo da caverna.
7. **Masmorras** (4, atrás de uma cripta, de um santuário ou de um templo): 3×3 salas com inimigos mais fortes, um **minichefe** no caminho e o **chefe** na sala do fundo. Chefes e minichefes soltam um **baú** (raro ou melhor do chefe; incomum ou melhor do minichefe) e todos ficam sabendo quem venceu. Eles voltam depois de alguns minutos.
8. **Elites** (dourados, com um brilho sob os pés): qualquer inimigo comum pode nascer elite (10%, 20% nas masmorras). Têm o triplo de vida, batem mais forte, dão o triplo de XP e rupees e têm 30% de chance de soltar um baú.
9. **Armas** disparam com o mesmo botão da espada, cada uma com a sua recarga. Segurando o botão, a espada e as armas atacam sozinhas assim que podem.
10. Ao subir de nível, os atributos melhoram e a vida enche. **Cuidado: é uma vida só.** Quem cai (para um monstro, outro herói ou a tempestade) está fora da partida e passa a assistir. Se foi outro herói, ele leva **uma relíquia sua, sorteada, e todos os seus rupees**.
11. **Curar:** monstros às vezes deixam cair um **coração** ❤ (10%; elites 50%; chefes e minichefes sempre), que devolve 25% da vida (só um herói ferido o pega; com a vida cheia ele fica no chão para os outros). Fora de combate (6 s sem levar dano) a vida também volta devagar, 1% por segundo, menos na arena. E há as poções das lojas.
12. **Matos e potes:** o **mato alto** (tufos claros e pontudos nas telas de grama; as moitas redondas e escuras continuam bloqueando o caminho) se corta com a espada, e os **potes** (nos cantos das cavernas e das masmorras) se quebram com ela. Os dois deixam o herói passar por cima. Alguns guardam rupees ou um coração (veja a tabela). Eles voltam depois de um tempo, mas só quando nenhum herói está na tela (ninguém vê nada brotar do nada); numa partida nova, tudo volta inteiro.

| | Coração | Rupees | Volta depois de |
|---|---|---|---|
| Mato alto | 8% | 30%: 1 | 45 s |
| Pote | 20% | 50%: 1 a 5 | 90 s |

A sorte do herói pode dobrar os rupees, como nos monstros. Só a espada corta e quebra (as armas não).

| Ação | Teclado | Controle | Toque |
|---|---|---|---|
| Mover (8 direções) | WASD / setas | analógico esquerdo | joystick |
| Espada e armas | Espaço / J | A / X | botão "Espada" |
| Atributos e relíquias | C | Y | toque no painel de vida |
| Pronto (sala de espera) | R | Start | botão "Pronto" no painel |

Um toque rápido no botão de ataque nunca se perde, mesmo mais curto que um quadro.

> Segurar o botão de ataque dispara as armas sem parar. Durante o golpe de espada o herói continua andando, mas a meia velocidade e virado para o golpe: dá para bater e recuar. Para correr, solte o ataque.

## A partida

O relógio no canto superior direito mostra a fase atual, quanto falta para a próxima e quantos heróis ainda estão de pé (👥). Quando a partida começa, a contagem até o PvP aparece grande no meio da tela por alguns segundos e depois desliza para o canto. Avisos aparecem 1 minuto antes do PvP e da arena.

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

A cor não é um tingimento: cada cor troca algumas cores exatas da folha do herói (a armadura do cavaleiro, o cabelo da ladina, a calça, as botas e o moicano do bárbaro), uma vez por classe e cor. As rampas (quatro tons de cada cor) e o que cada classe troca ficam em `game/client/src/render/heroPalettes.ts`; a troca em si, em `render/recolor.ts`. Na cor da classe, o cavaleiro é azul, a ladina mantém o cabelo magenta da folha e o bárbaro usa laranja. A escolha de herói e o resumo mostram o próprio sprite, já na cor escolhida (`game/client/src/ui/heroPortrait.ts`).

## Bots

Para a sala nunca ficar vazia, **bots** completam cada partida até **40 heróis** (contando os jogadores). Eles entram quando a partida começa e saem quando ela termina; na sala de espera, o botão **🤖 Bots** liga e desliga (vale para a próxima partida e todos na sala veem a escolha). Os nomes dos bots começam com 🤖 (na lista de jogadores, no placar, no feed e acima do herói).

Bots jogam com as mesmas regras dos jogadores: o servidor manda **uma entrada por tick** (mover, atacar) para cada bot e ela passa pela mesma simulação (`stepPlayer`) que a dos jogadores, sem atalhos. Eles só "veem" o que um jogador veria: a própria tela, os heróis perto, as ofertas da loja em que estão. Cada um tem uma personalidade sorteada (ousadia, coragem no PvP, cautela com a vida, reflexo).

O que um bot faz, em ordem de prioridade (decide 5 vezes por segundo):

1. **Na arena:** fica dentro da zona segura e luta com o herói mais perto (recua se estiver fraco).
2. **No PvP:** luta com heróis que consegue vencer (compara vida, dano, defesa e armas) e foge dos mais fortes.
3. **Monstros:** luta com os que consegue vencer com folga (estima golpes e dano recebido) e foge dos fortes demais, saindo da tela (monstros não saem da tela deles) e evitando aquela tela por um tempo. Quando foge, vai até a outra tela antes de decidir de novo. Durante a luta, sai da frente dos ataques anunciados (veja "Bots contra os inimigos da etapa 8B").
4. **Vida baixa:** pega os corações da tela. Abaixo da metade da vida, se recupera longe das lutas até 85%: numa tela calma, corta o mato e quebra os potes (pode sair coração) ou passeia pela tela; numa tela perigosa, vai para a tela fácil mais perto. Se tiver rupees, vai comprar poção na loja mais perto que consegue alcançar sem passar por telas difíceis demais.
5. **Loja, baús e rupees:** compra a melhor relíquia que pode pagar (sem pisar nas outras ofertas), abre baús e pega rupees da tela.
6. **Mato e potes:** corta boa parte dos que estão perto (não todos: tem para onde ir).
7. **Explorar:** vai para telas que não viu há algum tempo, cada vez mais longe da praça (inimigos mais fortes) conforme sobe de nível e junta relíquias, sem atravessar telas perigosas demais. Sem tela nova por perto, passeia pela tela em vez de ficar parado.

O caminho usa um grafo das partes transitáveis de cada tela (ligadas pelas bordas abertas e pelos portais das cavernas e masmorras) e mapas de distância dentro da tela; se um bot ficar preso numa parede, ele tenta outro caminho. Com 40 heróis, o servidor gasta cerca de 1 ms por tick (de 33 ms disponíveis).

O teste `game/server/test/bots.test.ts` simula uma partida inteira acelerada (calmaria, PvP, arena) com 39 bots e confere que eles se espalham, sobem de nível, se enfrentam, nunca ficam parados por 10 s e que alguém vence.

**Equilíbrio medido com os bots** (6 partidas simuladas de 30 min com 40 bots, tempos padrão, no mundo novo da etapa 7, antes da última revisão visual, que redesenhou algumas telas mas não mudou regras nem quantidades):

| Momento | Heróis de pé | Níveis |
|---|---|---|
| 5 min (começa o PvP) | 37–39 | 2 a 12 |
| 10 min | 19–28 | 6 a 19 |
| 15 min | 14–23 | 10 a 24 |
| 20 min | 12–20 | 13 a 26 |
| 30 min (arena) | 9–18 | 20 a 30 |

**Comparação com o mapa antigo.** Com as mesmas regras, o mapa da etapa 6 medido do mesmo jeito (7 partidas) deu 37–40, 23–29, 17–25, 16–22 e 14–18 heróis de pé nos mesmos momentos.

- **Monstros:** derrubam quase o mesmo número de heróis nos dois mapas, de 1 a 14 por partida, quase todos depois da calmaria.
- **Níveis:** sobem no mesmo ritmo.
- **PvP:** no mapa novo ele derruba um pouco mais, 16 a 24 heróis por partida contra 13 a 20 no antigo. Por isso chegam cerca de 2 heróis a menos à arena: 13 a 14 em média, contra 16.

Na etapa 6 (mapa antigo, 3 partidas) a medida tinha dado 39, 25–29, 20–23, 17–20 e 15–18.

**Bots presos.** O mundo novo revelou dois casos em que um bot ficava preso:

- **Loja inalcançável:** o bot escolhia uma loja que não conseguia alcançar sem passar por telas difíceis demais e ficava parado decidindo ir de novo, a cada tick.
- **Vai e volta:** ao fugir de um monstro forte, o bot dava meia-volta para lutar com um monstro fácil ao lado do perigo assim que saía do alcance, e ficava indo e voltando por minutos. Numa das partidas, 23 bots ficaram assim, quase todos no lago ao lado da praça.

Agora o bot só escolhe lojas que consegue alcançar e, quando foge, vai até a outra tela antes de decidir de novo. Nas 6 partidas, o maior tempo parado de um bot foi de 4 s, e só 2 bots passaram 30 s numa área de 40×40 px, os dois numa luta. Antes da correção, eram até 23 bots por partida. O teste dos bots também confere que nenhum fica parado 10 s.

**Bots contra os inimigos da etapa 8B.** Os bots veem o que o jogador vê: a preparação de cada ataque (a mesma do brilho na tela) vira uma "ameaça" com a área que vai ser atingida (uma faixa para tiros e investidas, um círculo para golpes, saltos e anéis) e quanto falta para ela chegar.

- **Esquiva:** quando uma ameaça está para chegar, o bot sorteia uma vez se reage (35% de base mais o reflexo dele, `BOT_DODGE_BASE` em `BotBrain.ts`, um botão de equilíbrio só dos bots) e, se reagir, dá alguns passos para a direção livre que mais o afasta da área, sem entrar no corpo de um monstro.
- **Interromper:** se o próprio alvo está se preparando ao alcance da espada e a espada está pronta, ele bate em vez de fugir (inimigos comuns, não elites).
- **Lanceiro:** vai para o lado dele e só bate fora do escudo.
- **Bruxa de pedra e colosso no ar:** o bot circula em volta, sem bater e sem ficar parado, e cuida dos ajudantes primeiro.
- **Teia:** preso numa teia, o bot foge mais cedo.
- **Vai e volta na borda:** um bot fugindo de outro herói podia atravessar a borda entre duas telas, decidir de novo do outro lado e voltar, com o perseguidor atrás, por mais de um minuto. Agora, depois de voltar duas vezes pela mesma borda em 10 s, ele segue em frente.

**Equilíbrio medido na etapa 8B** (8 partidas simuladas de 30 min com 40 bots, sementes 1 a 8, `balance.test.ts`; "antes" é o `main` da etapa 8A, 28 partidas medidas do mesmo jeito):

| | Antes (8A) | Etapa 8B |
|---|---|---|
| Heróis de pé aos 5 min | 37,5 | 38,2 (32 a 40) |
| 10 min | 22,1 | 24,6 (19 a 29) |
| 15 min | 18,0 | 19,9 (14 a 25) |
| 20 min | 16,5 | 16,8 (13 a 22) |
| 30 min (arena) | 14,5 | 14,9 (10 a 18) |
| Heróis derrubados por monstros, por partida | 7,9 | 5,2 (3 a 10) |
| ... nos primeiros 5 min | 2,6 | 1,8 (7 de 8 partidas com 2 ou menos; uma com 8) |
| Tipo que mais derruba | goblin, 32% | goblin, 26% |
| Chefes e minichefes vencidos, por partida | 28,5 | 19,5 |
| Nível mediano aos 10 min | 10,2 | 9,3 |
| Maior tempo parado de um bot | 3,7 s | 3,7 s |

- **Por que menos chefes vencidos:** os chefes agora avisam e punem (salto do colosso, pedra da bruxa, golpes em área), e a segunda fase aperta. Eles continuam caindo em toda partida, mais para o fim (o primeiro guardião por volta dos 21 min, o colosso em 5 de 8 partidas).
- **A variação entre partidas** vem quase toda do PvP: duas sementes podem diferir em 5 heróis aos 15 min com os mesmos monstros.
- **Ajustes feitos com essas medidas:** as listas de inimigos de longe ganharam inimigos fáceis (slime, morcego, goblin), o machadeiro só aparece a cinco telas ou mais, e o lobo bate 7 (era 9).
- **Medir de novo:** `BALANCE=1 BALANCE_SEED=1 BALANCE_PORT=2601 pnpm --filter @game/server exec vitest run test/balance.test.ts` (uma linha JSON por partida em `BALANCE_OUT`). O `pnpm check` pula esse teste.

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

Os monstros comuns do centro são mais fracos, para o começo ser mais tranquilo: nos níveis 0, 1 e 2 (até duas telas da praça) eles têm 30%, 25% e 12% menos vida e dano, com o mesmo XP e os mesmos rupees. Nas masmorras, nos minichefes e nos chefes, nada muda (`START_AREA_SOFTENING` em `game/shared/src/enemies.ts`).

### Como os inimigos atacam (etapa 8B)

Cada inimigo se move e ataca do jeito que o sprite dele mostra: quem pula, pula; quem tem arco, mira e atira; quem tem lança, investe em linha reta. Todo ataque segue a mesma sequência, que o servidor manda para o cliente num único campo (`Enemy.act`):

1. **Preparação** (de 1/3 a 2/3 de segundo): o inimigo para e faz a pose de preparo (puxa o arco, ergue o machado, se encolhe para pular). Nos últimos instantes aparece um **brilho branco** na arma ou na cabeça. A regra é uma só: **brilho = golpe vindo**. A direção do golpe fica travada nos últimos 6 ticks (0,2 s): sair da linha nessa hora funciona.
2. **Ação:** o tiro sai, o golpe acerta a área na frente, a investida corre.
3. **Recuperação:** um instante parado antes de voltar a andar.

Outras regras:

- **Interromper:** um golpe de espada durante a preparação cancela o ataque de um inimigo comum (elites, minichefes e chefes aguentam firme). Os humanoides mostram a pose de tontura por um instante, e aquele ataque espera metade da recarga para voltar.
- **Atordoado:** quem investe contra uma parede (lanceiro, Bruto, Guardião) fica um tempo parado com **estrelinhas amarelas** girando na cabeça: é a hora de bater. As estrelinhas nunca são o brilho branco.
- **Linha de visão:** tiros mirados, investidas e golpes só começam se o caminho até o herói estiver livre, e um golpe não atravessa parede (só a onda de choque do salto do colosso passa por cima).
- **Teia:** a teia da aranha deixa o herói **lento** (60% da velocidade) por 1,5 s; a teia aparece nos pés dele. Depois disso, outra teia só machuca, sem prender, por mais 1 s.
- **Escudo do lanceiro:** golpes pela frente (±60°) causam só 30% do dano e não empurram; aparece uma faísca e o número cinza. Pelos lados, por trás, durante a investida ou com ele atordoado, o dano é inteiro. O lanceiro só vira para uma direção nova depois de 0,4 s, então dá para contorná-lo.
- **Dormentes:** morcegos e aranhas ficam parados (o morcego pendurado) até um herói chegar perto, ou até levarem um golpe.
- **Segunda fase:** minichefes e chefes, com metade da vida ou menos, têm recargas 25% mais curtas, andam 15% mais rápido e trocam alguns ataques por versões maiores.

| Inimigo | Onde | Vida | Dano | Como age | XP |
|---|---|---|---|---|---|
| Slime | todo o mundo, mais perto da praça | 18 | 6 | anda aos pulinhos, sem perseguir | 4 |
| Goblin | colinas, montanhas, prados, florestas | 34 | 10 | persegue | 10 |
| Morcego | quase todo o mundo, cripta, covil | 12 | 5 | dorme até um herói chegar perto; voo errático e rápido | 5 |
| Lobo | prados, colinas, florestas | 28 | 7 | persegue em arrancadas | 12 |
| Espreitador | lagos, pântano, florestas, covil | 26 | 10 | se encolhe e salta no herói | 11 |
| Cogumelo | prados, florestas, lagos, covil | 30 | 6 | anda devagar; de perto solta um anel de esporos | 8 |
| Esqueleto | montanhas, colinas, cemitério, cripta | 40 | 9 | persegue e atira ossos | 14 |
| Escorpião | prados, colinas, praia, tumba | 30 | 12 | anda em linhas retas; investe quando alinhado | 12 |
| Machadeiro | montanhas (longe), tumba, salão | 44 | 11 | persegue e arremessa o machado | 18 |
| Aranha | florestas (longe), floresta vermelha, pântano, covil | 36 | 10 | dorme até um herói chegar perto; salta e atira teia | 16 |
| Fogo-fátuo | pântano, cemitério, cripta, salão | 24 | 10 | ricocheteia pelas paredes; só machuca encostando | 12 |
| Olho | montanhas (longe), tumba, salão | 34 | 6 | ricocheteia devagar e atira raios | 16 |
| Arqueiro | montanhas e florestas (longe), cemitério, praia, tumba | 30 | 6 | mantém distância e atira flechas | 14 |
| Saqueador | florestas (longe), floresta vermelha, praia, salão | 40 | 8 | persegue e golpeia com a espada longa na frente | 16 |
| Lanceiro | montanhas (longe), salão | 48 | 12 | anda em linhas retas; escudo na frente; investe com a lança | 20 |
| Naja | pântano, praia, covil, tumba | 32 | 8 | mantém distância; cospe 3 ferrões quando alinhada | 13 |
| Cultista | cemitério, cripta | 34 | 7 | mantém distância, se teletransporta e lança maldições | 16 |

"Longe" quer dizer a cinco telas ou mais da praça. Perto da praça (até duas telas) só há slime, goblin, morcego, cogumelo, espreitador e lobo; a três ou quatro telas entram esqueleto e escorpião; o resto só aparece mais longe e nas masmorras. A cor de alguns muda com o lugar (só no cliente): fogos-fátuos amarelos, ciano ou magenta, arqueiros esqueletos na cripta e no cemitério.

**Minichefes** (um por masmorra; nunca são empurrados nem interrompidos):

| Masmorra | Minichefe | Ataques |
|---|---|---|
| Cripta das Cinzas | Feiticeiro | mantém distância, teletransporte, rajadas de 3 orbes; na 2ª fase, anel de orbes |
| Covil da Bruxa | Dragão do Charco | mantém distância, sopro de 3 ferrões verdes; na 2ª fase, anel de ferrões |
| Tumba Soterrada | Bruto | rola em investida (fica atordoado se bater na parede), arremesso de 3 pedras |
| Salão do Colosso | Senhor da Guerra Escamoso | golpe de martelo na frente, investida; na 2ª fase, chama 2 saqueadores |

**Chefes** (um por masmorra):

| Masmorra | Chefe | Ataques |
|---|---|---|
| Cripta das Cinzas | Guardião de Ossos | golpe de alabarda em volta, galope em investida (atordoado na parede), arremesso de lança (3 lanças na 2ª fase), invoca esqueletos |
| Covil da Bruxa | Bruxa do Brejo | anéis e rajadas de orbes (5 na 2ª fase), teleporte, invoca fogos-fátuos. Com 66% e 33% da vida ela **vira pedra** por 4 s: nada a fere, chegam fogos-fátuos e, ao acordar, ela solta um anel de orbes. Um golpe só nunca pula uma dessas marcas |
| Tumba Soterrada | Matriarca das Areias | investida girando no casco (ricocheteia nas paredes duas vezes), leque de 5 ferrões, invoca escorpiões |
| Salão do Colosso | Colosso de Pedra | pisão em volta, **salto**: voa até onde o herói estava (no ar, nada o atinge) e cai com uma onda de choque e um anel de pedras; um **círculo vermelho** no chão mostra toda a área atingida. Rajadas de orbes (5 na 2ª fase) |

Cada inimigo fica na tela onde nasceu e só age quando há um herói na tela. Dados em `game/shared/src/enemies.ts`; a IA fica em `game/server/src/enemies/` (pura e determinística: todo sorteio vem do gerador da sala).

**Galeria de inimigos:** com `pnpm dev`, abra `http://localhost:3000/gallery.html` para ver todos os tipos e skins andando e atacando sem servidor (só em desenvolvimento; o pacote do cliente recusa ser gerado com ela). Parâmetros: `zoom=<n>`, `facing=<0-7>`, `only=<tipos>`, `debug` (caixas de colisão) e, para capturas, `seg=<segmento>&at=<ms>` (lista no começo de `game/client/src/gallery.ts`).

## Lojas

| Item | Preço |
|---|---|
| Relíquia de atributo | 6 (comum), 12, 25, 50, 100 (lendária) |
| Arma | 50% a mais que uma relíquia da mesma raridade |
| 🧪 Poção de Vida (enche a vida) | 10 |

## O mapa

`content/maps/overworld.tmj`: um mundo **original** de 16×8 telas de 20×11 tiles, mais 4 fileiras de interiores embaixo (as 4 masmorras de 3×3 salas, as 8 cavernas e a arena), ligados por portais. São 320×132 tiles, ~530 inimigos, 42 baús (32 em telas sorteadas do mundo aberto, número fixo; 10 nas cavernas e salas de tesouro), ~590 tufos de mato alto e ~140 potes. Toda a arte vem do pacote *#NotZelda Overhead Adventure Tiles* (veja [`content/CREDITS.md`](../content/CREDITS.md)), mas o desenho do mundo, das masmorras, das cavernas e da arena é nosso.

A **arena** é uma sala de 2×2 telas (40×22 tiles) com muralhas de 2 tiles (o mesmo kit das masmorras, sem portas), chão de areia batida (com marcas e um círculo de runas em cada ponto de entrada) e uma placa de pedra com medalhão no centro, contornada por uma faixa pintada, 4 blocos grandes e 8 estátuas para se proteger e 16 pontos de entrada num anel. Não há portal até ela: só o servidor leva os heróis para lá.

**Masmorras:** cada uma tem sua própria planta de 3×3 salas, feita à mão (a entrada fica na fileira de baixo, às vezes num canto; a sala do chefe só se abre para a do minichefe). Cada sala tem paredes de 2 tiles em perspectiva (o kit de salas do pacote) e chão livre de 16×7 tiles (x 2–17, y 2–8). Entre salas há portas de 2 tiles (colunas 9–10 em cima/embaixo, linhas 4–6 dos lados): um arco aberto entre salas comuns, um arco (largo, nos lados) marcado por placas com chifres na parede no caminho do chefe e um arco marcado por placas de sol em volta do minichefe (todas passáveis; ainda não há chaves). A sala de entrada tem um tapete desde a saída, placas com o número da masmorra (dado de 1 a 4) e a saída é a porta da parede sul (um portal de 2 tiles). A sala do chefe tem tapete e estandartes; o minichefe fica sobre um círculo de runas e o baú da sala do tesouro sobre um tapete. As outras salas tiram um arranjo de estátuas (sem repetir dentro da mesma masmorra) (a cabeça é desenhada por cima dos heróis) e blocos (2×2 viram um bloco grande), alguns assimétricos (um L de blocos, uma fileira de estátuas, uma divisória com passagem), e às vezes um corredor de tapete entre portas opostas ou um piso de ladrilhos em tons da masmorra. O chão tem marcas de desgaste, mais junto das paredes. Cada masmorra tem sua cor: *crypt* ardósia, *lair* verde-água e lima, *tomb* ameixa, *hall* vermelho e creme.

**Cavernas:** paredes de pedras cinza-escuras (a faixa de rochas do pacote, variante escura) sobre chão de terra, com manchas de terra escura, pedrinhas e cascalho junto das paredes; nas lojas (três arranjos diferentes), o vendedor fica atrás do balcão, junto da parede do fundo, com prateleiras, caixotes e um armário ao lado (móveis da casa do pacote); nas cavernas de tesouro, os baús ficam entre dois rochedos. A saída é uma escada de pedra na parede de baixo.

Regiões: uma faixa de montanhas rochosas atravessa quase todo o norte (cavernas na rocha, rochedos, restos de muros de tijolo, bosques de pinheiros, duas cachoeiras e o templo da masmorra *hall* no nordeste), mas para antes da borda oeste, onde há uma floresta; a oeste ficam o pântano (cripta da caveira, *lair*), a floresta vermelha e, no sudoeste, o cemitério (cripta da *crypt*); no centro, prados, um rio que desce da cachoeira e passa por dois lagos, com pontes onde os caminhos o cruzam, e a praça de pedra do início (duas estátuas, um poço entre flores e uma placa); a leste, florestas densas com pinheiros (o santuário da *tomb*), outro rio que termina num lago, e o litoral, com praia, píeres e ilhotas; ao sul, colinas com pedras, casas (só de enfeite: as janelas dão para um terreno livre), estátuas e placas.

```
FFMMMMMMMMMMMMMB    M montanhas   G prado    H colinas   F floresta
WWMMMMMGMMMFFFFB    R floresta vermelha   L lago   W pântano
WWRRGGGLGHMFFFFB    Y cemitério   B litoral   C praça de início
WWRRGGGGGGFFLFBB
WRRRGGGLCGGFFFBB
YYRRGGGGGGHFFFFB
YYWRGHGGHHHHFFBB
YYWRHHHGGHHHHBBB
```

Nem toda tela vizinha se liga: as ligações formam um labirinto (uma árvore a partir da praça, mais atalhos). Quando ligadas, as telas se abrem nas linhas 4–6 (esquerda/direita) e nas colunas 8–11 (cima/baixo); entre salas de masmorra, nas colunas 9–10 (as portas da arte).

### Como o mundo é gerado

O mapa e o tileset saem do gerador em `tools/world-gen`. Ele é determinístico: com a mesma `SEED`, o resultado é sempre o mesmo, byte a byte. Ele roda em quatro passos:

1. **Layout.** Cada tela vira uma grade de 20×11 letras (`.` chão, `T` árvore, `W` água, `#` parede de masmorra, `e` slime...; a lista completa está no começo de `src/generate.ts`).
   - As telas de fora vêm de `src/overworld.ts`, as salas de masmorra de `src/build.ts`, e as cavernas e a arena de `src/world.ts`.
   - Tudo usa o sorteio do layout. O mato alto e os potes vêm depois, com um sorteio separado.
2. **Conferência.** O gerador confere:
   - se as bordas entre telas batem;
   - se tudo é alcançável a partir da praça, inclusive pelos portais;
   - se nada nasce dentro de parede.
3. **Visual (skin).** `src/skin/` lê o layout, sem poder mudá-lo, e escolhe para cada célula uma *chave* do catálogo em cada camada (`ground`, `ground2`, `walls`, `props`, `above`).
   - `skin/overworld.ts` desenha margens de água, faixas de rocha, blocos de floresta, entradas e paletas por bioma, e a textura do chão de cada região: manchas de terra escura, cascalho e trilhas nas montanhas; clareiras de sol, sombra das árvores, folhas e flores na floresta; poças de lama de borda irregular, juncos na margem das poças, taboas e arbustos secos no pântano; terra batida nas trilhas e diante das covas, manchas escuras e folhas cinza no cemitério; dunas, conchas, pedras e rochas no mar na praia; caminhos de terra batida na areia, no pântano e no cemitério.
   - `skin/interior.ts` e `skin/kit.ts` desenham as paredes de 2 tiles das salas, as portas, os tapetes, as rochas das cavernas e a arena.
   - As variações só cosméticas (tufos, flores, qual árvore) usam um hash da célula, e as manchas (terra escura, clareiras, dunas, a lama do pântano) usam um ruído suave feito do mesmo hash (`blob` e `patch`, sem o aspecto de grade, em `skin/common.ts`), nunca o sorteio do layout: mudar o visual não muda o mundo. Nas telas sem caminhos de areia (montanhas e florestas), o caminho que o layout deixa livre aparece como uma trilha gasta.
4. **Atlas.**
   - `src/tiles.ts` é o catálogo: chave → tiles do pacote empilhados, com espelhamento, giro, recorte e animação.
   - `src/atlas.ts` "assa" só as chaves usadas num único `content/tilesets/world.png` (32 colunas, extrudado com margem 1 e espaçamento 2, no máximo 2048 px) e grava as propriedades de cada tile: `collides`, `prop`, `broken`, `brokenTile` e a animação do Tiled.
   - O gerador recusa um visual cuja colisão difira do layout em qualquer célula. Assim, o servidor e o cliente, que leem a colisão do mesmo `.tmj`, continuam iguais ao layout.

No jogo, as camadas são desenhadas nesta ordem: `ground`, `ground2`, `walls`, `props`, os heróis e inimigos, e por fim `above` (as cabeças das estátuas, por exemplo, ficam por cima dos heróis). As folhas originais do pacote ficam em `content/src/notzelda/` e não vão para o jogo: o build só leva o `world.png` e os sprites gerados em `content/sprites/`.

**Ver o mundo sem abrir o jogo:**

```bash
pnpm --filter @tools/world-gen render -- --out /tmp/mundo --grid             # overworld.png, interior.png, area-*.png
pnpm --filter @tools/world-gen render -- --out /tmp/mundo --screen 8,4 --scale 3   # uma tela ampliada
```

- `overworld.png` mostra as 16×8 telas de fora (com `--grid`, uma linha entre as telas).
- `interior.png` mostra a faixa de masmorras, cavernas e arena.
- `area-<id>.png` mostra cada masmorra, caverna e a arena.
- `--no-above` esconde a camada `above`.
- Sem `--out`, os PNGs vão para a pasta temporária do sistema (`40-swords-render`).
- `DEBUG_SCREENS="8,4 7,2" pnpm --filter @tools/world-gen generate` imprime as letras dessas telas.

### Editar o mapa

Há dois caminhos:

- **Gerador (recomendado):** veja "Como o mundo é gerado" acima.
  - **`src/world.ts`:**
    - o mapa de biomas (uma letra por tela) e os rios (`RIVERS`);
    - a posição das masmorras e cavernas, com o tipo de entrada;
    - a praça, as cavernas e a arena (`ARENA`), desenhadas à mão;
    - a `SEED`. Trocar a `SEED` gera outro mundo com o mesmo layout de biomas.
  - **`src/overworld.ts`:** as regras das telas de fora:
    - a borda com as passagens;
    - a entrada: caverna na rocha ou numa árvore oca, cripta, santuário ou templo;
    - a água: rios de 2 tiles, lagos e o mar;
    - os caminhos que ligam as passagens, com pontes;
    - a decoração de cada bioma.

    As paredes são retângulos de pelo menos 2×2 (rocha, floresta densa, pinheiros), porque a arte do pacote não tem cantos côncavos. Retângulos que se sobrepõem são desenhados do norte para o sul, cada um na frente do anterior.
  - **`src/build.ts`:** as salas de masmorra: paredes de 2 tiles, portas, e os arranjos de estátuas `I` e blocos `J` em `ROOM_PATTERNS`, desenhados sobre o chão de 16×7.
  - **Mato alto e potes:** são colocados depois, com um sorteio separado. Há de 1 a 3 moitas de 2 a 4 tufos em cada tela de grama, menos a praça, e de 2 a 4 potes por caverna e sala de masmorra, primeiro nos cantos (nas masmorras, longe de estátuas e blocos e fora dos tapetes entre as portas). Nada disso fica nas bordas das telas, na frente das passagens, nem perto de portais, baús e ofertas.
  - **Para gerar:** rode `pnpm --filter @tools/world-gen generate`. Ele regrava `content/maps/overworld.tmj` e `content/tilesets/world.png`, e apaga de `content/tilesets/` os PNGs que o mapa não usa mais.
- **Tiled:** abra `content/maps/game.tiled-project` e edite o `.tmj` direto. Classes de objeto do jogo:
  - `spawn`: onde os jogadores nascem;
  - `enemy`: ponto com as propriedades `kind` (tipo do inimigo), `tier` (nível de dificuldade) e `dungeon` (dentro de masmorra);
  - `chest`: ponto com um baú;
  - `vendor`: ponto do vendedor; as 3 ofertas ficam numa fileira 2 tiles à frente dele, e precisam estar livres;
  - `portal`: retângulo com a propriedade `target`, o nome do objeto para onde o herói vai ao entrar (use um ponto da classe `dest`);
  - `arenaSpawn`: ponto onde um herói aparece na arena (pelo menos 8). A área da arena vem da propriedade `areas` do mapa (tipo `arena`).

  Matos e potes ficam na camada de tiles `props`: pinte com os tiles de mato e de pote do tileset (eles têm as propriedades `prop`, que diz o tipo, e `broken`, que marca o desenho de quebrado). Nunca são sólidos.
  
  Se editar no Tiled, não rode mais o gerador (ele sobrescreve o mapa).

Depois de qualquer mudança: `pnpm content:validate` e `pnpm test` (há testes que conferem portais, baús, vendedores, matos e potes do mapa).

## Trocar a arte

- **Tileset (mundo):** a arte do mundo vem do pacote *Super Overhead Adventure 3* (#NotZelda Overhead Adventure Tiles, de Raphael Azcueta, CC BY-SA 4.0; créditos e mudanças em [`content/CREDITS.md`](../content/CREDITS.md)). As folhas ficam em `content/src/notzelda/`. Não edite o `content/tilesets/world.png` à mão: o gerador o refaz a cada execução.
  - **Trocar ou acrescentar tiles:** mude o catálogo em `tools/world-gen/src/tiles.ts`. Tiles simples entram no catálogo na hora em que são usados (`plain(id)`). Células com várias peças empilhadas viram um tile só (`stacked([...])`).
  - **Regras de cada célula:** ficam em `tools/world-gen/src/skin/`:
    - `overworld.ts`, com `PALETTES`, as paletas de cada bioma (variantes de cor do pacote: árvores vermelhas, rochas cinzas, areia, chão cinza-azulado do cemitério...);
    - `interior.ts` e `common.ts`;
    - `kit.ts`, que monta o anel de paredes das salas a partir de uma única faixa de parede de cima do pacote (espelhada e transposta para os outros lados, com cantos, pilaretes e a peça da porta).
  - **Cores das masmorras e tapetes:** `DUNGEON_THEMES` e `CARPETS`, em `tiles.ts`.
  - **Arte de outro pacote:** coloque as folhas em `content/src/<pacote>/`, registre-as em `SHEETS` (`atlas.ts`) e atualize `content/CREDITS.md` com a licença.
  - **Depois:** rode o gerador e o `render` para conferir.
- **Heróis, inimigos, efeitos e projéteis:** vêm do mesmo pacote. As folhas ficam em `content/src/notzelda/Characters`, `Visual FX` e `Items`, e o importador `pnpm art` (`tools/art`) as transforma em `content/sprites/<nome>.png + .json` (formato do Aseprite, com uma tag por animação). Não edite esses arquivos à mão: o `pnpm art` os refaz e apaga os que saíram da lista.
  - **Lista e animações:** `tools/art/src/manifest.ts`. Cada sprite diz a folha de origem, o tamanho do quadro e as tags (quadros, duração, repetição). Tags com direção se chamam `<animação>-<direção>` (`up`, `right`, `down`; a esquerda é a direita espelhada, a não ser que exista `-left`), e todo sprite tem a tag `idle`.
  - **Nomes:** heróis e inimigos usam o id do jogo (`knight`, `rogue`, `barbarian` e os 25 tipos de `ENEMY_KINDS`, de `slime` a `warlord`), e as variações ganham um sufixo (`slime-gold`, `wisp-cyan`, `archer-skeleton`). Efeitos começam com `fx-` (as armas dos humanoides inimigos são sobreposições `fx-bow`, `fx-sword-long`, `fx-hammer`, `fx-staff-green`), projéteis dos heróis com `shot-` e dos inimigos com `hostile-<estilo>`. Os humanoides têm, além de `attack-<direção>`, as tags `aim-`, `strike-` e `charge-<direção>`; os andarilhos 4×4 ganham `strike-<direção>` (coluna 3).
  - **Heróis em jogo** (`game/client/src/render/PlayerView.ts`): andam e ficam parados nas quatro direções (as diagonais usam a vista de lado, e a esquerda é a direita espelhada). A cada golpe o corpo toca `attack-<direção>` e a arma da classe (`fx-slash-<classe>`) acompanha quadro a quadro, presa na mão (girada 90° para cima e para baixo, e atrás do corpo quando o herói olha para cima). Ao levar dano aparece o quadro vermelho e depois o pisca-pisca da invulnerabilidade; um herói derrotado some numa nuvem de fumaça. Os heróis são desenhados pela altura dos pés (`render/depth.ts`): quem está mais embaixo na tela fica na frente.
  - **Inimigos em jogo** (`game/client/src/render/EnemyView.ts`; a tabela de cada tipo fica em `render/enemyLooks.ts`): cada tipo usa a sua folha, com os pés na base da caixa de colisão e virado para onde anda (linhas por direção, ou a vista de lado espelhada). O campo `act` que o servidor manda (ataque, fase e atordoado) comanda o resto:
    - **Preparação:** a tag de preparo é esticada para durar exatamente a preparação, a arte treme 1 px e o brilho `fx-shine` aparece no ponto do golpe (na arma, por direção) cerca de 0,2 s antes; ele some quando o golpe sai ou é cancelado. Andarilhos sem quadro de ataque mostram o item na mão acima da cabeça (osso, maldição). Os humanoides usam a arma sobreposta quadro a quadro: o golpe sai na coluna 10 do corpo, junto com o quadro 2 da arma, como manda o modelo do pacote.
    - **Golpe:** tiros saem quando chega `Msg.enemyShot`, que diz quem atirou (`from`); o resto vem do `act`. As tags de ação de um quadro tocam até o fim antes da recuperação.
    - **Atordoado:** pose própria e estrelinhas (`fx-spark`, tag `twinkle`) em volta da cabeça; nunca o brilho.
    - **Saltos:** slime, espreitador e aranha se encolhem, voam num arco acima da sombra e pousam. O colosso voa 24 px acima do chão com a sombra no chão; um círculo vermelho piscando marca toda a área que a queda vai atingir.
    - **Bruxa de pedra:** clarão, pose de pedra e uma explosão mágica ao acordar.
    - **Detalhes:** o morcego pousa quando para, a aranha parada respira mais devagar, o espreitador cai antes de virar fumaça. O teletransporte (feiticeiro, cultista e bruxa) deixa fumaça nos dois pontos. Golpes soltam faíscas (o clarão branco cheio só no crítico); um golpe no escudo do lanceiro ou na pedra mostra as estrelinhas e o número cinza. O inimigo pisca em branco (nenhum golpe corta uma ação no meio). Os elites são dourados: geleca e morcego têm folhas douradas do pacote; nos outros, as cores da folha viram tons de ouro na hora (`goldRecolor`). Ao morrer, um inimigo comum vira fumaça (o elite explode); chefes e minichefes piscam sob uma série de explosões. Como o servidor também tira do estado os inimigos que saem da área de interesse, o cliente só mostra a morte se o inimigo sumiu na tela logo depois de levar um golpe (ou junto com o chefe dele).
    - **Galeria:** `apps/client/gallery.html` (`game/client/src/gallery.ts`) mostra todos os tipos e skins sem servidor; o teste `tools/e2e/tests/gallery.spec.ts` falha se faltar folha, tag ou direção, ou se a página der erro.
  - **Projéteis** (`render/Projectiles.ts`): adaga, flecha e cristal dos heróis, e flecha, lança e raio dos inimigos, apontam na direção do voo, desenhados em passos de 45° (girar poucos graus estraga a pixel art; o voo segue o ângulo exato); osso, pedra e machado rodopiam na própria animação, e bola de fogo, orbe, ferrão, teia, maldição e esporo não giram. Cada um deixa um pequeno efeito onde para. O herói preso numa teia mostra a teia nos pés enquanto estiver lento.
  - **Vendedor e cenário:** o vendedor das cavernas é o monge do pacote e se vira para o herói que chega perto. Mato cortado solta pedaços de grama e o pote quebrado, uma nuvem de pó. Vendedor, baús e itens no chão também são desenhados pela altura dos pés.
  - **Pés no lugar certo:** o importador também escreve `game/client/src/render/spriteAnchors.json` (o ponto dos pés de cada sprite); `render/anim.ts` usa esse ponto para pôr os pés na base da caixa de colisão. Ao espelhar, o Phaser 4 inverte a arte dentro do retângulo do quadro (não em volta da origem), então quem espelha um sprite usa `setFlipAnchored`, que espelha a origem junto: sem isso, folhas com o ponto fora do meio do quadro (lobo, sapo, cajado do hexer) pulam de lado ao virar.
  - **Conferir:** `pnpm art --check` falha se algum sprite estiver desatualizado; ele roda no `pnpm check` e na CI. Depois de mudar a lista, atualize `content/CREDITS.md`.
  - **Acrescentar ou trocar um sprite:** copie a folha do pacote para `content/src/notzelda/` (com o nome de pasta do pacote), acrescente ou mude a entrada em `manifest.ts` (recorte, quadros, tags e, se for o caso, cores trocadas ou contorno), rode `pnpm art` e confira com `pnpm content:validate` e no jogo. O `pnpm art` só apaga os sprites que ele mesmo gerou; os exportados do Aseprite (`pnpm assets:sprites`) convivem na mesma pasta.
  - **Pixel art nítido:** sprites sempre em posições inteiras e em escala 1 (elites e chefes não crescem: o elite é dourado por troca de paleta); só os projéteis com direção giram, em passos de 45°. Sombras e o brilho dos elites são elipses de pixels inteiros, sem borda suavizada (`render/pixelEllipse.ts`). As cores mudam trocando cores exatas da folha (`render/recolor.ts`), nunca com `setTint`; o único tingimento é o pisca branco de quem leva um golpe.
- **Baús, rupees, corações, pedestais, sombras e o brilho dos elites:** ainda desenhados em `game/client/src/render/placeholderArt.ts`.
- **Ícones de relíquias e itens:** emojis em `game/client/src/ui/relicText.ts`.
- **Sons:** arquivos em `content/audio/sfx` e `content/audio/music` (veja `content/README.md`). Os efeitos provisórios (espada, golpe, dano, rupee, coração, baú, nível, armas, derrota, vitória, mato cortado e pote quebrado) são sintetizados por `pnpm sfx` (`tools/sfx/src/generate.ts`); para trocar um, coloque um arquivo com o mesmo nome (`swing.ogg`, por exemplo) e apague o `.wav`.

## Onde fica cada coisa

| O quê | Onde |
|---|---|
| Classes, atributos, XP | `game/shared/src/classes.ts` |
| Desenho dos heróis (animações, arma no golpe, cores trocadas na folha) | `game/client/src/render/PlayerView.ts`, `render/heroPalettes.ts`, `render/recolor.ts` |
| Desenho dos inimigos e projéteis (animações por tipo e por ataque, brilho de aviso, skins por lugar, elites dourados, mortes, efeitos) | `game/client/src/render/EnemyView.ts`, `render/enemyLooks.ts`, `render/Projectiles.ts`, `render/fx.ts` |
| Galeria de inimigos (só em desenvolvimento) | `apps/client/gallery.html`, `game/client/src/gallery.ts`, `tools/e2e/tests/gallery.spec.ts` |
| Relíquias, raridade, sorte, preços | `game/shared/src/relics.ts` |
| Armas e projéteis | `game/shared/src/weapons.ts` |
| Movimento, espada, armas, recuo, portais (simulação compartilhada, determinística) | `game/shared/src/simulation/player.ts` |
| Fórmulas de dano, crítico, roubo de vida | `game/shared/src/combat.ts` |
| Objetos do mapa (inimigos, baús, vendedores, portais) | `game/shared/src/worldObjects.ts` |
| Mato alto e potes: o que guardam, quando voltam, leitura da camada `props` | `game/shared/src/props.ts` |
| Inimigos, elites, minichefes, chefes, ataques (preparação, ação, recuperação), estilos de tiro e a escala por nível | `game/shared/src/enemies.ts` |
| IA dos inimigos (pura e determinística): cérebro, movimentos, ataques, golpes recebidos (escudo, pedra, interrupção), o que os bots veem deles | `game/server/src/enemies/` (`brain.ts`, `move.ts`, `acts.ts`, `hit.ts`, `step.ts`, `botView.ts`) |
| Regras da partida (fases, sala de espera, tempestade) | `game/shared/src/match.ts` |
| Tempos da partida por variável de ambiente | `game/server/src/config.ts` |
| Sala do mundo (aplica o que a IA dos inimigos pede: tiros, áreas, invocações; combate, teia, PvP e saque, projéteis, baús, lojas, níveis, sala de espera, fases da partida, eliminação e espectadores, arena) | `game/server/src/rooms/WorldRoom.ts` |
| Progressão: resumo da partida, carreira, cores e como se desbloqueiam | `game/shared/src/progress.ts` |
| Carreira salva no navegador, painel de resumo, cores na escolha de herói | `game/client/src/career.ts`, `game/client/src/ui/summary.ts`, `game/client/src/ui/heroSelect.ts` |
| Bots: decisões, combate, esquiva e nomes | `game/server/src/bots/BotBrain.ts`, `game/server/src/bots/names.ts` |
| Medição do equilíbrio (partidas de 30 min com 40 bots; só com `BALANCE=1`) | `game/server/test/balance.test.ts` |
| Bots: caminhos (partes das telas, bordas, portais, mapas de distância) | `game/server/src/bots/navigation.ts` |
| Gerador do mundo: biomas, posições e salas à mão; telas de fora; salas de masmorra | `tools/world-gen/src/world.ts`, `overworld.ts`, `build.ts` |
| Visual do mundo: o que vai em cada célula (skin), catálogo de tiles, atlas, render em PNG | `tools/world-gen/src/skin/`, `tiles.ts`, `atlas.ts`, `render.ts` |
| Sprites de heróis, inimigos, efeitos e projéteis: lista, animações e o importador | `tools/art/src/manifest.ts`, `sheet.ts`, `import.ts` |
| Camadas de profundidade, direção dos sprites e ponto dos pés | `game/client/src/render/depth.ts`, `anim.ts`, `spriteAnchors.json` |
| Créditos e licença da arte | `content/CREDITS.md` |
| Efeitos sonoros provisórios | `tools/sfx/src/generate.ts` |
| Minimapa, barra de chefe | `game/client/src/ui/minimap.ts`, `game/client/src/ui/bossBar.ts` |
| Cena, câmera por telas (e a que acompanha o herói na arena), tempestade, espectador, predição, projéteis, mato e potes quebrando | `game/client/src/scenes/GameScene.ts` |
| Relógio da partida (e a contagem grande no começo), feed de derrotas, faixa de vitória/eliminação | `game/client/src/ui/matchHud.ts` |
| Painel da sala de espera (Pronto, bots) | `game/client/src/ui/lobby.ts` |
| Escolha de herói e mapa (antes de entrar; o passo do mapa só aparece com mais de um mapa) | `game/client/src/ui/heroSelect.ts` |
| HUD: vida, relíquias, atributos, avisos | `game/client/src/ui/` |
| Textos (14 idiomas) | `game/client/src/messages.ts` |

## Roteiro

1. ✅ **Base:** escolha de herói (3 classes), mapa, movimento em 8 direções, espada, inimigos com XP e rupees, níveis.
2. ✅ **Relíquias e lojas:** relíquias com raridade (sorte), armas com recarga e multiplicação de projéteis, baús, vendedores em cavernas.
3. ✅ **Mundo:** mapa grande (16×8 telas) com cavernas e masmorras, minichefes, chefes com baú, inimigos de elite e minimapa.
4. ✅ **Partida:** sala de espera com Pronto, uma vida só, PvP liberado após 5 minutos, saque de relíquia e rupees no PvP, último de pé vence, arena battle royale aos 30 minutos com tempestade, espectadores.
5. ✅ **Bots, equilíbrio e progressão:** bots com IA que completam a partida até 40 heróis; combate e equilíbrio (corações, regeneração fora de combate, golpe sem travar, sons, PvP com metade do dano, curva de XP; medidos com os bots); progressão entre partidas (resumo, placar da sala, carreira no navegador e cores desbloqueáveis).
6. ✅ **Ajustes:** mato alto e potes com rupees e corações; monstros do centro mais fracos; bots que não ficam parados (se recuperam cortando mato ou passeando); contagem do PvP em destaque no começo da partida; um mapa só até o lançamento (sem passo de escolha de mapa).
7. ✅ **Mundo em pixel art:** o mundo inteiro desenhado com os tiles do pacote *#NotZelda Overhead Adventure Tiles* (CC BY-SA 4.0). O overworld foi refeito com regiões novas (montanhas e cachoeiras, cemitério, floresta vermelha, pântano, lagos e rios com pontes, florestas de pinheiros, litoral com píeres e ilhotas). Masmorras com paredes em perspectiva, portas, estátuas, tapetes e estandartes; cavernas de rocha; arena de areia com faixa pintada e círculos de runas nos pontos de entrada. O gerador monta o tileset com colisão, animações e a camada `above`, e há uma ferramenta para ver o mundo em PNG.
8. ✅ **Personagens em pixel art:** heróis, inimigos, chefes, vendedor, golpes, efeitos e projéteis com os sprites do mesmo pacote (CC BY-SA 4.0), importados por `pnpm art`: pés no chão e ordem pela altura dos pés, quatro direções, golpe com a arma da classe em sincronia, cores dos heróis e elites dourados por troca de paleta, mortes e faíscas com os efeitos do pacote. Na etapa 8B, 25 tipos de inimigo (10 comuns e 2 minichefes novos) que se movem e atacam como o sprite mostra, com preparação visível ("brilho = golpe vindo"), espalhados por bioma, distância e masmorra; bots que se esquivam. Baús, itens e a interface ganham arte na etapa 9.
