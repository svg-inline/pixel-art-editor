# TASK-012 — Adicionar testes unitários e visuais

Prioridade: P1  
Área: Qualidade / Testes  
Tipo: Infraestrutura

## Objetivo

Criar cobertura mínima para `pixel-core` e exportação PNG/spritesheet/JSON.

## Problema

Sem testes, refatorações no core, histórico e exportação podem quebrar o editor ou gerar PNG diferente sem aviso.

## Arquivos prováveis

- `shared/pixel-core.ts`
- `shared/*.test.ts`
- `tests/`
- `vitest.config.ts`
- `package.json`
- exportadores PNG/spritesheet/JSON

## Checklist

- [ ] Instalar/configurar Vitest.
- [ ] Criar script `test`.
- [ ] Testar `normalizeProject`.
- [ ] Testar `colorsUsed`.
- [ ] Testar `qualityReport`.
- [ ] Testar composição de camadas.
- [ ] Testar operações de seleção.
- [ ] Testar `rotate90`.
- [ ] Testar exportação JSON.
- [ ] Criar teste visual/snapshot de PNG.
- [ ] Criar fixture pequena 8x8 ou 16x16.
- [ ] Adicionar teste para falso fundo quadriculado.
- [ ] Adicionar teste para alpha real.

## Critérios de aceite

- `npm test` passa.
- `npm run typecheck` passa.
- Testes cobrem core compartilhado.
- Exportação PNG tem teste contra regressão.
- Bug `rotate90` fica coberto.
