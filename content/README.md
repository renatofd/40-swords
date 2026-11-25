# Conteúdo (mapas, tilesets, sprites, áudio)

Esta pasta é a **fonte única** do conteúdo. O cliente importa daqui (via Vite) e o servidor lê os mesmos mapas para colisão e spawns, então os dois nunca ficam fora de sincronia.

```text
content/
├── maps/
│   ├── game.tiled-project   Abra este arquivo no Tiled (classes spawn, enemy, chest, vendor, portal, dest)
│   └── overworld.tmj        O mundo do 40 Swords (gerado por tools/world-gen, editável no Tiled)
├── tilesets/world.png       Tileset do mundo, gerado por tools/world-gen a partir de src/notzelda (16x16, extrudado)
├── src/notzelda/            Folhas originais do pacote "Super Overhead Adventure 3" (CC BY-SA 4.0, veja ReadMe.txt): mundo, personagens, efeitos e itens; não vão para o jogo
├── CREDITS.md               Créditos e licença da arte (CC BY-SA 4.0) e o que foi modificado
├── sprites/
│   ├── *.png + *.json       Heróis, inimigos, efeitos e projéteis, gerados por `pnpm art` (tools/art) a partir de src/notzelda
│   └── src/                 Seus arquivos .aseprite (fonte)
└── audio/
    ├── music/theme.wav      Música (carregada sozinha, chave "theme")
    └── sfx/*.wav            Efeitos (a chave é o nome do arquivo: "join", "ui", "swing", "hit"...)
```

O mapa e o tileset vêm de `pnpm --filter @tools/world-gen generate` (veja "Como o mundo é gerado" em [`docs/JOGO.md`](../docs/JOGO.md)). A arte do mundo é *#NotZelda Overhead Adventure Tiles*, de Raphael Azcueta, sob a licença CC BY-SA 4.0. O `tilesets/world.png` é uma obra derivada, recortada, recomposta e extrudada, compartilhada sob a mesma licença. Os créditos completos e a lista das mudanças estão em [`CREDITS.md`](CREDITS.md); mantenha esse arquivo junto com a arte se ela for redistribuída. Heróis, inimigos, efeitos e projéteis vêm do mesmo pacote: `pnpm art` gera os sprites de `content/sprites/` (obras derivadas, mesma licença). Baús, rupees, corações, ícones de itens e sons ainda são **provisórios** (veja [`docs/JOGO.md`](../docs/JOGO.md)): a música e os sons `join` e `ui` vêm de `pnpm assets:placeholder`, e os efeitos do jogo (espada, golpe, dano, rupee, coração, baú, nível, armas, derrota, vitória) de `pnpm sfx`. Substitua à vontade. O `assets:placeholder` se recusa a rodar quando os arquivos já existem; **não use `--force`** neste jogo, porque ele recria os arquivos do jogo de exemplo do template (arena, terrain, player).

`pnpm content:validate` confere mapas, sprites e áudio. Ele roda na CI e no `pnpm check`.

## Sprites e animações (Aseprite)

**Tudo em `content/sprites/` é carregado sozinho:** `nome.png` + `nome.json` viram a textura `"nome"`, e cada **tag** do Aseprite vira uma animação `"nome/tag"`.

```ts
sprite.play(animKey("player", "walk"));   // "player/walk"
```

As animações respeitam a duração de cada quadro, a direção (forward, reverse, pingpong) e a repetição definidas no Aseprite.

### Como exportar

1. Salve o `.aseprite` em `content/sprites/src/`, por exemplo `hero.aseprite`.
2. Crie **tags** para cada animação (`idle`, `walk`, `attack`...).
3. Exporte de um destes jeitos:
   - **Automático:** rode `pnpm assets:sprites`. Precisa do executável do [Aseprite](https://www.aseprite.org/) ou do [LibreSprite](https://libresprite.github.io/), que é gratuito, no PATH. Se não estiver no PATH, informe o caminho na variável `ASEPRITE`:
     - Windows (PowerShell): `$env:ASEPRITE="C:/Program Files/Aseprite/Aseprite.exe"; pnpm assets:sprites`
     - macOS/Linux: `ASEPRITE=/caminho/do/aseprite pnpm assets:sprites`
   - **Manual no Aseprite:** *File → Export Sprite Sheet*. Na aba Output, marque **JSON Data** com formato **Array**, em *Item Filename* escreva `{frame}` e marque **Tags**. Salve como `content/sprites/hero.png` + `hero.json`.
4. Rode `pnpm content:validate`.

Para mudar a cor em tempo real (cor por jogador), desenhe o corpo em branco ou cinza claro e use `setTint` no jogo, como faz o jogador de exemplo. No 40 Swords as cores não são tingimento: as cores dos heróis e os elites dourados trocam cores exatas da folha na hora (veja "Cores do herói" e "Trocar a arte" em [`docs/JOGO.md`](../docs/JOGO.md)).

### Sprites do 40 Swords (`pnpm art`)

Os sprites do jogo não são exportados do Aseprite: o importador `pnpm art` (`tools/art`) recorta as folhas de `src/notzelda/` e escreve `sprites/<nome>.png` + `<nome>.json` no mesmo formato (json-array do Aseprite, um quadro por passo de cada tag), além de `game/client/src/render/spriteAnchors.json` (o ponto dos pés). A lista de sprites, quadros e tags fica em `tools/art/src/manifest.ts`. Não edite esses arquivos à mão: rode `pnpm art` de novo (`pnpm art --check` diz se algum ficou desatualizado). O importador só apaga os sprites que ele mesmo gerou.

## Áudio

**Tudo em `content/audio/music/` e `content/audio/sfx/` é carregado sozinho.** A chave é o nome do arquivo.

```ts
ctx.audio.playMusic("theme");                               // troca de música com fade
ctx.audio.playSfx("join", { rate: 0.95 + Math.random() * 0.1 });
```

- **Formatos:** `.ogg`, `.mp3`, `.m4a` e `.wav`. Para máxima compatibilidade, coloque o mesmo som em dois formatos (`theme.ogg` + `theme.m4a`) e o navegador escolhe o que suporta. Prefira `.ogg`/`.m4a` aos `.wav`, que são grandes.
- **Volume:** o jogador ajusta música e efeitos em **⚙ Configurações** (menu e pausa), e o valor fica salvo. Durante anúncios do GamePush tudo é silenciado.
- **Música do menu:** defina `menuMusic` no `GameModule`. Os navegadores só tocam som depois do primeiro toque ou clique, e a música começa sozinha nesse momento.

## Convenções de mapas

- **Orientação ortogonal**, mapa **não infinito**, tiles de **16x16**.
- **Tileset embutido** no mapa (o Phaser não carrega tilesets externos `.tsx`). No Tiled, use *Map → Embed Tileset* ou crie o tileset já embutido.
- Tileset de **uma imagem só** (não use "Collection of Images").
- Formato da layer de tiles: **CSV** (*Map Properties → Tile Layer Format*).
- Exportar como **JSON** com extensão `.tmj`.

### Layers

| Layer | Tipo | Uso |
|---|---|---|
| `ground` | Tiles | Chão |
| `walls` | Tiles | Paredes e obstáculos |
| `objects` | Objetos | **Obrigatória.** Pontos de spawn e, no futuro, zonas, portais e itens |

Pode adicionar outras layers de tiles; todas são desenhadas na ordem do Tiled.

O mundo do 40 Swords usa cinco layers de tiles, nesta ordem: `ground`, `ground2`, `walls`, `props` (mato alto e potes) e `above`. O jogo desenha a `above` por cima dos heróis, como as cabeças das estátuas.

### Colisão

No editor de tileset do Tiled, marque nos tiles que bloqueiam a propriedade booleana **`collides = true`**. Qualquer célula de qualquer layer com um tile assim é sólida, tanto no servidor quanto na predição do cliente.

### Spawns

Na layer `objects`, adicione **pontos** (ou retângulos) com a classe **`spawn`**. Os jogadores nascem neles em rodízio.

## Tilesets e pixel art

- Os tiles são **extrudados** (margem 1px, espaçamento 2px, com a borda de cada tile duplicada) para evitar linhas entre tiles. Para extrudar um tileset novo, use [tile-extruder](https://github.com/sporadic-labs/tile-extruder) e configure *margin = 1* e *spacing = 2* no Tiled.
- Mantenha tudo em múltiplos de 16px e sem antialiasing.

## Adicionando um mapa novo

1. Crie `content/maps/<id>.tmj` seguindo as convenções acima.
2. Se ele usar um tileset novo, coloque a imagem em `content/tilesets/`. Mapas e tilesets são carregados sozinhos: o tileset é encontrado pelo **nome do arquivo** da imagem.
3. Crie a sala com `{ mapId: "<id>" }` (veja `game/server/src/index.ts` e `WorldRoom.ts`).
4. Rode `pnpm content:validate`.
