# TASK-002 — Unificar lógica em `shared/pixel-core.ts`

Prioridade: P0  
Área: Arquitetura / Core  
Tipo: Refatoração estrutural

## Objetivo

Remover duplicação entre frontend, bridge e MCP, tornando `shared/pixel-core.ts` a única fonte de verdade para operações de pixel art.

## Problema

Lógicas como `normalizeProject`, `qualityReport`, `colorsUsed`, geração heurística, composição e exportação aparecem duplicadas em `web/App.jsx`. Isso cria risco de bugs diferentes entre editor web, bridge e MCP.

## Arquivos prováveis

- `shared/pixel-core.ts`
- `web/App.jsx` ou `web/App.tsx`
- `server/bridge-server.ts`
- `server/mcp-server.ts`
- arquivos de exportação PNG/spritesheet/JSON

## Checklist

- [ ] Mapear funções duplicadas no frontend.
- [ ] Mover normalização de projeto para `shared/pixel-core.ts`.
- [ ] Mover cálculo de cores usadas para `shared/pixel-core.ts`.
- [ ] Mover QA/quality report para `shared/pixel-core.ts`.
- [ ] Mover composição de frame/camadas para `shared/pixel-core.ts`.
- [ ] Mover exportação base ou metadata comum para `shared/pixel-core.ts`.
- [ ] Atualizar frontend para importar funções do core.
- [ ] Atualizar bridge para importar funções do core.
- [ ] Atualizar MCP para importar funções do core.
- [ ] Remover código morto duplicado.
- [ ] Adicionar testes unitários mínimos para as funções migradas.

## Critérios de aceite

- Não existe função duplicada crítica entre `web/App.*` e `shared/pixel-core.ts`.
- Frontend, bridge e MCP usam as mesmas funções de normalização e QA.
- Exportações continuam iguais antes/depois da refatoração.
- Typecheck e build passam.

## Risco

Refatoração pode alterar output PNG/JSON sem perceber. Criar snapshot visual ou teste de exportação antes de mexer.
