# TASK-016 — Criar CI com build, typecheck e testes

Prioridade: P1  
Área: DevOps / Qualidade  
Tipo: Automação  
Status inicial: Backlog

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

- [ ] Criar workflow GitHub Actions para Node LTS compatível com o projeto.
- [ ] Rodar instalação limpa via lockfile oficial.
- [ ] Rodar `npm run typecheck`.
- [ ] Rodar `npm test`.
- [ ] Rodar `npm run build`.
- [ ] Adicionar `npm run test:e2e` quando TASK-009 existir.
- [ ] Cachear dependências sem mascarar instalação quebrada.
- [ ] Publicar artefatos de falha do Playwright quando houver E2E.
- [ ] Adicionar badge opcional no README.

## Critérios de aceite

- [ ] Pull request falha se typecheck falhar.
- [ ] Pull request falha se testes falharem.
- [ ] Pull request falha se build falhar.
- [ ] Pipeline usa o lockfile escolhido na TASK-002.
- [ ] CI não depende de chaves privadas para testes básicos.

## O que não deve ser feito

- [ ] Não colocar token de IA real no CI.
- [ ] Não ignorar falha de teste com `continue-on-error`.
- [ ] Não rodar build a partir de `dist` versionado.
- [ ] Não usar duas versões de Node sem necessidade.
- [ ] Não tornar E2E obrigatório antes de estabilizar TASK-009.

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
