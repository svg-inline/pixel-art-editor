# TASK-016 — Criar CI com build, typecheck e testes

Prioridade: P1  
Área: DevOps / Qualidade  
Tipo: Automação  
Status: Concluída

## Objetivo

Adicionar pipeline de CI para impedir regressões em typecheck, testes, build e futuramente E2E.

## Contexto técnico

A validação manual passou, mas isso precisa virar barreira automática. Sem CI, qualquer refatoração em core, App.tsx, MCP ou exports pode quebrar o projeto sem perceber.

## Arquivos prováveis

- `.github/workflows/ci.yml`
- `package.json`
- `README.md`
- `playwright.config.ts`

## Dependências

- TASK-002
- TASK-003

## Checklist

- [x] Criar workflow GitHub Actions para Node LTS compatível com o projeto.
- [x] Rodar instalação limpa via lockfile oficial.
- [x] Rodar `npm run typecheck`.
- [x] Rodar `npm test`.
- [x] Rodar `npm run build`.
- [x] Adicionar `npm run test:e2e` quando TASK-009 existir.
- [x] Cachear dependências sem mascarar instalação quebrada.
- [x] Publicar artefatos de falha do Playwright quando houver E2E.
- [x] Adicionar badge opcional no README.

## Critérios de aceite

- [x] Pull request falha se typecheck falhar.
- [x] Pull request falha se testes falharem.
- [x] Pull request falha se build falhar.
- [x] Pipeline usa o lockfile escolhido na TASK-002.
- [x] CI não depende de chaves privadas para testes básicos.

## O que não deve ser feito

- [x] Não colocar token de IA real no CI.
- [x] Não ignorar falha de teste com `continue-on-error`.
- [x] Não rodar build a partir de `dist` versionado.
- [x] Não usar duas versões de Node sem necessidade.
- [x] Não tornar E2E obrigatório antes de estabilizar TASK-009.

## Workflow mínimo sugerido

```yaml
name: CI
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
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

Validação executada em 2026-06-30 com Node.js 22 e npm 10:

- `npm run typecheck`: passou.
- `npm test`: 99 testes passando.
- `npm run build`: passou.
- `npm run test:e2e`: 15 testes passando no Chromium headless.
- Godot não foi alterado por esta tarefa.
