# Exportação Godot 4

O editor exporta spritesheet horizontal com múltiplos frames e metadata JSON.

Estrutura recomendada:

```txt
res://assets/<asset>/
├─ spritesheets/
│  └─ <asset>_<animation>_sheet.png
└─ metadata/
   └─ <asset>.animations.json
```

Configuração de importação da textura:

- Filter: Off
- Mipmaps: Off
- Repeat: Disabled
- Compression: Lossless

No Godot 4, selecione o PNG, abra Import, desative Filter/Mipmaps e clique em Reimport.

Use `godot/import_pixel_art_metadata.gd` para criar um `SpriteFrames .tres` a partir do JSON exportado.
