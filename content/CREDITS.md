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

## Demais arte e sons

Heróis, inimigos, baús, vendedor, projéteis e efeitos visuais ainda são desenhados em código (`game/client/src/render/placeholderArt.ts`). Os sons são sintetizados pelas ferramentas do repositório (`pnpm sfx` e `pnpm assets:placeholder`). Nada disso vem do pacote.
