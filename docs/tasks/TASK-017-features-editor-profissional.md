# TASK-017 — Implementar features de editor profissional

Prioridade: P3  
Área: Editor / UX / Ferramentas  
Tipo: Roadmap de funcionalidades

## Objetivo

Adicionar recursos esperados em editor sério de pixel art e sprites para jogos.

## Escopo

Esta task é um épico. Deve ser quebrada em subtasks menores antes de implementar.

## Checklist de features

### Animação

- [ ] Múltiplas animações no mesmo asset.
- [ ] Matriz de direções N, NE, E, SE, S, SW, W, NW.
- [ ] Duração por frame.
- [ ] Onion skin anterior/próximo com opacidade.
- [ ] Thumbnails reais dos frames.
- [ ] Preview animado por animação/direção.

### Game data

- [ ] Pivot/origin por frame.
- [ ] Hitbox.
- [ ] Hurtbox.
- [ ] Attackbox.
- [ ] Crop automático por bounds.
- [ ] Export profiles.

### Ferramentas

- [ ] Linha.
- [ ] Retângulo.
- [ ] Elipse.
- [ ] Lasso.
- [ ] Magic wand.
- [ ] Simetria.
- [ ] Lock alpha.
- [ ] Lock layer.
- [ ] Merge/down.
- [ ] Blend modes simples.

### Paleta

- [ ] Paletas indexadas.
- [ ] Importar/exportar paletas.
- [ ] Limitar cores.
- [ ] Substituição global de cor.

### Exportação

- [ ] Import/export `.aseprite` ou JSON compatível.
- [ ] Exportar GIF.
- [ ] Exportar WebP.
- [ ] Exportar ZIP com PNG + atlas + metadata.
- [ ] Tilemap/tileset.

### UX

- [ ] Atalhos de teclado.
- [ ] Pan/zoom decente.
- [ ] Grade isométrica opcional.
- [ ] Suporte touch/stylus.
- [ ] Recuperação automática após crash.

## Critérios de aceite

- Cada feature deve virar task própria antes de codar.
- Nenhuma feature deve duplicar lógica fora do core.
- Features de exportação devem ter teste.
- Features de edição devem entrar no undo/redo por patch.
