# TASK-011 — Otimizar renderização do canvas

Prioridade: P1  
Área: Performance / Canvas  
Tipo: Otimização

## Objetivo

Reduzir custo de renderização ao editar sprites 256x256 com múltiplas camadas, frames e preview animado.

## Problema

O canvas percorre todos os pixels de todas as camadas a cada render. Em 256x256 ainda funciona, mas escala mal com muitas camadas, frames e preview.

## Arquivos prováveis

- `web/App.tsx`
- `web/canvas-renderer.ts`
- `shared/pixel-core.ts`

## Checklist

- [ ] Criar cache por camada.
- [ ] Criar cache por frame composto.
- [ ] Marcar dirty rectangle por edição.
- [ ] Renderizar apenas região suja quando possível.
- [ ] Usar `requestAnimationFrame`.
- [ ] Evitar `JSON.parse(JSON.stringify(project))` em edição frequente.
- [ ] Avaliar `OffscreenCanvas`.
- [ ] Usar `Uint32Array` ou índice de paleta para buffer interno.
- [ ] Otimizar flood fill com bitset de visitados.
- [ ] Medir FPS antes/depois.
- [ ] Garantir que exportação final não use cache stale.

## Critérios de aceite

- Desenho contínuo não trava com múltiplas camadas.
- Preview animado não força recomposição completa desnecessária.
- Edição em frame/camada invalida apenas caches necessários.
- Não há regressão visual no canvas.

## Observação

Não converter todo o formato do projeto para binário nesta task. Primeiro cache e render incremental.
