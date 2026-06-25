# Backlog técnico atualizado — Editor Pixel Art

Este pacote transforma a avaliação técnica atual do editor em arquivos de task separados.

Cada task contém:

- objetivo;
- contexto técnico;
- arquivos prováveis;
- checklist;
- critérios de aceite;
- o que não deve ser feito;
- validação obrigatória.

## Ordem recomendada

1. [TASK-001 — Corrigir bug de redeclaração no addon Godot](TASK-001-corrigir-bug-godot-redeclaracao.md) — P0 — Godot / Integração
2. [TASK-002 — Padronizar package manager e lockfile](TASK-002-padronizar-package-manager-lockfiles.md) — P0 — Tooling / Repositório
3. [TASK-003 — Limpar repositório de runtime, build e arquivos indevidos](TASK-003-limpar-repositorio-runtime-build-artifacts.md) — P0 — Repositório / Distribuição
4. [TASK-004 — Refatorar `App.tsx` em hooks e componentes](TASK-004-refatorar-app-tsx-em-hooks-e-componentes.md) — P1 — Frontend / Arquitetura
5. [TASK-005 — Quebrar `pixel-core.ts` em módulos especializados](TASK-005-quebrar-pixel-core-em-modulos.md) — P1 — Shared Core / Arquitetura
6. [TASK-006 — Migrar TypeScript para strict mode gradual](TASK-006-migrar-typescript-strict-gradual.md) — P1 — TypeScript / Qualidade
7. [TASK-007 — Fortalecer schemas Zod e contratos de dados](TASK-007-fortalecer-zod-schemas-contratos.md) — P1 — Schemas / Segurança / MCP
8. [TASK-008 — Criar importação Godot profissional](TASK-008-godot-importer-profissional.md) — P1 — Godot / Game Pipeline
9. [TASK-009 — Adicionar testes E2E dos fluxos principais do editor](TASK-009-testes-e2e-playwright-fluxos-editor.md) — P1 — Testes / Qualidade
10. [TASK-010 — Profissionalizar pipeline de IA com provider, diff, preview e auditoria](TASK-010-pipeline-ia-real-provider-diff-preview.md) — P1 — IA / MCP / Bridge
11. [TASK-011 — Otimizar renderização do canvas](TASK-011-otimizar-render-canvas-performance.md) — P2 — Canvas / Performance
12. [TASK-012 — Implementar ferramentas e UX de editor profissional](TASK-012-implementar-ferramentas-ux-editor-profissional.md) — P2 — Frontend / UX / Ferramentas
13. [TASK-013 — Consolidar modelo multi-assets, animações e direções](TASK-013-modelo-multi-assets-animacoes-direcoes.md) — P2 — Modelo de dados / Game Pipeline
14. [TASK-014 — Melhorar histórico, undo/redo e UI de patches](TASK-014-historico-undo-redo-ui-patches.md) — P2 — Histórico / UX / Persistência
15. [TASK-015 — Criar QA visual profissional para pixel art e exports](TASK-015-qa-visual-exportacao-profissional.md) — P2 — QA / Exportação / Arte
16. [TASK-016 — Criar CI com build, typecheck e testes](TASK-016-ci-build-typecheck-testes.md) — P1 — DevOps / Qualidade
17. [TASK-017 — Melhorar documentação de setup, variáveis e fluxos](TASK-017-documentacao-setup-dev-env.md) — P2 — Documentação / DX
18. [TASK-018 — Melhorar export profiles para Godot, Unity e atlas](TASK-018-melhorar-export-profiles-godot-unity-atlas.md) — P2 — Exportação / Game Pipeline

## Priorização

`P0`: correção imediata ou higiene bloqueante.  
`P1`: base arquitetural/qualidade necessária antes de crescer o editor.  
`P2`: evolução profissional e produtividade de produção.  
`P3`: melhoria visual, refinamento ou expansão futura.

## Sequência prática

```txt
P0 primeiro:
001 -> 002 -> 003

Base técnica:
004 -> 005 -> 006 -> 007 -> 016

Pipeline profissional:
008 -> 009 -> 010 -> 014 -> 015 -> 018

Produto/editor:
011 -> 012 -> 013 -> 017
```

## Regra de execução

Não misturar refatoração grande com feature nova no mesmo PR.  
Não aceitar task sem typecheck, testes e build passando.  
Não aplicar output de IA direto no projeto sem validação, preview e aceite.
