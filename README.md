# Pixel Art MCP

[![CI](https://github.com/svg-inline/pixel-art-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/svg-inline/pixel-art-editor/actions/workflows/ci.yml)

Editor web local-first para pixel art 256x256, com camadas, animações, bridge HTTP/SSE, ferramentas MCP, persistência SQLite e exportação para Godot 4 e Unity.

## Requisitos

- Node.js 22 (mesma versão usada no CI);
- npm 10 (gerenciador oficial; o projeto versiona somente `package-lock.json`);
- Godot 4.x apenas para usar o addon de importação.

## Setup rápido

Clone ou extraia o projeto e, na raiz, instale as dependências:

```bash
npm ci
```

Crie o arquivo local de configuração:

- Windows PowerShell: `Copy-Item .env.example .env`
- Linux/macOS: `cp .env.example .env`

Os valores de exemplo já funcionam em desenvolvimento local. Antes de expor a bridge ou usar `NODE_ENV=production`, substitua `troque-este-token-local` por um token próprio e mantenha o mesmo valor em `PIXEL_BRIDGE_TOKEN` e `VITE_PIXEL_BRIDGE_TOKEN`.

Inicie editor e bridge:

```bash
npm run dev
```

Abra `http://localhost:5173`. A bridge fica em `http://127.0.0.1:8787`. O terminal deve mostrar a URL, o caminho do SQLite e `ai=local-heuristic` quando nenhum provider externo estiver configurado.

## Scripts

| Comando | Função |
| --- | --- |
| `npm run web` | Inicia somente o Vite, acessível na rede local. |
| `npm run bridge` | Inicia somente a bridge HTTP/SSE. |
| `npm run mcp` | Inicia o servidor MCP por stdio; normalmente o cliente MCP executa este processo. |
| `npm run dev` | Inicia bridge e web juntos. |
| `npm run dev:all` | Inicia bridge, web e MCP; útil para diagnóstico, não para configurar um cliente MCP. |
| `npm run runtime:status` | Mostra caminhos e tamanhos dos arquivos locais. |
| `npm run runtime:migrate` | Migra dados legados e inicializa o runtime. |
| `npm run runtime:reset` | Faz backup e recria o projeto/banco locais. |
| `npm run typecheck` | Executa o typecheck padrão. |
| `npm run typecheck:strict` | Executa a configuração TypeScript estrita gradual. |
| `npm test` | Executa os testes Node. |
| `npm run test:e2e` | Executa os testes Playwright headless. |
| `npm run test:e2e:ui` | Abre a interface do Playwright. |
| `npm run test:e2e:debug` | Executa o Playwright em modo debug. |
| `npm run benchmark:render` | Mede o caminho crítico de renderização. |
| `npm run build` | Gera o frontend em `dist/`. |
| `npm run preview` | Serve o conteúdo de `dist/` localmente. |
| `npm run pack:clean` | Gera um ZIP limpo do código-fonte em `release/`. |

## Configuração

Bridge e MCP carregam `.env` da raiz sem sobrescrever variáveis já definidas pelo processo. Variáveis `VITE_*` são incorporadas ao frontend pelo Vite; reinicie `npm run web` após alterá-las.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PIXEL_BRIDGE_HOST` | `127.0.0.1` | Interface em que a bridge escuta. Mantenha local salvo necessidade explícita. |
| `PIXEL_BRIDGE_PORT` | `8787` | Porta HTTP/SSE da bridge. |
| `PIXEL_BRIDGE_TOKEN` | vazio em dev | Token aceito por `x-pixel-token`, Bearer ou query do SSE; obrigatório em produção. |
| `PIXEL_BRIDGE_ALLOWED_ORIGINS` | origens locais na porta `5173` | Lista CORS separada por vírgulas; não aceita curingas. |
| `PIXEL_BRIDGE_BODY_LIMIT` | `67108864` | Limite do corpo JSON em bytes. O exemplo reduz para 4 MiB. |
| `PIXEL_BRIDGE_DEV` | automático fora de produção | Use `1` apenas para desenvolvimento local sem token. |
| `VITE_PIXEL_BRIDGE_URL` | `http://localhost:8787` | URL usada pelo editor web. Deve acompanhar host/porta da bridge. |
| `VITE_PIXEL_BRIDGE_TOKEN` | vazio | Token enviado pelo editor; deve coincidir com o token da bridge. |
| `PIXEL_RUNTIME_DIR` | `./runtime` | Diretório-base dos caminhos locais padrão. |
| `PIXEL_SQLITE_PATH` | `./runtime/editor.sqlite` | Banco compartilhado por bridge e MCP. |
| `PIXEL_PROJECT_PATH` | `./runtime/pixel-project.mcp.json` | JSON legado/interoperabilidade usado em migrações. |
| `PIXEL_DB_PATH` | `./runtime/pixel-art-db.json` | Banco JSON legado usado em migrações. |
| `PIXEL_AI_ENDPOINT` | vazio | Ativa o provider HTTP externo. |
| `PIXEL_AI_API_KEY` | vazio | Bearer token enviado apenas pelo servidor ao provider externo. |
| `PIXEL_AI_TIMEOUT_MS` | `15000` | Timeout do provider externo em milissegundos. |
| `PIXEL_AI_MAX_RESPONSE_BYTES` | `2097152` | Tamanho máximo da resposta externa. |

Não versione `.env` nem coloque segredos em variáveis `VITE_*`: tudo que começa com `VITE_` pode chegar ao navegador. O token da bridge é uma proteção local, não uma credencial para serviços públicos.

## Bridge e editor

`npm run dev` é suficiente para o fluxo normal. O editor usa HTTP para leitura/escrita e SSE em `GET /api/events` para receber atualizações. Se mudar a porta, ajuste as duas pontas:

```dotenv
PIXEL_BRIDGE_PORT=8790
VITE_PIXEL_BRIDGE_URL=http://localhost:8790
PIXEL_BRIDGE_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Em produção, defina `NODE_ENV=production` e `PIXEL_BRIDGE_TOKEN`; a bridge recusa iniciar sem token. Evite publicar a bridge na internet: ela foi projetada para uso local.

## MCP

O MCP usa stdio. Ele não chama nem autentica na bridge: ambos sincronizam o projeto pelo mesmo `PIXEL_SQLITE_PATH`. Feche bridge e MCP antes de trocar ou resetar esse caminho.

Depois de `npm ci`, configure seu cliente MCP com caminho absoluto para esta pasta:

```json
{
  "mcpServers": {
    "pixel-art-mcp": {
      "command": "npx",
      "args": ["--no-install", "tsx", "server/mcp-server.ts"],
      "cwd": "/caminho/absoluto/pixel-art-mcp",
      "env": {
        "PIXEL_SQLITE_PATH": "./runtime/editor.sqlite"
      }
    }
  }
}
```

No Windows, use um caminho JSON válido, por exemplo `C:\\dev\\pixel-art-mcp`. Reinicie o cliente após alterar a configuração. Se bridge e MCP tiverem `cwd` diferentes, prefira um `PIXEL_SQLITE_PATH` absoluto para garantir que usem o mesmo banco.

As ferramentas incluem geração/edição com preview, seleção de assets, QA, PNG/spritesheet e metadata Godot, atlas e Unity. Mudanças de MCP aparecem no editor pela bridge/SSE quando os três processos apontam para o mesmo SQLite.

## IA externa e fallback local

Sem `PIXEL_AI_ENDPOINT`, o projeto usa `local-heuristic`: um gerador determinístico para desenvolvimento e testes. Ele não é IA generativa real.

Com `PIXEL_AI_ENDPOINT`, bridge e MCP enviam um `POST application/json` ao provider externo. Se a chamada falhar, exceder limites ou retornar dados inválidos, o resultado usa o fallback heurístico e continua identificado como `heuristic`; nunca é apresentado como saída externa. A alteração permanece em preview até ser aceita.

Exemplo:

```dotenv
PIXEL_AI_ENDPOINT=http://127.0.0.1:9000/generate
PIXEL_AI_API_KEY=substitua-por-uma-chave-local
PIXEL_AI_TIMEOUT_MS=15000
PIXEL_AI_MAX_RESPONSE_BYTES=2097152
```

O contrato completo de request, response, validação e auditoria está em [docs/ai-provider-contract.md](docs/ai-provider-contract.md).

## Exportações

No painel **Godot / Unity**, escolha o asset, animação e perfil, corrija erros de QA e use:

- **Spritesheet** para `<asset>_<animation>_sheet.png`;
- **Atlas JSON** para `<asset>_<animation>.atlas.json`;
- **Godot JSON** para `<asset>.animations.json`;
- **Unity JSON** para `<asset>_<animation>.unity.json`;
- **ZIP pacote** para PNG do frame, spritesheets e metadata Godot/Unity/atlas/Aseprite/tilemap.

O export Unity entrega spritesheet e metadata, mas não instala um importer no Unity. Importe o PNG como sprite, use filtro Point/no compression e consuma o JSON no seu pipeline. Para Godot, o addon automatiza download, import pixel-perfect e criação de `SpriteFrames`; consulte [godot/README-GODOT.md](godot/README-GODOT.md).

O ZIP do painel contém o asset. Para distribuir o código-fonte sem dados locais, use o pacote limpo:

```bash
npm run pack:clean
```

O resultado é `release/pixel-art-mcp-<versao>.zip`, sem `.git`, `.env`, `node_modules`, `dist`, runtime, bancos, backups, exports ou ZIPs anteriores.

## Runtime e banco local

Por padrão, bridge e MCP usam:

- `runtime/editor.sqlite`: estado atual, histórico, galeria, previews e auditoria;
- `runtime/editor.sqlite-wal` e `runtime/editor.sqlite-shm`: arquivos auxiliares temporários do SQLite;
- `runtime/pixel-project.mcp.json` e `runtime/pixel-art-db.json`: formatos legados para migração/interoperabilidade;
- `runtime/backups/`: backups criados por migração/reset;
- `runtime/exports/`: exports locais quando um fluxo de servidor os gerar.

Esse conteúdo é local e ignorado pelo Git. Confira os caminhos resolvidos com `npm run runtime:status`. `npm run runtime:reset` preserva backup, mas substitui o estado ativo; não o execute com bridge ou MCP abertos.

## Godot 4

O setup testável do addon, a estrutura de saída e a validação manual estão em [godot/README-GODOT.md](godot/README-GODOT.md). Em resumo: copie `godot/addons/pixel_art_mcp` para `res://addons/`, ative **Pixel Art MCP**, deixe a bridge rodando e use o dock para listar e importar um asset.

## Troubleshooting

| Sintoma | Verificação |
| --- | --- |
| `npm ci` falha por versão/lockfile | Use Node 22, npm 10 e o `package-lock.json` versionado; não misture Yarn/Pnpm. |
| Editor abre, mas mostra bridge offline | Confirme `npm run bridge`, `VITE_PIXEL_BRIDGE_URL` e a porta mostrada no terminal. Reinicie o Vite após mudar `.env`. |
| HTTP 401 ou SSE desconecta | Igualar `PIXEL_BRIDGE_TOKEN` e `VITE_PIXEL_BRIDGE_TOKEN`; no dock Godot, preencher o mesmo token. |
| Erro de CORS | Inclua exatamente a origem do navegador em `PIXEL_BRIDGE_ALLOWED_ORIGINS`, com protocolo e porta. |
| MCP e editor mostram projetos diferentes | Verifique `cwd` e `PIXEL_SQLITE_PATH` com `npm run runtime:status`; use caminho absoluto nos dois processos. |
| Prompt funciona, mas não usa IA real | Confira no log se `ai=local-heuristic`; defina `PIXEL_AI_ENDPOINT` e valide o contrato do provider. Falhas externas acionam fallback explícito. |
| Godot não lista assets | Inicie a bridge, confirme URL/token no dock e teste primeiro o editor web. |
| Godot não exibe o plugin | Confirme `res://addons/pixel_art_mcp/plugin.cfg`, use Godot 4.x e veja erros de parser no painel **Output**. |
| Exportação é bloqueada | Leia o resultado de QA no painel; divergência de pixels e erros do perfil impedem o download. |
| Porta `8787` ou `5173` ocupada | Encerre o processo conflitante ou altere porta e URLs/CORS em conjunto. |

Atalhos do editor: [docs/editor-shortcuts.md](docs/editor-shortcuts.md). Antes de enviar mudanças, rode:

```bash
npm run typecheck
npm test
npm run build
```
