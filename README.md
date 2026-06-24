# Pixel ART 256x256 + MCP + Bridge + Godot/Unity

Editor web para pixel art 256x256 com camadas, frames, spritesheets, preview animado, integração MCP por arquivo compartilhado e bridge HTTP/SSE.

## Instalar

```bash
npm install
```

## Rodar editor com integração MCP em tempo real

```bash
npm run dev
```

Isso sobe:

- `bridge`: `http://localhost:8787`
- `web`: Vite

O editor conecta na bridge por SSE. Quando o MCP altera `pixel-project.mcp.json`, o canvas atualiza sozinho.

## Rodar MCP

O MCP é stdio. Use na configuração do ChatGPT/Cursor/Claude com o mesmo `cwd` do projeto.

```json
{
  "mcpServers": {
    "pixel-art-256": {
      "command": "npx",
      "args": ["tsx", "server/mcp-server.ts"],
      "cwd": "/CAMINHO/DO/pixel-art-mcp",
      "env": {
        "PIXEL_PROJECT_PATH": "./pixel-project.mcp.json"
      }
    }
  }
}
```

## Fluxo Editor ↔ MCP

1. Abra o editor com `npm run dev`.
2. Configure o MCP apontando para o mesmo projeto.
3. Peça para a IA usar ferramentas como `draw_sprite_from_prompt`, `set_pixel`, `draw_rect`, `create_frame` ou `apply_project_json`.
4. O MCP grava `pixel-project.mcp.json`.
5. A bridge observa o arquivo e manda o projeto para o editor em tempo real.
6. O canvas, preview e timeline atualizam automaticamente.

## Implementado

- Integração real Editor ↔ MCP via bridge local HTTP/SSE.
- Preview visual automático da arte gerada pela IA/MCP.
- Spritesheets com múltiplos frames.
- Timeline com adicionar, duplicar, excluir, reordenar e selecionar frame.
- Preview animado com FPS e loop.
- Onion skin do frame anterior.
- Ferramentas: lápis, borracha, bucket, picker, seleção, dithering.
- Seleção: copiar, recortar, colar, mover, espelhar H/V, rotacionar 90° e aplicar dithering.
- Paletas: swatches, importar/exportar paleta, cores usadas, substituir cor global e limitar cores.
- Persistência backend local: projeto compartilhado, histórico, galeria e login local simplificado via endpoints.
- Painel de prompt no editor: aplica prompt no canvas. Com bridge ligada usa backend; sem bridge usa fallback local determinístico.
- Exportação: PNG por frame, spritesheet horizontal, atlas JSON, Godot JSON e Unity JSON.
- Controle de qualidade: limite de cores, detecção de fundo opaco e alerta de quadriculado falso.

## Ferramentas MCP

- `create_frame`
- `duplicate_frame`
- `set_active_frame`
- `create_layer`
- `set_pixel`
- `draw_rect`
- `draw_line`
- `clear_layer`
- `set_godot_metadata`
- `draw_sprite_from_prompt`
- `apply_project_json`
- `get_project_json`
- `get_godot_json`

## Endpoints da bridge

- `GET /api/events`: SSE para atualizações do projeto.
- `GET /api/project`: lê projeto atual.
- `POST /api/project`: salva projeto atual.
- `POST /api/ai-prompt`: aplica prompt heurístico e salva no projeto compartilhado.
- `POST /api/login`: login local simplificado.
- `GET /api/gallery`: lista galeria local.
- `POST /api/gallery`: salva projeto na galeria local.
- `GET /api/gallery/:id`: carrega projeto da galeria.
- `GET /api/history`: lista histórico local.

## Exportação para Godot 4

Arquivos exportados:

- `<asset>_<animation>_sheet.png`
- `<asset>_<animation>.atlas.json`
- `<asset>.animations.json`

Estrutura recomendada:

```txt
res://assets/<asset>/
├─ spritesheets/
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

## Observação importante

O painel de prompt interno não chama um LLM externo. Ele aplica um gerador local determinístico para validar fluxo visual, frames e integração. Para IA real, use o MCP configurado no cliente que suporta tools; o editor receberá as alterações automaticamente pela bridge.
