# TASK-007 — Fortalecer schemas Zod e contratos de dados

Prioridade: P1
Área: Schemas / Segurança / MCP
Tipo: Hardening técnico
Status inicial: Backlog

## Objetivo

Substituir validações permissivas por schemas explícitos para projeto, diffs, IA, bridge e exports.

## Contexto técnico

O projeto usa Zod, mas ainda há pontos permissivos com `z.any()` ou payloads frouxos. Isso reduz a proteção contra dados inválidos vindos da IA, da bridge, do banco ou de imports externos.

## Arquivos prováveis

- `shared/schemas.ts`
- `shared/model.ts`
- `server/**/*.ts`
- `mcp/**/*.ts`
- `web/**/*.tsx`
- `tests/**/*.test.ts`

## Dependências

- TASK-005
- TASK-006 recomendadas antes ou em paralelo.

## Checklist

- [x] Inventariar todos os `z.any()` e casts relacionados a projeto/diff/export.
- [x] Criar schema explícito para `Project`.
- [x] Criar schema explícito para `Asset`.
- [x] Criar schema explícito para `Animation`.
- [x] Criar schema explícito para `Frame`.
- [x] Criar schema explícito para `Layer`.
- [x] Criar schema explícito para `Patch`/`Diff`.
- [x] Criar schema explícito para `Pivot`, `Hitbox`, `Hurtbox`, `Attackbox`.
- [x] Validar entrada e saída de IA antes de aplicar no projeto.
- [x] Adicionar testes com payload inválido e payload válido.
- [x] Garantir mensagens de erro úteis para frontend/MCP.

## Critérios de aceite

- [x] Payload inválido vindo da IA não é aplicado silenciosamente.
- [x] Bridge rejeita projeto inválido com erro claro.
- [x] MCP retorna erro estruturado para parâmetros inválidos.
- [x] Exports só recebem projeto normalizado e validado.
- [x] Testes cobrem pelo menos 5 casos inválidos críticos.

## O que não deve ser feito

- [ ] Não aceitar `z.any()` em campos estruturais centrais.
- [ ] Não validar só no frontend.
- [ ] Não quebrar projetos antigos sem migration/fallback.
- [ ] Não aplicar output de IA sem validação.
- [ ] Não retornar stack trace crua para UI.

## Campos que não podem ficar soltos

```txt
Project.assets
Asset.animations
Animation.frames
Frame.layers
Layer.pixels
Frame.pivot
Frame.hitboxes
Frame.hurtboxes
Frame.attackboxes
Patch.operations
AI preview payload
Export profile
```

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.
