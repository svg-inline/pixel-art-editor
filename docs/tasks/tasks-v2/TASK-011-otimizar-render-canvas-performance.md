# TASK-011 — Otimizar renderização do canvas

Prioridade: P2  
Área: Canvas / Performance  
Tipo: Otimização  
Status: Concluída em 2026-06-27

## Objetivo

Reduzir custo de renderização em projetos com múltiplas camadas, frames e preview animado.

## Contexto técnico

O canvas 256x256 ainda funciona bem, mas renderizar todos os pixels de todas as camadas a cada mudança não escala. Para editor profissional, é necessário cache, invalidação por região e estrutura de pixels mais eficiente.

## Arquivos prováveis

- `web/components/CanvasEditor.tsx`
- `web/hooks/useCanvasInput.ts`
- `shared/render.ts`
- `shared/raster.ts`
- `tests/**/*.test.ts`

## Dependências

- TASK-005
- TASK-009 recomendadas antes.

## Checklist

- [x] Medir performance atual com projetos pequenos, médios e pesados.
- [x] Criar cache por camada e por frame composto.
- [x] Implementar dirty rectangles para redesenhar apenas áreas alteradas.
- [x] Usar `requestAnimationFrame` para sincronizar render.
- [x] Evitar `JSON.parse(JSON.stringify(project))` em edições frequentes.
- [x] Avaliar `Uint32Array` ou índice de paleta para raster interno.
- [x] Otimizar flood fill com bitset de visitados.
- [x] Garantir que onion skin não recomponha tudo sem necessidade.
- [x] Adicionar benchmark ou teste de performance básico.

## Critérios de aceite

- [x] Desenho permanece responsivo em projeto com várias camadas e frames.
- [x] Preview animado não degrada edição principal.
- [x] Render não recompõe frames não alterados.
- [x] Não há regressão visual em export PNG/spritesheet.
- [x] Benchmark documenta ganho ou pelo menos ausência de regressão.

## O que não deve ser feito

- [ ] Não otimizar antes de medir gargalos.
- [ ] Não trocar toda a arquitetura de estado nesta task.
- [ ] Não introduzir WebGL sem necessidade clara.
- [ ] Não quebrar transparência real.
- [ ] Não sacrificar precisão de pixel por interpolação ou smoothing.

## Métricas sugeridas

```txt
Projeto leve: 256x256, 2 camadas, 4 frames
Projeto médio: 256x256, 8 camadas, 16 frames
Projeto pesado: 256x256, 16 camadas, 64 frames
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

- Cache LRU por camada e frame, com histórico de dirty rectangles por versão.
- RAFs independentes para canvas principal e preview; onion skin reutiliza frames.
- Buffer RGBA transitório em `Uint32Array`; formato persistido não foi alterado.
- Flood fill com bitset de 8 KiB e fila tipada de tamanho fixo.
- Exportações continuam no renderer fresco, independente do cache do editor.
- Métricas e procedimento reproduzível em `docs/canvas-render-performance.md`.

Validação executada em 2026-06-27:

```txt
npm run typecheck        OK
npm test                 77 testes OK
npm run test:e2e         13 testes Chromium OK
npm run benchmark:render OK
```
