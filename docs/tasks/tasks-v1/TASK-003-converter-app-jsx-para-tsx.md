# TASK-003 — Converter `web/App.jsx` para `web/App.tsx`

Prioridade: P0  
Área: Frontend / TypeScript  
Tipo: Migração

## Objetivo

Migrar o componente principal do editor para TypeScript, reduzindo erro silencioso em manipulação de projeto, frames, camadas, ferramentas e integração com a bridge.

## Problema

O editor concentra muita lógica em `App.jsx`. Como está em JavaScript, o contrato entre projeto, layers, frames, seleção, paleta e exportação fica frágil.

## Arquivos prováveis

- `web/App.jsx`
- `web/App.tsx`
- `web/main.jsx` ou `web/main.tsx`
- `web/vite-env.d.ts`
- `tsconfig.json`

## Checklist

- [ ] Renomear `App.jsx` para `App.tsx`.
- [ ] Tipar `Project`, `Frame`, `Layer`, `Tool`, `Selection`, `PaletteColor`.
- [ ] Importar tipos do core compartilhado quando possível.
- [ ] Corrigir eventos React: mouse, pointer, keyboard, change.
- [ ] Tipar refs de canvas.
- [ ] Tipar chamadas HTTP/SSE.
- [ ] Remover `any` onde for simples.
- [ ] Deixar `any` temporário apenas onde a migração ficar grande demais.
- [ ] Rodar `npm run typecheck`.
- [ ] Rodar `npm run build`.

## Critérios de aceite

- `App.tsx` compila.
- O editor abre e mantém fluxo básico: desenhar, trocar camada, trocar frame, preview, exportar.
- Typecheck passa.
- Nenhuma tipagem nova fica bloqueando uso básico.

## Observação

Não misturar esta task com mudança visual grande. Primeiro converter, depois refatorar.
