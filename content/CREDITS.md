# Créditos e licença da arte

## Arte do mundo

Os tiles do mundo (chão, água, árvores, rochas, casas, masmorras, cavernas, arena, mato alto e potes) vêm de:

> **#NotZelda Overhead Adventure Tiles**, de **Raphael Azcueta** (pacote *Super Overhead Adventure 3*, versão vSUPER 1.0)
> Licença: [Creative Commons Atribuição-CompartilhaIgual 4.0 Internacional (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/) · [texto legal](https://creativecommons.org/licenses/by-sa/4.0/legalcode)

O `ReadMe.txt` original do autor, com a licença, está em [`src/notzelda/ReadMe.txt`](src/notzelda/ReadMe.txt).

### Arquivos

| Arquivo | O que é | Mudanças |
|---|---|---|
| `content/src/notzelda/Environments/Overworld.png`, `OverworldExotic.png`, `Dungeon.png`, `Tiles.png`, `House.png` | Folhas originais do pacote | Nenhuma (copiadas como vieram). Não vão para o jogo: são a fonte do gerador. |
| `content/tilesets/world.png` | Tileset do jogo (obra derivada) | Gerado por `tools/world-gen` a partir das folhas acima (veja abaixo). |
| `content/maps/overworld.tmj` | O mapa do jogo | O desenho do mundo, das masmorras, das cavernas e da arena é nosso. O mapa traz embutidos o tileset derivado e as suas propriedades (colisão, mato e pote, animações). |

### Como o `world.png` foi modificado

O gerador (`tools/world-gen/src/atlas.ts`, com o catálogo em `tools/world-gen/src/tiles.ts`) monta o `world.png` assim:

- **Recortado:** só entram os tiles de 16×16 que o mapa usa, tirados das folhas do pacote. Alguns são pedaços de peças maiores, como estátuas de 16×32, entradas de 3×2, o balcão e as faixas de parede das salas.
- **Recomposto:**
  - vários tiles do pacote são empilhados num tile só, por exemplo a margem da água sobre a água, uma árvore na frente de uma rocha, uma estátua sobre o chão ou uma ponte sobre a água animada;
  - alguns são espelhados ou girados, como as paredes das salas, montadas a partir da faixa de parede de cima, e os cantos;
  - alguns são deslocados ou recortados dentro da célula, como o meio do balcão e o desenho do pote quebrado (a base do pote com a borda recortada e dois cacos ao lado).
- **Reorganizado e extrudado:** os tiles ficam numa grade nova de 32 colunas com margem de 1 px e espaçamento de 2 px. A borda de cada tile é copiada 1 px para fora para não aparecerem linhas entre tiles na tela.
- **Animado:** os quadros de água, cachoeira e tufos de grama do pacote viram tiles separados, ligados por uma animação do Tiled.
- **Cores:** as variações de cor (árvores vermelhas, rochas cinzas, temas das masmorras...) são as que o próprio pacote oferece. Alguns tiles tiveram cores trocadas por outras da própria paleta do pacote: o chão da floresta e o do pântano (a grama escura em dois outros verdes) e as margens de água desses chãos, o chão de areia da arena e os círculos de runas dela (nas cores das muralhas), os pontilhados de transição entre chãos (a terra pontilhada do pacote em outras cores, às vezes espelhada), os juncos sólidos do pântano (em marrom, como taboas), a pilha de pedras das montanhas e as lajes das ruínas (um piso do pacote) nas cores das rochas, o mato alto do cemitério (em oliva), as folhas secas do cemitério (em cinza), a escada de saída das cavernas (em cinza) e o chão vermelho da masmorra *hall* (na cor de ferrugem do próprio tema).

### Licença das obras derivadas

Assim como a licença do pacote exige, o `content/tilesets/world.png` e a arte do mundo dentro de `content/maps/overworld.tmj` são compartilhados sob a mesma licença, **CC BY-SA 4.0**, com crédito a *#NotZelda Overhead Adventure Tiles* e a Raphael Azcueta. Quem redistribuir ou modificar essa arte precisa manter este crédito e a mesma licença.

A CC BY-SA 4.0 cobre a arte que vem do pacote e as obras derivadas dela. O código do jogo, o desenho dos mapas e os sons não vêm do pacote e não estão sob essa licença por causa dele.

## Personagens, efeitos e projéteis

Heróis, inimigos, chefes, o vendedor, os golpes das armas, os efeitos visuais e os projéteis vêm do mesmo pacote (*#NotZelda Overhead Adventure Tiles*, de Raphael Azcueta, CC BY-SA 4.0).

### Arquivos de origem

Ficam em `content/src/notzelda/`, com os nomes de pasta e de arquivo do pacote. Foram copiados como vieram e não vão para o jogo: são a fonte do importador (`pnpm art`, `tools/art`).

| Pasta do pacote | Arquivos | Uso no jogo |
|---|---|---|
| `Characters/Humanoid/` | `Character Gigante Sample/Gigante.png`, `Character Green Gal Sample/Gal Green.png`, `Colt/colt.png` | Heróis: cavaleiro (`knight`), ladina (`rogue`) e bárbaro (`barbarian`) |
| `Characters/Humanoid/` | `Character The Fool Sample/TheFool.png` | Vendedor (`merchant`) |
| `Characters/Humanoid/` | `SkeletonMage/SkeletonMage.png` | Minichefe *hexer* |
| `Characters/Humanoid/` | `Reptiles & Kobold/kobold.png`, `Skeleton/Skeleton.png`, `Reptiles & Kobold/reptile.png`, `Reptiles & Kobold/scaleless.png` | Arqueiro (`archer`, e a variação esqueleto `archer-skeleton`), saqueador (`raider`) e o minichefe *warlord* |
| `Characters/Humanoid/Reptiles & Kobold/` | `Shortbow 48x48.png`, `Long Slash Sword 64x48.png`, `Long Swing Hammer 64x48.png` | Arco do arqueiro (`fx-bow`), espada longa do saqueador (`fx-sword-long`) e martelo do *warlord* (`fx-hammer`) |
| `Characters/Humanoid/Attack FX/` | `Slash/Slash Wooden Sword 48x48.png`, `Slash/Slash Kukri 48x48.png`, `Slash/Slash Axe 48x48.png` | Golpe de espada de cada classe (`fx-slash-<classe>`) |
| `Characters/Humanoid/Attack FX/` | `Bowshot and Spells/Green Staff 48x48.png`, `Unsynced Attacks/Grass.png` | Cajado do *hexer* (`fx-staff-green`) e mato cortado (`fx-grass`) |
| `Characters/Small/` | `Goo/Goo.png`, `Goo/Blue Goo.png`, `Goo/Gold Goo.png`, `Beasts/Beast.png`, `Bones/Bones.png`, `Bat/Bat.png`, `Bat/BrownBat.png`, `EyeBat/GoldEye.png`, `Snakes/Fang/fang {side,up,down}.png`, `Snakes/HoodFang/hoodfang {side,up,down}.png`, `Rat/Rat-Sheet.png`, `FrogFlower/FrogFlower.png`, `FrogFlower/Black FrogFlower.png` | Inimigos comuns e suas variações (`slime`, `goblin`, `skeleton`, `bat`, `scorpion`, `cobra`, `wolf`, `lurker`...) |
| `Characters/Small/` | `Smushroom/smushroom.png`, `Spider/Spider.png`, `Spider/SpiderWeb.png`, `FloatSkull/floatskull.png`, `FloatEye/FloatEye.png`, `ArmorLancer/ArmorLancer.png`, `Beasts/AxeBeast/AxeBeast.png`, `Beasts/AxeBeast/AxeBeastAxe.png`, `Kultist/Kultist.png` | Inimigos da etapa 8B: cogumelo (`shroom`), aranha (`spider`) e a teia (`hostile-web`), caveira flutuante (`wisp`, `wisp-cyan`, `wisp-magenta`), olho (`eye`), lanceiro (`lancer`), machadeiro (`axeman`) e o machado que ele arremessa (`hostile-axe`), cultista (`kultist`) |
| `Characters/Large/` | `BigBeast/BigBeast.png`, `Wyvern/Wyvern Green.png`, `CentaurKnite/CentaurKnite.png`, `TenguMask/TenguMask.png`, `TurtleDragon/TurtleDragon.png`, `BatwingButtStomper/BatwingButtstomper.png` | Minichefes *brute* e *drake* e chefes *warden*, *witch*, *matriarch* e *colossus* |
| `Visual FX/` | `Smoke/Smoke 16x16.png`, `Smoke/Smoke 32x32.png`, `Smoke/Smoke Small 16x16.png`, `Hit Effect 16x16.png`, `Spark 16x16.png`, `Shine 16x16.png`, `Bolt 40x40.png`, `Dust20x40.png`, `magicOrb 16x16.png`, `Looping Fire/Fireball 16x16.png`, `Looping Fire/FireSmall 12x12.png`, `Looping Fire/Black Fire 16x16.png`, `Explosions/{Small Explosion, Small Blue Explosion, Small Pink Explosion} 16x16.png`, `Explosions/{Explosion, MagicExplosion, GreenExplosion} 32x32.png`, `Explosions/Big Explosion 48x48.png` | Fumaça, golpes, faíscas, explosões, poeira, as bolas de fogo e de magia e os projéteis de inimigos raio (`hostile-bolt`), maldição (`hostile-curse`) e esporo (`hostile-spore`) |
| `Items/` | `Weapons.png`, `Tools.png`, `Pickups.png`, `1 Bit/Weapons/Femur.png` | Projéteis: adaga, flecha, cristal da nova, osso, a flecha verde dos arqueiros (`hostile-arrow`) e a lança (`hostile-spear`) |
| `Environments/` | `Overworld.png` (já usado pelo mundo) | A pedra arremessada (`hostile-rock`) |

### O que vai para o jogo e como foi modificado

O importador (`tools/art/src/manifest.ts` diz o que entra; `tools/art/src/sheet.ts` faz o trabalho) escreve `content/sprites/<nome>.png` + `<nome>.json`, que são obras derivadas:

- **Recortado e reorganizado:** só entram os quadros usados. Cada animação vira uma sequência de quadros numa folha nova, com 1 px transparente entre eles; quadros iguais são guardados uma vez. Nas folhas de humanoides e nas de 16x16 sem fileira esquerda redesenhada (como `Bones`, `AxeBeast` e `Kultist`), a fileira virada para a esquerda não entra (é o espelho da direita; o jogo espelha na hora). Do `Bolt 40x40.png`, o raio dos inimigos (`hostile-bolt`) usa só os dois primeiros quadros (o cometa pequeno).
- **Girado:** a flecha, a flecha verde dos arqueiros (`hostile-arrow`) e o cristal da nova foram girados 90° para apontar para a direita; o osso e a pedra ganharam cópias giradas de 90° em 90° para a animação de giro; o machado arremessado (`hostile-axe`, 16×15, que não pode girar 90°) ganhou cópias espelhadas na vertical, na horizontal e giradas 180° para a mesma animação.
- **Cores trocadas** (por cores da própria paleta do pacote):
  - o golpe do cavaleiro (`Slash Wooden Sword`): a espada de madeira virou aço (cinzas) e as folhas do cabo foram apagadas;
  - o projétil venenoso dos inimigos (`hostile-sting`): a bola de fogo (`Fireball`) em verdes;
  - o osso (`Femur`, branco puro no pacote): em cor de osso, com contorno escuro de 1 px;
  - a pedra (`hostile-rock`): um pedaço do pedregulho do tile 1602 do `Overworld.png`, sem a sombra, em cinzas e com contorno escuro de 1 px;
  - a maldição (`hostile-curse`): o fogo negro (`Black Fire`) em roxos e lilases (o preto sumia no chão das masmorras);
  - o esporo (`hostile-spore`): os 4 primeiros quadros da fumaça pequena (`Smoke Small`), do cinza para o lilás, com contorno escuro de 1 px.
- O resto (heróis, inimigos, chefes, vendedor, golpes do *rogue* e do *barbarian*, armas dos arqueiros, saqueadores e do *warlord*, efeitos, adaga, bola de fogo, bola de magia, teia e lança) tem os pixels do pacote sem mudança.

No jogo, algumas folhas também têm cores trocadas na hora (sem gerar arquivos): as cores dos heróis (`game/client/src/render/heroPalettes.ts`) e os inimigos de elite em tons de ouro (`render/enemyLooks.ts`, exceto a geleca e o morcego, que usam as folhas douradas do próprio pacote, *Gold Goo* e *GoldEye*).

O `game/client/src/render/spriteAnchors.json` também sai do importador: só o tamanho dos quadros e o ponto de apoio (os pés) de cada sprite.

### Licença das obras derivadas

Os arquivos de `content/sprites/` gerados pelo `pnpm art` são compartilhados sob a mesma licença, **CC BY-SA 4.0**, com crédito a *#NotZelda Overhead Adventure Tiles* e a Raphael Azcueta.

## Demais arte e sons

Baús, pedestais, corações, rupees e ícones de itens ainda são provisórios: desenhados em código (`game/client/src/render/placeholderArt.ts`) ou emojis. Os sons são sintetizados pelas ferramentas do repositório (`pnpm sfx` e `pnpm assets:placeholder`). Nada disso vem do pacote.
