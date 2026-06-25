# TASK-008 — Corrigir bug `rotate90` em seleção retangular

Prioridade: P0  
Área: Ferramentas de edição  
Tipo: Bugfix

## Objetivo

Corrigir rotação de seleção retangular para não apagar área errada.

## Problema

`rotate90` pode apagar pixels incorretos porque o erase usa dimensões já rotacionadas, não a área original da seleção.

## Arquivos prováveis

- `web/App.tsx`
- `shared/pixel-core.ts`
- arquivo de ferramentas/seleção, se existir
- testes de operações de seleção

## Checklist

- [ ] Isolar operação `rotate90Selection`.
- [ ] Capturar bounds originais antes da rotação.
- [ ] Apagar somente a área original.
- [ ] Calcular novo bounds rotacionado depois.
- [ ] Reaplicar pixels rotacionados no destino correto.
- [ ] Tratar seleção quadrada.
- [ ] Tratar seleção retangular horizontal.
- [ ] Tratar seleção retangular vertical.
- [ ] Tratar pixels transparentes.
- [ ] Adicionar teste unitário.

## Caso mínimo de teste

- Criar seleção 3x2.
- Preencher pixels diferentes.
- Rotacionar 90°.
- Confirmar que o resultado ocupa 2x3.
- Confirmar que nenhum pixel fora da seleção original foi apagado indevidamente.

## Critérios de aceite

- Rotação 90° funciona em seleção retangular.
- Área fora da seleção original não é apagada.
- Undo/redo da rotação funciona.
- Teste unitário cobre o bug.
