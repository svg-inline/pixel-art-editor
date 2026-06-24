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
- atualizar metadata Godot exportada pelo backend;
- criar `SpriteFrames .tres` a partir do spritesheet e do JSON.

Estrutura esperada no projeto Godot:

```txt
res://assets/<asset>/
├─ spritesheets/
│  └─ <asset>_<animation>_sheet.png
└─ metadata/
   ├─ <asset>_<animation>.atlas.json
   └─ <asset>.animations.json
```

## 2. Script direto

`godot/import_pixel_art_metadata.gd` continua disponível para uso manual.

Configuração de importação da textura:

- Filter: Off
- Mipmaps: Off
- Repeat: Disabled
- Compression: Lossless
