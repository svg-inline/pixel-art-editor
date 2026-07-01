# TASK-018 — Melhorar export profiles para Godot, Unity e atlas

Prioridade: P2  
Área: Exportação / Game Pipeline  
Tipo: Feature profissional  
Status: Concluída em 2026-06-30

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

- [x] Definir schema de `ExportProfile`.
- [x] Criar presets: `generic_png`, `spritesheet_grid`, `godot_4`, `unity_2d`, `aseprite_json`, `web_preview`.
- [x] Permitir configurar escala, padding, spacing, trim/crop e background.
- [x] Garantir nearest-neighbor em escalas inteiras.
- [x] Gerar metadata consistente para animações, frames, direções, pivot e boxes.
- [x] Validar projeto antes do export conforme perfil.
- [x] Criar ZIP com PNG + JSON + README curto do export.
- [x] Adicionar testes snapshot de metadata.
- [x] Adicionar teste comparando dimensões esperadas de spritesheet.

## Critérios de aceite

- [x] Cada perfil gera arquivos previsíveis.
- [x] Godot e Unity recebem metadata compatível com suas necessidades.
- [x] Spritesheet tem dimensões corretas com padding/spacing.
- [x] Export respeita animação/direção selecionada.
- [x] ZIP final contém todos os arquivos necessários e nada de runtime interno.
- [x] Testes cobrem pelo menos Godot, Unity e spritesheet genérico.

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

## Resultado da implementação

- `ExportProfile` passou a ter schema Zod canônico, migração dos perfis antigos e os seis presets mínimos.
- PNG, spritesheet, WebP, GIF, atlas, Godot, Unity, Aseprite e ZIP usam configuração comum de escala inteira, padding, spacing, trim/crop, fundo, escopo e direções.
- Um plano único de spritesheet define tanto o canvas quanto os retângulos dos metadados. Pivôs e boxes mantêm coordenadas de origem e também recebem coordenadas transformadas para o frame exportado.
- O pacote ZIP por preset contém somente spritesheet PNG, metadata JSON adaptada e `README.md`; o projeto interno do editor não é incluído.
- O painel permite escolher e configurar cada preset, enquanto o preflight combina validação estrutural, QA do perfil e paridade do PNG.

O addon e o projeto em `godot/` não foram alterados. O comportamento esperado permanece: importar a textura com filtro e mipmaps desativados, usando os retângulos, durações, direções, pivôs e boxes do JSON. Por não haver mudança no runtime/addon Godot, não foi necessário abrir e regravar o projeto no editor.

Validação executada em 30/06/2026:

```text
npm run typecheck        OK
npm run typecheck:strict OK
npm test                 OK (103 testes)
npm run build            OK
npm run test:e2e         OK (16 fluxos Chromium)
```
