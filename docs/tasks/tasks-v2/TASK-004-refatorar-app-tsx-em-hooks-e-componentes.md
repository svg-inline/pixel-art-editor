# TASK-004 — Refatorar `App.tsx` em hooks e componentes

Prioridade: P1  
Área: Frontend / Arquitetura  
Tipo: Refatoração estrutural  
Status inicial: Backlog

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

- [ ] Mapear responsabilidades atuais dentro de `App.tsx`.
- [ ] Extrair componentes visuais sem alterar comportamento.
- [ ] Extrair hooks de estado e efeitos colaterais.
- [ ] Separar lógica de bridge/SSE em `useBridge`.
- [ ] Separar lógica de canvas/input em `useCanvasInput`.
- [ ] Separar lógica de autosave em `useAutosave`.
- [ ] Separar painéis de UI em componentes próprios.
- [ ] Evitar refatoração com mudança visual simultânea.
- [ ] Criar testes mínimos para hooks críticos quando possível.

## Critérios de aceite

- [ ] `App.tsx` fica majoritariamente como composição de layout e providers.
- [ ] Nenhum fluxo existente deixa de funcionar: desenho, camada, frame, preview, IA, export, galeria.
- [ ] Componentes extraídos têm props tipadas.
- [ ] Não há aumento relevante no bundle final.
- [ ] PR consegue ser revisado por partes, sem diff caótico.

## O que não deve ser feito

- [ ] Não adicionar novas features nesta task.
- [ ] Não mudar modelo de dados durante a refatoração.
- [ ] Não reimplementar canvas do zero.
- [ ] Não trocar framework, state manager ou UI library.
- [ ] Não esconder lógica em arquivos `utils.ts` genéricos gigantes.

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
