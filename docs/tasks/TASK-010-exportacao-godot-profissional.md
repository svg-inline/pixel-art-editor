# TASK-010 — Melhorar exportação Godot

Prioridade: P1  
Área: Game pipeline / Godot  
Tipo: Feature profissional

## Objetivo

Transformar a exportação Godot em pipeline utilizável de verdade: PNG/spritesheet, atlas, metadata, import settings e criação de `SpriteFrames`.

## Problema

O addon Godot atual é básico. Falta puxar PNG da bridge, importar automaticamente e criar recursos prontos para usar no Godot.

## Arquivos prováveis

- `godot/addons/pixel_art_mcp/plugin.gd`
- `godot/addons/pixel_art_mcp/*.gd`
- `server/bridge-server.ts`
- `shared/export-godot.ts`
- `web/App.tsx`

## Checklist

- [ ] Criar addon com `EditorPlugin`.
- [ ] Criar dock no Godot.
- [ ] Listar assets disponíveis na bridge.
- [ ] Exibir preview.
- [ ] Botão importar asset.
- [ ] Baixar PNG/spritesheet da bridge.
- [ ] Gerar `.tres` ou `SpriteFrames`.
- [ ] Aplicar import settings pixel-perfect.
- [ ] Importar metadata de animações.
- [ ] Importar pivot/origin.
- [ ] Importar hitbox/hurtbox/attackbox quando existir.
- [ ] Criar perfil de exportação Godot.
- [ ] Documentar instalação do addon.

## Critérios de aceite

- Godot mostra dock do plugin.
- Usuário consegue importar um asset gerado no editor.
- Spritesheet entra com filtro nearest/pixel-perfect.
- Animações aparecem como `SpriteFrames`.
- Metadata JSON acompanha PNG.
