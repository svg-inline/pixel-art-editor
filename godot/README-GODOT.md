# Godot 4 — Pixel Art MCP

Agora existem duas formas de importar.

## 1. Addon com dock

Copie a pasta:

```txt
godot/addons/pixel_art_mcp/
```

para o seu projeto Godot em:

```txt
res://addons/pixel_art_mcp/
```

Ative em `Project > Project Settings > Plugins > Pixel Art MCP`.

O dock permite:

- enviar prompt para a bridge local `http://127.0.0.1:8787`;
- listar assets disponíveis na bridge;
- exibir preview PNG;
- atualizar metadata Godot exportada pelo backend;
- importar o asset completo, baixando spritesheet PNG e metadata;
- criar `SpriteFrames .tres` com animações, FPS e loop do metadata.

Estrutura esperada no projeto Godot:

```txt
res://assets/<asset>/
├─ spritesheets/
│  ├─ <asset>_sheet.png
│  ├─ <asset>_sheet.png.pixel_art_import.json
│  └─ <asset>_<animation>_sheet.png
└─ metadata/
   ├─ <asset>_<animation>.atlas.json
   └─ <asset>.animations.json
```

O import ajusta `rendering/textures/canvas_textures/default_texture_filter` para nearest/pixel-perfect e salva um JSON lateral com as configurações de importação esperadas. O metadata preserva duração dos frames, pivot e hitboxes/hurtboxes/attackboxes quando existirem.

## 2. Script direto

`godot/import_pixel_art_metadata.gd` continua disponível para uso manual.

Configuração de importação da textura:

- Filter: Off
- Mipmaps: Off
- Repeat: Disabled
- Compression: Lossless
