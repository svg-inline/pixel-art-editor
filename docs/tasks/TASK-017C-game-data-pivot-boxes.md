# TASK-017C — Game data por frame

Prioridade: P3  
Área: Editor / Game data  
Tipo: Subtask de TASK-017

## Objetivo

Expor dados de gameplay por frame para exportação de sprites.

## Checklist

- [ ] Pivot/origin por frame.
- [ ] Hitbox.
- [ ] Hurtbox.
- [ ] Attackbox.
- [ ] Dados preservados nos exports existentes.

## Critérios de aceite

- Alterações entram no undo/redo por patch.
- Boxes usam o modelo `hitboxes` existente com nomes/tipos compatíveis.
- Nenhuma duplicação de metadata fora do projeto normalizado.
