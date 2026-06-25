# Pixel ART 256x256 + MCP + Bridge + Godot/Unity

Editor web local-first para pixel art 256x256 com camadas, frames, spritesheets, preview animado, bridge HTTP/SSE, ferramentas MCP e exportação para Godot/Unity.

## Instalar

```bash
npm install
```

## Rodar editor com integração em tempo real

```bash
npm run dev
```

Isso sobe:

- bridge local: `http://127.0.0.1:8787`
- web: Vite

O editor conecta na bridge por SSE. Quando o MCP altera o projeto compartilhado, o canvas, timeline e preview animado atualizam automaticamente.

Para rodar com token local, copie `.env.example` para `.env`, troque `PIXEL_BRIDGE_TOKEN` e use o mesmo valor em `VITE_PIXEL_BRIDGE_TOKEN`.

## Rodar MCP

Use no ChatGPT/Cursor/Claude com o mesmo `cwd` do projeto.

```json
{
  "mcpServers": {
    "pixel-art-256": {
      "command": "npx",
      "args": ["tsx", "server/mcp-server.ts"],
      "cwd": "/CAMINHO/DO/pixel-art-mcp",
      "env": {
        "PIXEL_PROJECT_PATH": "./runtime/pixel-project.mcp.json",
        "PIXEL_DB_PATH": "./runtime/pixel-art-db.json",
        "PIXEL_BRIDGE_TOKEN": "mesmo-token-da-bridge"
      }
    }
  }
}
```

## Dados locais e runtime

Por padrão, a bridge e o MCP gravam dados locais em `runtime/`:

- `runtime/pixel-project.mcp.json`: projeto compartilhado atual.
- `runtime/pixel-art-db.json`: galeria, usuários locais e histórico compacto.
- `runtime/backups/`: backups criados antes de migrações ou resets.

Esses arquivos são gerados em runtime e não entram no Git. Se arquivos legados existirem na raiz (`pixel-project.mcp.json` ou `pixel-art-db.json`), a bridge/MCP os migram para `runtime/` na primeira execução e criam backup antes de mover.

Comandos úteis:

```bash
npm run runtime:status   # mostra caminhos e tamanhos
npm run runtime:migrate  # migra arquivos legados e cria arquivos iniciais
npm run runtime:reset    # faz backup e recria projeto/db vazios
```

## O que foi atualizado nesta versão

- `shared/pixel-core.ts` virou o núcleo comum: schema v2 com assets/animações/direções, normalização, migração de projetos antigos, RLE compacto, geração heurística, edição, paleta, QA, metadata Godot/Unity e composição RGBA.
- Bridge reescrita com escrita atômica, fila de escrita, projeto em formato compacto no disco, leitura expandida para o editor, body limit e bind local em `127.0.0.1`.
- Camada `server/ai/provider.ts`: usa provider local por padrão e aceita um provider HTTP externo via `PIXEL_AI_ENDPOINT` / `PIXEL_AI_API_KEY`.
- MCP ganhou ferramentas reais de workflow: geração, edição por seleção, variação, recolor, limite de paleta, preview PNG base64, spritesheet PNG base64 e pacote Godot.
- Web agora lê JSON compacto, envia seleção/operação no prompt e continua com fallback local quando a bridge está offline.
- Godot ganhou addon real em `godot/addons/pixel_art_mcp/` com dock para prompt, metadata e criação de `SpriteFrames`.
- Dependências foram pinadas e foram adicionados `tsconfig.json`, `.gitignore` e `runtime/` para arquivos locais gerados.

## Ferramentas MCP principais

- `generate_pixel_art`
- `draw_sprite_from_prompt`
- `edit_pixel_art`
- `edit_selection`
- `replace_subject`
- `create_variation`
- `recolor_palette`
- `limit_palette`
- `extend_animation`
- `set_active_asset`
- `set_active_animation`
- `create_animation`
- `get_preview_png`
- `get_spritesheet_png`
- `export_godot_asset`
- `quality_report`
- `get_project_json`
- `get_project_compact_json`
- `get_godot_json`
- `get_atlas_json`
- `get_unity_json`

## Endpoints da bridge

- `GET /api/events`: SSE para atualizações do projeto.
- `GET /api/project`: lê projeto expandido.
- `GET /api/project.compact`: lê projeto compacto RLE.
- `GET /api/assets`: lista assets/animações disponíveis.
- `POST /api/project`: salva projeto.
- `POST /api/ai-prompt`: aplica prompt com `operation`, `project` e `selection`.
- `POST /api/ai-preview`: gera proposta sem aplicar.
- `POST /api/ai-preview/:id/accept`: aplica uma proposta validada.
- `DELETE /api/ai-preview/:id`: descarta uma proposta.
- `POST /api/tools/edit-selection`: edita seleção.
- `POST /api/tools/recolor-palette`: substitui cor global.
- `POST /api/tools/limit-colors`: limita paleta.
- `POST /api/tools/create-variation`: cria variação.
- `POST /api/tools/extend-animation`: estende animação.
- `POST /api/tools/set-active-asset`: seleciona o asset ativo para exportação/importação Godot.
- `GET /api/preview.png`: preview PNG do frame.
- `GET /api/spritesheet.png`: spritesheet horizontal PNG.
- `GET /api/godot/spritesheet.png`: spritesheet PNG do asset ativo, com uma linha por animação.
- `GET /api/export/godot`: metadata Godot.
- `GET /api/export/atlas`: atlas JSON.
- `GET /api/export/unity`: metadata Unity.
- `GET /api/quality`: relatório de QA.
- `GET/POST /api/gallery`: galeria local.
- `GET /api/history`: histórico local.

## Provider de IA externo

Por padrão, o projeto usa um gerador local determinístico para validar fluxo, edição e integração. Esse fallback é heurístico; ele não deve ser apresentado como IA real. Para conectar IA externa, suba um endpoint HTTP e configure `PIXEL_AI_ENDPOINT`.

A bridge envia prompt, projeto compacto, seleção, paleta e constraints:

```json
{
  "prompt": "crie personagem idle oeste",
  "operation": "generate",
  "project": { "format": "pixel-art-compact-v1" },
  "selection": {"x": 80, "y": 60, "w": 64, "h": 96},
  "palette": ["#111827", "#f59e0b"],
  "constraints": {
    "size": 256,
    "maxColors": 32,
    "preserveOutsideSelection": true
  }
}
```

O endpoint deve responder JSON com um destes formatos:

```json
{ "provider": "meu-provider", "model": "pixel-model", "project": {} }
```

```json
{
  "diff": {
    "frameIndex": 0,
    "layerName": "Base",
    "changes": [{ "x": 120, "y": 80, "color": "#f59e0b" }]
  }
}
```

```json
{ "frames": [{ "name": "Frame 1", "layers": [] }] }
```

Respostas inválidas são rejeitadas por Zod e não sobrescrevem o projeto. A saída é pós-processada para manter tamanho 256x256, alpha como transparência, paleta/limite de cores e bounds da seleção quando a operação preserva seleção.

Depois rode:

```bash
PIXEL_AI_ENDPOINT="http://127.0.0.1:9000/generate" PIXEL_AI_API_KEY="opcional" npm run bridge
```

## Segurança local

A bridge escuta por padrão em `127.0.0.1`, restringe CORS às origens do editor (`http://localhost:5173` e `http://127.0.0.1:5173`) e aplica limite de body nas rotas JSON.

Modo dev:

- Com `NODE_ENV` diferente de `production`, a bridge pode iniciar sem token para facilitar desenvolvimento local.
- Mesmo sem token, CORS não usa `*`; páginas fora das origens permitidas são bloqueadas.

Modo seguro:

```bash
NODE_ENV=production PIXEL_BRIDGE_TOKEN="um-token-local" npm run bridge
```

Nesse modo, `PIXEL_BRIDGE_TOKEN` é obrigatório. Envie `x-pixel-token` ou `Authorization: Bearer <token>` nas chamadas HTTP. Para SSE, `EventSource` não permite header customizado, então o editor envia `?token=<token>` quando `VITE_PIXEL_BRIDGE_TOKEN` está configurado.

Para permitir outra origem do editor:

```bash
PIXEL_BRIDGE_ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
```

Observação: token em query string pode aparecer em logs. Para uma versão profissional, prefira sessão local ou cookie HttpOnly.

## Exportação para Godot 4

Arquivos exportados:

- `<asset>_<animation>_sheet.png`
- `<asset>_sheet.png`
- `<asset>_<animation>.atlas.json`
- `<asset>.animations.json`
- `<asset>.spriteframes.tres` gerado pelo addon/script dentro do Godot

Estrutura recomendada:

```txt
res://assets/<asset>/
├─ spritesheets/
│  ├─ <asset>_sheet.png
│  └─ <asset>_<animation>_sheet.png
└─ metadata/
   ├─ <asset>_<animation>.atlas.json
   └─ <asset>.animations.json
```

Configuração de importação no Godot:

- Filter: Off
- Mipmaps: Off
- Repeat: Disabled
- Compression: Lossless

## Testado

```bash
npm run build
```

Também foi validado que a bridge gera projeto por prompt, exporta metadata Godot e serve preview PNG.
