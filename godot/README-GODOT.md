# Godot 4 — addon Pixel Art MCP

O addon conecta o editor Godot 4 à bridge local, baixa o spritesheet e a metadata do asset selecionado e cria um recurso `SpriteFrames` com FPS, loop e regiões corretas.

## Pré-requisitos

- Godot 4.x;
- projeto Pixel Art MCP instalado com `npm ci`;
- bridge ativa com `npm run bridge` (ou `npm run dev`).

## Instalação

Copie a pasta completa:

```txt
godot/addons/pixel_art_mcp/
```

para o projeto Godot:

```txt
res://addons/pixel_art_mcp/
├── pixel_art_mcp_plugin.gd
└── plugin.cfg
```

No Godot, abra **Project > Project Settings > Plugins**, localize **Pixel Art MCP** e altere o status para **Enable**. O dock **Pixel Art MCP** aparece no lado direito do editor.

## Conexão e importação

1. Inicie a bridge na raiz deste repositório com `npm run bridge`.
2. No dock, mantenha **Bridge URL** como `http://127.0.0.1:8787`, salvo se você alterou `PIXEL_BRIDGE_PORT`.
3. Se `PIXEL_BRIDGE_TOKEN` estiver definido, informe exatamente o mesmo valor no campo **Token**.
4. Clique em **Listar assets da bridge** e selecione um asset.
5. Opcionalmente, clique em **Exibir spritesheet do asset**.
6. Escolha a pasta-base de destino. O padrão é `res://assets/pixel_art`.
7. Clique em **Importar asset**. Para substituir arquivos já existentes, use **Reimportar (sobrescrever)**.

Com o destino padrão e um asset chamado `hero`, o addon cria:

```txt
res://assets/pixel_art/hero/
├── hero.png
├── hero.png.import
├── hero.json
├── hero_collision.json       # somente quando houver dados de colisão
└── hero_spriteframes.tres
```

O addon configura a textura como lossless, sem mipmaps e apropriada para pixel art antes de pedir a reimportação. O `SpriteFrames` preserva animações, FPS e loop informados pela metadata; colisões, hurtboxes e attackboxes ficam no JSON lateral quando existirem.

## Validação rápida

Uma instalação válida deve cumprir estes passos sem erro:

1. **Pixel Art MCP** aparece e pode ser ativado sem erro de parser.
2. **Listar assets da bridge** exibe ao menos o asset atual.
3. **Exibir spritesheet do asset** mostra o preview no dock.
4. **Importar asset** cria o PNG, o JSON e o `.tres` na pasta escolhida.
5. Ao abrir o `.tres` no Inspector, as animações esperadas aparecem com FPS e loop corretos.
6. Ao usar o recurso em um `AnimatedSprite2D`, a textura permanece nítida, sem interpolação visual.

## Uso do SpriteFrames

Adicione um `AnimatedSprite2D` à cena e arraste `<asset>_spriteframes.tres` para a propriedade **Sprite Frames**. Escolha a animação no Inspector ou por GDScript:

```gdscript
@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

func _ready() -> void:
    sprite.play("idle")
```

## Script manual

`godot/import_pixel_art_metadata.gd` permanece disponível para fluxos manuais. Ao importar texturas sem o addon, configure:

- Filter: Off;
- Mipmaps: Off;
- Repeat: Disabled;
- Compression: Lossless.

## Troubleshooting

| Sintoma | Ação |
| --- | --- |
| Plugin não aparece | Confirme que `plugin.cfg` está exatamente em `res://addons/pixel_art_mcp/plugin.cfg` e reabra o projeto. |
| Erro de parser ao ativar | Confirme que o projeto usa Godot 4.x e consulte o painel **Output**. |
| `Bridge offline` | Inicie `npm run bridge` e confira URL/porta no dock. |
| HTTP 401 | Preencha no dock o mesmo `PIXEL_BRIDGE_TOKEN` usado pela bridge. |
| Lista de assets vazia | Abra o editor web, crie/confirme um asset e tente listar novamente. |
| Arquivo já importado | Use **Reimportar (sobrescrever)** somente se quiser substituir a versão local. |
| PNG existe, mas `.tres` não | Aguarde a importação do filesystem e procure erros de gravação/import no painel **Output**. |
