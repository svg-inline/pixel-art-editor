# TASK-012 — Implementar ferramentas e UX de editor profissional

Prioridade: P2  
Área: Frontend / UX / Ferramentas  
Tipo: Feature profissional  
Status: Concluída em 2026-06-29

## Objetivo

Adicionar ferramentas de edição que tornam o editor usável para produção real, não apenas geração/preview.

## Contexto técnico

O editor já possui seleção, linha, retângulo e elipse, mas ainda faltam recursos comuns de produtividade: pan/zoom decente, atalhos configuráveis, lock alpha, lock layer, merge down, simetria, magic wand e lasso.

## Arquivos prováveis

- `web/components/CanvasEditor.tsx`
- `web/components/Toolbar.tsx`
- `web/components/LayerPanel.tsx`
- `web/hooks/useCanvasInput.ts`
- `web/hooks/useKeyboardShortcuts.ts`
- `shared/selection.ts`
- `shared/raster.ts`

## Dependências

- TASK-004
- TASK-005
- TASK-009

## Checklist

- [x] Implementar pan com spacebar ou botão central.
- [x] Implementar zoom centrado no cursor.
- [x] Criar sistema de atalhos configuráveis ou pelo menos documentados.
- [x] Adicionar lock alpha por camada.
- [x] Adicionar lock layer.
- [x] Adicionar merge down.
- [x] Adicionar ferramenta de simetria horizontal/vertical.
- [x] Adicionar magic wand baseada em cor/contiguidade.
- [x] Adicionar lasso ou seleção livre simplificada.
- [x] Adicionar brush preview antes de aplicar.
- [x] Adicionar resize canvas e crop por bounds.
- [x] Garantir acessibilidade mínima em botões e atalhos.

## Critérios de aceite

- [x] Usuário edita com zoom/pan sem perder precisão de pixel.
- [x] Lock alpha impede alteração em pixels transparentes.
- [x] Lock layer impede edição acidental.
- [x] Merge down preserva composição visual.
- [x] Magic wand seleciona área esperada por cor/contiguidade.
- [x] Atalhos principais estão documentados.
- [x] Testes cobrem pelo menos lock alpha, merge down e seleção.

## O que não deve ser feito

- [x] Não adicionar todas as ferramentas em um único PR sem divisão interna.
- [x] Não usar antialiasing em ferramentas pixel art.
- [x] Não alterar pixels em camada bloqueada.
- [x] Não fazer resize com interpolação suave por padrão.
- [x] Não esconder atalhos sem documentação.

## Subtasks sugeridas

```txt
12A - Pan/zoom/atalhos
12B - Lock alpha/layer/merge down
12C - Simetria/magic wand/lasso
12D - Resize/crop/brush preview
```

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.

## Resultado

- Pan com pointer capture por espaço/botão central e zoom de 1× a 16× ancorado no cursor.
- Locks de camada/alfa retrocompatíveis no modelo, schema, raster, paleta, seleção e diffs MCP/IA.
- Merge down, simetria H/V, varinha contígua, laço livre e seleção mascarada no core compartilhado.
- Preview de pincel e operações de resize/crop por bounds com nearest-neighbor no canvas fixo de 256×256.
- Controles com nomes/estados ARIA, foco visível, alvos mínimos e atalhos documentados em `docs/editor-shortcuts.md`.

Validação executada em 2026-06-29:

```txt
npm run typecheck  OK
npm test           86 testes OK
npm run build      OK
npm run test:e2e   13 testes Chromium OK
```
