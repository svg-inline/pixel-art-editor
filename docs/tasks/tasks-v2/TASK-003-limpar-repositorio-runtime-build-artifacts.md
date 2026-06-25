# TASK-003 — Limpar repositório de runtime, build e arquivos indevidos

Prioridade: P0  
Área: Repositório / Distribuição  
Tipo: Higiene técnica  
Status inicial: Backlog

## Objetivo

Garantir que o repositório e os pacotes distribuídos não carreguem `.git`, `dist`, `node_modules`, bancos locais, backups ou runtime gerado.

## Contexto técnico

O pacote avaliado continha diretórios e arquivos que não devem entrar em ZIP de entrega ou repositório de código, como `.git/`, `dist/`, `node_modules/` e arquivos de runtime. Isso aumenta tamanho, vaza estado local e confunde análise técnica.

## Arquivos prováveis

- `.gitignore`
- `README.md`
- `package.json`
- `runtime/`
- `dist/`
- `node_modules/`

## Checklist

- [ ] Revisar `.gitignore` e garantir exclusão de `node_modules/`, `dist/`, `runtime/*.sqlite`, `runtime/*.json`, `runtime/backups/` e arquivos temporários.
- [ ] Criar script de empacotamento limpo, por exemplo `npm run pack:clean`.
- [ ] Garantir que o ZIP gerado contenha apenas código-fonte, docs, exemplos seguros e arquivos necessários.
- [ ] Remover arquivos gerados já versionados indevidamente.
- [ ] Documentar quais arquivos são runtime local e não devem ser commitados.

## Critérios de aceite

- [ ] ZIP limpo não contém `.git/`, `node_modules/`, `dist/` ou bancos locais.
- [ ] Repositório não versiona runtime gerado.
- [ ] Script de pacote limpo funciona em ambiente novo.
- [ ] README explica como gerar build sem versionar `dist`.

## O que não deve ser feito

- [ ] Não apagar dados locais sem backup quando estiver em máquina de desenvolvimento real.
- [ ] Não colocar tokens, bancos ou exports privados em exemplos versionados.
- [ ] Não depender de limpeza manual sem script.
- [ ] Não incluir build final no repositório se o deploy puder gerar build no CI.

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.
