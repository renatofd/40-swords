# Changelog

Mudanças do template. Jogos derivados: leia antes de `git merge template/main`. Veja [`docs/TEMPLATE.md`](docs/TEMPLATE.md).

## 0.6.0

Tela antes da partida e toques rápidos que não se perdem.

### Novo
- **`GameModule.beforeJoin`:** passo opcional entre o botão **Jogar** e a entrada na sala, para escolher personagem, time ou mapa. O jogo mostra a própria tela com `ctx.show(...)` e responde com a sala (`roomName`, por exemplo uma sala por mapa) e as opções de entrada (`options`), ou com `null` para voltar ao menu. Esc também volta ao menu. **Tentar novamente** repete a última escolha; **Jogar de novo** mostra a tela outra vez. O contexto traz `t`, `name`, `audio`, `platform`, `storage` (para lembrar a última escolha) e `signal`.
- **`ctx.input.wasPressed(id)`:** verdadeiro no quadro seguinte a um aperto, mesmo que a tecla, o botão do controle ou o botão de toque já tenha sido solto (um toque mais curto que um quadro não se perde mais). Cada aperto conta uma vez; segurar não repete. Use para ações de um toque (atacar, interagir, abrir painel); `isDown` continua para ações seguradas.
- O jogo de exemplo usa os dois: escolhe a cor antes de entrar (`game/client/src/ui/pickColor.ts`), e o servidor valida a cor recebida.

### Ao atualizar um jogo
- Nada no núcleo quebra: os dois recursos são opcionais.
- O jogo de exemplo mudou (`game/*`, `PROTOCOL_VERSION` 4) e o `joinMatch` dos testes e2e escolhe uma cor (`tools/e2e/tests/helpers.ts`). Se o seu jogo já reescreveu esses arquivos, mantenha a sua versão nos conflitos.

## 0.5.0

Revisão geral do template: segurança do servidor, reconexão no cliente, ferramentas no Windows e documentação.

### Novo
- **`InputBudget` (`@core/server`):** limita cada jogador a cerca de um input por tick. Mandar inputs mais rápido não faz mais andar mais rápido. A sala de exemplo usa.
- **Mapas e tilesets carregados sozinhos:** qualquer `content/maps/*.tmj` e `content/tilesets/*.png` entra no jogo, sem registrar em `assets.ts`. O tileset é achado pelo nome do arquivo da imagem.
- **`PUBLIC_ADDRESS`** no servidor, para rodar vários processos com Redis (veja `docs/DEPLOY.md`, seção 4).
- `pnpm content:validate` também pega: JSON corrompido, imagem de tileset que não existe, spawn dentro de parede ou fora do mapa, `collides` que não é booleano, mapas salvos como `.tmx`, arquivos em pastas que o jogo não lê e o mesmo nome em `music/` e `sfx/`.
- `pnpm assets:sprites` acha o Aseprite nas pastas comuns do Windows (inclusive Steam) e do macOS.
- Tela "Conectando…" e "Reconectando…" com botão para voltar ao menu.

### Corrigido
- **Servidor:**
  - um jogador parado (aba em segundo plano, conexão caída) não continua "andando" nem ganhando pontos;
  - o chat é limitado antes de qualquer processamento, e nomes e mensagens enormes não travam mais o servidor;
  - nomes só com caracteres invisíveis viram o nome padrão;
  - quem é expulso por mandar mensagens demais não ganha vaga de reconexão;
  - a área de interesse reenvia uma entidade trocada pelo mesmo id, e libera a visão de quem sai;
  - o cliente não escolhe mais o mapa da sala (`defineRoom(ArenaRoom, { mapId })`);
  - `ALLOWED_ORIGINS` aceita maiúsculas e porta padrão, e páginas não permitidas não recebem CORS.
- **Cliente:**
  - sair da partida durante uma reconexão deixava uma sessão fantasma, que depois fechava o menu ou encerrava a partida seguinte;
  - Esc fechava a tela "Reconectando…";
  - o jogo não ficava centralizado em árabe;
  - a página ficava em branco enquanto o SDK do GamePush carregava; um servidor do SDK travado agora passa para o próximo;
  - "Conectando…" podia girar para sempre;
  - no celular, voltar ao menu abria o teclado;
  - música parada antes do primeiro toque tocava mesmo assim, e trocas rápidas de música davam erro;
  - margens de segurança (notch) do lado errado em árabe;
  - notebooks com tela de toque ganhavam joystick e aviso de girar a tela;
  - a mensagem "falha ao iniciar" agora é traduzida.
- **Ferramentas:**
  - `pnpm check` falhava em todos os arquivos no Windows (fim de linha CRLF): o novo `.gitattributes` mantém LF;
  - `pnpm loadtest` mostrava zero conexões;
  - `pnpm init-game` corrompia arquivos com nomes que têm `$` ou aspas;
  - `pnpm assets:placeholder` não sobrescreve mais seus arquivos sem `--force`;
  - arquivos com extensão maiúscula (`.PNG`, `.WAV`) passavam na validação mas não carregavam.
- **Deploy:**
  - `.env.production` e outros `.env.*` não vão mais para o git nem para a imagem Docker;
  - o release avisa e não envia ao itch.io quando falta `VITE_SERVER_URL`, e o `.zip` usa a versão da tag;
  - `docker compose` publica a porta 2567 e não expõe o Redis.
- Documentação desatualizada corrigida (versões, CI, ADRs, exemplos para o PowerShell).

### Breaking
- `game/client/src/assets.ts`: `tilesetKey` recebe o caminho da imagem, e `TILESETS`/`MAPS` vêm de globs. Se o seu jogo editou esse arquivo, refaça a mudança sobre a versão nova.
- O cliente não escolhe mais o mapa: defina `mapId` em `defineRoom(...)`, em `game/server/src/index.ts`.
- Ao atualizar um jogo já existente: `git config remote.template.tagOpt --no-tags` (veja `docs/TEMPLATE.md`).

## 0.4.0

Recursos que todo jogo usa: sprites animados, áudio e componentes de interface.

### Novo
- **Sprites animados (Aseprite):**
  - tudo em `content/sprites/` é carregado sozinho, e cada tag vira a animação `"<sprite>/<tag>"` (`animKey`), com a duração, a direção e a repetição definidas no Aseprite;
  - `pnpm assets:sprites` exporta os `.aseprite` de `content/sprites/src/` (Aseprite ou LibreSprite);
  - o jogador de exemplo tem animação parado/andando e vira para a direção do movimento.
- **Áudio (`ctx.audio`):**
  - música com troca suave (fade) e efeitos sonoros;
  - volume de música e de efeitos e opção de silenciar tudo, salvos por jogador;
  - silencia durante anúncios;
  - tudo em `content/audio/music` e `content/audio/sfx` é carregado sozinho;
  - `menuMusic` e `uiSound` no `GameModule`.
- **Tela de configurações** (no menu e na pausa): música, efeitos, silenciar tudo e idioma.
- **Componentes de interface (`ctx.ui`):**
  - avisos curtos (`toast`);
  - placar no canto, com o top 5 e a posição do próprio jogador;
  - lista de jogadores (segurar Tab, ou 👥 no celular), alimentada por `setScores(rows)`.
- **Chat:**
  - Enter abre (💬 no celular);
  - o servidor limpa o texto (`sanitizeChat`), limita o tamanho e a velocidade de envio, e o jogo pode filtrar mensagens com `filterChat`;
  - para desligar, use `chat = false` na sala e `chat: false` no `GameModule`;
  - funciona com qualquer escrita (direção de texto automática por linha).
- **Jogo de exemplo:**
  - ganha 1 ponto por segundo andando;
  - `roster` com todos os jogadores, fora da área de interesse, alimentando o placar;
  - aviso e som quando alguém entra ou sai;
  - música de tema.
- `pnpm content:validate` valida mapas, sprites e áudio (substitui `maps:validate`).
- **GitHub Codespaces:** `.devcontainer/` instala tudo sozinho e abre o jogo no navegador, sem instalar nada no computador.
- **Proxy em desenvolvimento:** o cliente fala com o servidor por `/__server` na própria página, e o Vite repassa ao servidor. Só a porta 3000 precisa estar acessível, o que facilita o celular na rede local, o Codespaces e túneis. Em produção nada muda (`VITE_SERVER_URL`).
- 14 traduções para as novas mensagens do núcleo.

### Corrigido
- No celular, a área do joystick cobria os botões do topo (☰ e ⛶). Agora os botões, o chat e a lista de jogadores ficam acima dessa área, e um teste ponta a ponta toca neles.

### Breaking
- `CORE_PROTOCOL_VERSION` passou para 3 (mensagens de chat) e `PROTOCOL_VERSION` do exemplo para 3 (`roster`).
- `GameContext` ganhou `audio` e `ui`. Jogos que montam o contexto à mão (testes) precisam incluí-los.
- `pnpm maps:validate` virou `pnpm content:validate`.

## 0.3.0

Pronto para produção: GamePush completo, contas verificadas, deploy, observabilidade, área de interesse e testes ponta a ponta.

### Novo
- **GamePush (cliente):**
  - o SDK é carregado pelas variáveis `VITE_GAMEPUSH_PROJECT_ID` e `VITE_GAMEPUSH_PUBLIC_TOKEN`, com fallback entre os servidores oficiais;
  - o jogo espera o jogador sincronizar antes de começar;
  - idioma e nome vêm do GamePush, e a troca de idioma no menu é repassada a ele;
  - `gameStart`, `gameplayStart` e `gameplayStop` são chamados nos momentos certos;
  - anúncios (`platform.ads`) e leaderboard (`platform.openLeaderboard`) ficam disponíveis para o jogo;
  - quando o GamePush pausa (durante um anúncio), o som é silenciado e o controle é liberado.
- **Contas verificadas:** o cliente envia um comprovante de identidade (`auth`) ao entrar. O `GameRoom` confere com o provedor registrado (`GamePushAccountProvider`, via Server API `GetPlayer`) e recusa comprovantes falsos. Sem provedor configurado, o jogador entra como convidado; `allowGuests = false` exige conta. Também vem o `GamePushServerApi` para outras chamadas da Server API.
- **Servidor de produção:**
  - variáveis de ambiente validadas ao iniciar;
  - logs estruturados (`log`), em JSON quando em produção;
  - `GET /metrics` no formato Prometheus, com duração dos ticks por sala (`startSimulation`);
  - `ALLOWED_ORIGINS` restringe quais sites podem conectar (WebSocket e CORS);
  - `MAX_PAYLOAD_BYTES` limita o tamanho das mensagens;
  - `/monitor` em produção, protegido por `MONITOR_PASSWORD`;
  - Redis opcional (`REDIS_URL`) para escala horizontal.
- **Área de interesse:** `SpatialHash` (`@core/shared`) e `InterestManager` (`@core/server`, usando `StateView`). Cada cliente recebe só as entidades próximas. O jogo de exemplo usa um raio de 400 px.
- **Deploy:**
  - `Dockerfile` enxuto, com healthcheck;
  - `infra/docker-compose.yml` (servidor + Redis);
  - `ecosystem.config.cjs` para PM2 e Colyseus Cloud;
  - `pnpm pack:client` gera o `.zip` para GamePush e itch.io;
  - workflow **Release** (imagem no GHCR, `.zip` no release, envio opcional ao itch.io).
- **Testes ponta a ponta:** `tools/e2e` com Playwright (multiplayer, menu de pausa, árabe RTL, joystick no celular), rodando na CI.
- `docs/DEPLOY.md`.

### Breaking
- `CORE_PROTOCOL_VERSION` passou para 2 (campo `auth` nas opções de entrada) e `PROTOCOL_VERSION` do exemplo para 2 (`players` com `.view()`). Clientes antigos recebem "nova versão disponível".
- A interface `Platform` ganhou `ads`, `setLanguage`, `getAuthPayload` e `onPauseChange`. Adaptadores próprios precisam implementá-los.
- `PlayerIdentity` ganhou o campo `verified`.
- Os pacotes do servidor usam `@colyseus/core` (mais `@colyseus/monitor` e `@colyseus/playground`) no lugar do pacote `colyseus`. Troque `from "colyseus"` por `from "@colyseus/core"`.
- Use `this.startSimulation(step, TICK_RATE)` no lugar de `setFixedTimestep` para ter métricas de tick.

## 0.2.0

Separação entre núcleo e jogo, e fluxo completo de cliente.

### Novo
- **Núcleo vs jogo:** `packages/core-{shared,maps,server,client}` (template) e `game/{shared,server,client}` (jogo). `apps/*` só ligam os dois.
- **Servidor:** classe base `GameRoom`, com checagem de versão do protocolo, identidade do jogador (`authenticate`, convidado por padrão), reconexão e limite de mensagens por segundo. Também `createGameServer` com `/health`, `/version`, `/monitor` e `/playground` (só em dev).
- **Cliente:** `startClient(gameModule)` cuida das telas (carregando, menu, conectando, reconectando, erros, nova versão, pausa, resultado), em DOM sobre o canvas.
- **Idiomas:** i18n em 14 línguas (en, pt, es, fr, de, it, tr, ru, ar, hi, id, ja, zh, ko), com plurais e árabe da direita para a esquerda. O idioma vem da escolha salva, depois da plataforma, depois do navegador.
- **Entrada:** teclado, controle (gamepad) e toque, com joystick virtual e botões de ação, juntos em `InputManager`.
- **Celular:** aviso para girar o aparelho, tela cheia, áreas seguras (notch), sem zoom ou rolagem acidental.
- **Plataforma:** `Platform` com idioma, nome e `gameplayStart`/`gameplayStop`. O adaptador do GamePush espera o SDK carregar.
- `sanitizeName` aceita todas as escritas e bloqueia caracteres de controle e de inversão de texto.
- `pnpm init-game`, `docs/TEMPLATE.md`, `CLAUDE.md` e `TEMPLATE_VERSION`.

### Breaking
- `packages/shared` e `packages/protocol` foram para `game/shared`. `packages/maps` virou `packages/core-maps`, agora `@core/maps`.
- Os clientes precisam enviar `v: { core, game }` ao entrar na sala (o núcleo do cliente faz isso sozinho).
- O painel de debug do Colyseus agora só aparece com `?debug` na URL.

## 0.1.0

- Monorepo inicial: Phaser 4 + Colyseus 0.18, movimento compartilhado com predição, mapas do Tiled lidos no servidor, bots, CI.
