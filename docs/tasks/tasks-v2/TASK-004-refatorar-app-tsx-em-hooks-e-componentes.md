# TASK-004 — Refatorar `App.tsx` em hooks e componentes

Prioridade: P1  
Área: Frontend / Arquitetura  
Tipo: Refatoração estrutural  
Status: Concluída

## Objetivo

Quebrar o componente-monstro `web/App.tsx` em módulos menores, testáveis e com responsabilidades claras.

## Contexto técnico

O frontend já foi convertido para TypeScript, mas `App.tsx` ainda concentra canvas, timeline, bridge, IA, exportação, paleta, histórico, seleção, atalhos e estado global. Isso aumenta risco de regressão em qualquer feature nova.

## Arquivos prováveis

- `web/App.tsx`
- `web/components/CanvasEditor.tsx`
- `web/components/Timeline.tsx`
- `web/components/LayerPanel.tsx`
- `web/components/PalettePanel.tsx`
- `web/components/AiPanel.tsx`
- `web/components/ExportPanel.tsx`
- `web/components/GameDataPanel.tsx`
- `web/hooks/useProject.ts`
- `web/hooks/useCanvasInput.ts`
- `web/hooks/useBridge.ts`
- `web/hooks/useAutosave.ts`
- `web/hooks/useKeyboardShortcuts.ts`

## Dependências

- TASK-002
- TASK-003

## Checklist

- [x] Mapear responsabilidades atuais dentro de `App.tsx`.
- [x] Extrair componentes visuais sem alterar comportamento.
- [x] Extrair hooks de estado e efeitos colaterais.
- [x] Separar lógica de bridge/SSE em `useBridge`.
- [x] Separar lógica de canvas/input em `useCanvasInput`.
- [x] Separar lógica de autosave em `useAutosave`.
- [x] Separar painéis de UI em componentes próprios.
- [x] Evitar refatoração com mudança visual simultânea.
- [x] Criar testes mínimos para hooks críticos quando possível.

## Critérios de aceite

- [x] `App.tsx` fica majoritariamente como composição de layout e providers.
- [x] Nenhum fluxo existente deixa de funcionar: desenho, camada, frame, preview, IA, export, galeria.
- [x] Componentes extraídos têm props tipadas.
- [x] Não há aumento relevante no bundle final.
- [x] PR consegue ser revisado por partes, sem diff caótico.

## O que não deve ser feito

- [x] Não adicionar novas features nesta task.
- [x] Não mudar modelo de dados durante a refatoração.
- [x] Não reimplementar canvas do zero.
- [x] Não trocar framework, state manager ou UI library.
- [x] Não esconder lógica em arquivos `utils.ts` genéricos gigantes.

## Estrutura alvo sugerida

```txt
web/
  App.tsx
  components/
    CanvasEditor.tsx
    Timeline.tsx
    LayerPanel.tsx
    PalettePanel.tsx
    AiPanel.tsx
    ExportPanel.tsx
    GameDataPanel.tsx
  hooks/
    useProject.ts
    useCanvasInput.ts
    useBridge.ts
    useAutosave.ts
    useKeyboardShortcuts.ts
```

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.

Validação executada em 2026-06-25:

```bash
npm run typecheck
npm test
npm run build
```

Resultado da refatoração:

- `web/App.tsx` foi reduzido de 2497 para 411 linhas e agora compõe hooks e painéis.
- Componentes extraídos em `web/components/`: canvas, timeline, camadas, paleta/QA, IA/MCP, exportação, game data, seleção e ferramentas.
- Hooks extraídos em `web/hooks/`: projeto/histórico, autosave, bridge/SSE, ações bridge/IA, canvas/input/render, atalhos, ações de projeto, seleção e exportação.
- Helpers compartilhados extraídos em `web/lib/` e tipos em `web/types.ts`.
- Testes mínimos adicionados em `tests/web-refactor.test.ts` para atalhos e cálculo de grade.
- Build final: `dist/assets/index-DbffMnIn.js` com 267.75 kB / 84.06 kB gzip.
