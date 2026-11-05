# Conteúdo (mapas, tilesets, sprites, áudio)

Esta pasta é a **fonte única** do conteúdo. O cliente importa daqui (via Vite) e o servidor lê os mesmos mapas para colisão e spawns, então os dois nunca ficam fora de sincronia.

```text
content/
├── maps/
│   ├── game.tiled-project   Abra este arquivo no Tiled (classes spawn, enemy, chest, vendor, portal, dest)
│   └── overworld.tmj        O mundo do 40 Swords (gerado por tools/world-gen, editável no Tiled)
├── tilesets/overworld.png   Tileset provisório (16x16, extrudado)
├── sprites/
│   └── src/                 Seus arquivos .aseprite (fonte); heróis e inimigos ainda são desenhados em código
└── audio/
    ├── music/theme.wav      Música (carregada sozinha, chave "theme")
    └── sfx/join.wav, ui.wav Efeitos (chaves "join", "ui")
```

A arte e os sons atuais são **provisórios**: o mapa e o tileset vêm de `pnpm --filter @tools/world-gen generate` (veja [`docs/JOGO.md`](../docs/JOGO.md)), os sons de `pnpm assets:placeholder`. Substitua à vontade. O `assets:placeholder` se recusa a rodar quando os arquivos já existem; **não use `--force`** neste jogo, porque ele recria os arquivos do jogo de exemplo do template (arena, terrain, player).

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

Para mudar a cor em tempo real (cor por jogador), desenhe o corpo em branco ou cinza claro e use `setTint` no jogo, como faz o jogador de exemplo.

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
