# TASK-001 — Corrigir TypeScript e typecheck Node

Prioridade: P0  
Área: Tooling / TypeScript  
Tipo: Correção imediata

## Objetivo

Fazer `npx tsc --noEmit` passar sem depender de flags manuais e criar um script oficial de typecheck.

## Problema

O build passa, mas o typecheck falha porque o projeto usa APIs Node sem configuração de tipos Node no TypeScript.

## Arquivos prováveis

- `package.json`
- `tsconfig.json`
- `package-lock.json` ou `yarn.lock`

## Checklist

- [ ] Instalar `@types/node` como dev dependency.
- [ ] Adicionar `"types": ["node"]` em `compilerOptions`.
- [ ] Adicionar script `"typecheck": "tsc --noEmit"` no `package.json`.
- [ ] Rodar `npm run typecheck`.
- [ ] Rodar `npm run build`.
- [ ] Confirmar que não houve regressão no Vite/web.

## Comandos

```bash
npm install -D @types/node
npm run typecheck
npm run build
```

## Critérios de aceite

- `npm run typecheck` passa.
- `npm run build` continua passando.
- Não existe mais necessidade de rodar `npx tsc --noEmit --types node` manualmente.

## Observação

Não ativar `strict: true` nesta task. Isso deve entrar em uma migração gradual separada.
