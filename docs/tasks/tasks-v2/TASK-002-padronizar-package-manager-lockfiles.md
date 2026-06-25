# TASK-002 — Padronizar package manager e lockfile

Prioridade: P0  
Área: Tooling / Repositório  
Tipo: Manutenção  
Status inicial: Backlog

## Objetivo

Eliminar ambiguidade entre `package-lock.json` e `yarn.lock`, deixando o projeto com um único gerenciador de pacotes oficial.

## Contexto técnico

O projeto contém `package-lock.json` e `yarn.lock` ao mesmo tempo. Isso gera instalações divergentes, CI imprevisível e ruído em PRs. Pelo estado atual do projeto, a rota mais simples é manter npm.

## Arquivos prováveis

- `package.json`
- `package-lock.json`
- `yarn.lock`
- `README.md`
- `.gitignore`

## Checklist

- [ ] Decidir oficialmente entre npm e yarn. Recomendado: npm.
- [ ] Remover o lockfile do gerenciador não escolhido.
- [ ] Atualizar README com comandos oficiais usando o gerenciador escolhido.
- [ ] Garantir que scripts `dev`, `build`, `test` e `typecheck` funcionem com o gerenciador escolhido.
- [ ] Fazer instalação limpa sem `node_modules` para confirmar reprodutibilidade.

## Critérios de aceite

- [ ] Existe apenas um lockfile versionado.
- [ ] README não mostra comandos conflitantes.
- [ ] Instalação limpa funciona.
- [ ] Build, testes e typecheck passam após instalação limpa.

## O que não deve ser feito

- [ ] Não manter dois lockfiles por conveniência.
- [ ] Não misturar comandos `npm install` e `yarn install` na documentação.
- [ ] Não apagar dependências sem confirmar impacto.
- [ ] Não versionar `node_modules`.

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.
