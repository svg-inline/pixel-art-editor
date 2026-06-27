# TASK-009 — Adicionar testes E2E dos fluxos principais do editor

Prioridade: P1  
Área: Testes / Qualidade  
Tipo: Cobertura funcional  
Status: Concluída

## Objetivo

Criar testes E2E para os fluxos reais que hoje só são validados manualmente.

## Contexto técnico

O projeto tem testes de core/server passando, mas ainda falta validação automatizada da experiência real do usuário no editor web. Sem E2E, refatorações em `App.tsx` e canvas podem quebrar fluxos silenciosamente.

## Arquivos prováveis

- `package.json`
- `playwright.config.ts`
- `tests/e2e/**/*.spec.ts`
- `web/**/*.tsx`
- `server/**/*.ts`

## Dependências

- TASK-004 recomendada antes para selectors mais estáveis.

## Checklist

- [x] Instalar e configurar Playwright.
- [x] Criar script `test:e2e`.
- [x] Criar fixture de projeto pixel art mínimo.
- [x] Testar criação de projeto novo.
- [x] Testar desenho de pixel no canvas.
- [x] Testar criação/renomeação de camada.
- [x] Testar criação de frame e preview animado.
- [x] Testar seleção + copiar/colar.
- [x] Testar preview de IA e reject sem alterar projeto.
- [x] Testar preview de IA e accept aplicando patch.
- [x] Testar exportação de spritesheet ou PNG.
- [x] Testar salvar e reabrir projeto da galeria.

## Critérios de aceite

- [x] `npm run test:e2e` roda localmente.
- [x] Pelo menos 8 fluxos críticos estão cobertos.
- [x] Testes não dependem de provider externo de IA real.
- [x] Falha de UI mostra screenshot/video ou trace.
- [x] Testes podem rodar no CI em modo headless.

## O que não deve ser feito

- [x] Não testar detalhes frágeis de CSS como objetivo principal.
- [x] Não depender da internet.
- [x] Não depender de chave real de IA.
- [x] Não usar sleeps fixos longos; preferir waits por estado.
- [x] Não substituir testes unitários por E2E.

## Fluxos mínimos obrigatórios

```txt
novo projeto -> desenhar -> camada -> frame -> preview -> salvar -> exportar
IA preview -> reject
IA preview -> accept
```

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.

## Resultado da validação

- `npm run test:e2e`: 13 testes passando (Chromium headless).
- `npm run typecheck`: passou.
- `npm test`: 68 testes passando.
- `npm run build`: passou.
- Godot não foi alterado por esta tarefa.
