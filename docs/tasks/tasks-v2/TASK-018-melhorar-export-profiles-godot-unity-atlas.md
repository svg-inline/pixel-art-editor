# TASK-018 — Melhorar export profiles para Godot, Unity e atlas

Prioridade: P2  
Área: Exportação / Game Pipeline  
Tipo: Feature profissional  
Status inicial: Backlog

## Objetivo

Padronizar perfis de exportação para engines e formatos, com metadata consistente e validação antes de gerar arquivos.

## Contexto técnico

O projeto já exporta diversos formatos, mas precisa consolidar perfis para evitar divergência entre PNG, spritesheet, atlas JSON, Godot JSON, Unity JSON, Aseprite JSON, GIF/WebP e ZIP.

## Arquivos prováveis

- `shared/export-godot.ts`
- `shared/export-unity.ts`
- `shared/export-aseprite.ts`
- `shared/export-atlas.ts`
- `shared/schemas.ts`
- `web/components/ExportPanel.tsx`
- `tests/**/*.test.ts`

## Dependências

- TASK-013
- TASK-015

## Checklist

- [ ] Definir schema de `ExportProfile`.
- [ ] Criar presets: `generic_png`, `spritesheet_grid`, `godot_4`, `unity_2d`, `aseprite_json`, `web_preview`.
- [ ] Permitir configurar escala, padding, spacing, trim/crop e background.
- [ ] Garantir nearest-neighbor em escalas inteiras.
- [ ] Gerar metadata consistente para animações, frames, direções, pivot e boxes.
- [ ] Validar projeto antes do export conforme perfil.
- [ ] Criar ZIP com PNG + JSON + README curto do export.
- [ ] Adicionar testes snapshot de metadata.
- [ ] Adicionar teste comparando dimensões esperadas de spritesheet.

## Critérios de aceite

- [ ] Cada perfil gera arquivos previsíveis.
- [ ] Godot e Unity recebem metadata compatível com suas necessidades.
- [ ] Spritesheet tem dimensões corretas com padding/spacing.
- [ ] Export respeita animação/direção selecionada.
- [ ] ZIP final contém todos os arquivos necessários e nada de runtime interno.
- [ ] Testes cobrem pelo menos Godot, Unity e spritesheet genérico.

## O que não deve ser feito

- [ ] Não criar um export diferente para cada botão sem schema comum.
- [ ] Não usar interpolação suave em escala de pixel art.
- [ ] Não misturar metadata de engine com modelo interno sem camada de adaptação.
- [ ] Não exportar arquivos temporários no ZIP final.
- [ ] Não ignorar QA visual quando perfil exige validação.

## Presets mínimos

```txt
generic_png
spritesheet_grid
godot_4
unity_2d
aseprite_json
web_preview
```

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.
