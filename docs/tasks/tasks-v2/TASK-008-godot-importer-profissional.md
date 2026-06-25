# TASK-008 — Criar importação Godot profissional

Prioridade: P1  
Área: Godot / Game Pipeline  
Tipo: Feature profissional  
Status inicial: Backlog

## Objetivo

Transformar o addon Godot em pipeline real de importação de spritesheets, animações e metadata pixel-perfect.

## Contexto técnico

O addon atual é útil como prova de integração, mas ainda não resolve importação profissional. Ele precisa baixar asset da bridge, aplicar configurações corretas de textura e criar recursos prontos para uso no Godot.

## Arquivos prováveis

- `godot/addons/pixel_art_mcp/pixel_art_mcp_plugin.gd`
- `godot/addons/pixel_art_mcp/plugin.cfg`
- `godot/import_pixel_art_metadata.gd`
- `godot/README-GODOT.md`
- `server/bridge-server.ts`
- `shared/export-godot.ts`

## Dependências

- TASK-001
- TASK-007

## Checklist

- [ ] Criar dock do plugin com lista de assets disponíveis na bridge.
- [ ] Exibir preview do asset antes da importação.
- [ ] Permitir escolher pasta destino dentro do projeto Godot.
- [ ] Baixar PNG/spritesheet e metadata JSON da bridge.
- [ ] Salvar arquivos importados em estrutura previsível.
- [ ] Aplicar import settings: filter off, mipmaps off, repeat disabled, compression lossless quando possível.
- [ ] Gerar `SpriteFrames` para animações frame-based.
- [ ] Importar FPS, loop e duração por frame.
- [ ] Importar pivot/origin quando existir.
- [ ] Importar hitbox/hurtbox/attackbox como metadata ou cenas auxiliares.
- [ ] Adicionar botão de reimportação.
- [ ] Adicionar mensagens de erro claras quando bridge estiver offline.

## Critérios de aceite

- [ ] Usuário consegue importar asset sem copiar arquivo manualmente.
- [ ] Sprites entram pixel-perfect no Godot.
- [ ] Animações aparecem em `SpriteFrames` com nomes corretos.
- [ ] Metadata de pivot e boxes é preservada.
- [ ] Reimportar atualiza arquivos sem duplicar recursos quebrados.
- [ ] Bridge offline mostra erro claro, não stack trace.

## O que não deve ser feito

- [ ] Não alterar configuração global do projeto Godot como substituto de import settings por arquivo, salvo quando documentado como fallback.
- [ ] Não depender de caminhos absolutos locais.
- [ ] Não importar textura com filtro bilinear.
- [ ] Não criar recursos sem nomes previsíveis.
- [ ] Não misturar Godot 3 e Godot 4 no mesmo script sem compatibilidade explícita.

## Estrutura de importação sugerida

```txt
res://assets/pixel_art/<asset_slug>/
  <asset_slug>.png
  <asset_slug>.json
  <asset_slug>_spriteframes.tres
```

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.
