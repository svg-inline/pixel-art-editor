# TASK-017B — Ferramentas básicas usando pixel-core

Prioridade: P3  
Área: Editor / Ferramentas  
Tipo: Subtask de TASK-017

## Objetivo

Adicionar ferramentas esperadas em pixel art sem duplicar algoritmos de desenho no editor.

## Checklist

- [x] Linha.
- [x] Retângulo.
- [x] Elipse.
- [x] Registro em undo/redo por patch.
- [x] Atalhos de teclado para troca rápida.

## Critérios de aceite

- Ferramentas devem chamar funções do `shared/pixel-core.ts`.
- Edição deve alterar apenas a camada ativa.
- Histórico deve registrar o comando correto.
