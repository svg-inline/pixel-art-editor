# TASK-003 — Limpar repositório de runtime, build e arquivos indevidos

Prioridade: P0  
Área: Repositório / Distribuição  
Tipo: Higiene técnica  
Status: Concluída

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

- [x] Revisar `.gitignore` e garantir exclusão de `node_modules/`, `dist/`, `runtime/*.sqlite`, `runtime/*.json`, `runtime/backups/` e arquivos temporários.
- [x] Criar script de empacotamento limpo, por exemplo `npm run pack:clean`.
- [x] Garantir que o ZIP gerado contenha apenas código-fonte, docs, exemplos seguros e arquivos necessários.
- [x] Remover arquivos gerados já versionados indevidamente. Nenhum runtime gerado estava versionado; apenas `runtime/.gitkeep` e `runtime/README.md` permanecem rastreados.
- [x] Documentar quais arquivos são runtime local e não devem ser commitados.

## Critérios de aceite

- [x] ZIP limpo não contém `.git/`, `node_modules/`, `dist/` ou bancos locais.
- [x] Repositório não versiona runtime gerado.
- [x] Script de pacote limpo funciona em ambiente novo.
- [x] README explica como gerar build sem versionar `dist`.

## O que não deve ser feito

- [x] Não apagar dados locais sem backup quando estiver em máquina de desenvolvimento real.
- [x] Não colocar tokens, bancos ou exports privados em exemplos versionados.
- [x] Não depender de limpeza manual sem script.
- [x] Não incluir build final no repositório se o deploy puder gerar build no CI.

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.

Validação executada em 2026-06-25:

```bash
npm run typecheck
npm test
npm run build
npm run pack:clean
```

Também foi verificado que `release/pixel-art-mcp-2.0.0.zip` não contém `.git/`, `node_modules/`, `dist/`, `release/`, runtime gerado, bancos locais, arquivos temporários ou outros `.zip`.
