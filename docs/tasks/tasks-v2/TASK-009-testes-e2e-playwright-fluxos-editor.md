# TASK-009 — Adicionar testes E2E dos fluxos principais do editor

Prioridade: P1  
Área: Testes / Qualidade  
Tipo: Cobertura funcional  
Status inicial: Backlog

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

- [ ] Instalar e configurar Playwright.
- [ ] Criar script `test:e2e`.
- [ ] Criar fixture de projeto pixel art mínimo.
- [ ] Testar criação de projeto novo.
- [ ] Testar desenho de pixel no canvas.
- [ ] Testar criação/renomeação de camada.
- [ ] Testar criação de frame e preview animado.
- [ ] Testar seleção + copiar/colar.
- [ ] Testar preview de IA e reject sem alterar projeto.
- [ ] Testar preview de IA e accept aplicando patch.
- [ ] Testar exportação de spritesheet ou PNG.
- [ ] Testar salvar e reabrir projeto da galeria.

## Critérios de aceite

- [ ] `npm run test:e2e` roda localmente.
- [ ] Pelo menos 8 fluxos críticos estão cobertos.
- [ ] Testes não dependem de provider externo de IA real.
- [ ] Falha de UI mostra screenshot/video ou trace.
- [ ] Testes podem rodar no CI em modo headless.

## O que não deve ser feito

- [ ] Não testar detalhes frágeis de CSS como objetivo principal.
- [ ] Não depender da internet.
- [ ] Não depender de chave real de IA.
- [ ] Não usar sleeps fixos longos; preferir waits por estado.
- [ ] Não substituir testes unitários por E2E.

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
