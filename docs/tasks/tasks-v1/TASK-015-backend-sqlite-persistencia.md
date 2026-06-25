# TASK-015 — Migrar persistência local para SQLite

Prioridade: P2  
Área: Backend / Persistência  
Tipo: Arquitetura

## Objetivo

Substituir JSON gigante como banco por SQLite local, com tabelas separadas para projeto, galeria, histórico e exportações.

## Problema

Persistência em JSON bruto cresce rápido, dificulta histórico, concorrência, busca e galeria. Para editor sério, precisa de banco local simples e confiável.

## Arquivos prováveis

- `server/db.ts`
- `server/migrations/`
- `server/bridge-server.ts`
- `shared/schema.ts`
- `data/editor.sqlite`
- `.gitignore`

## Checklist

- [ ] Escolher lib SQLite.
- [ ] Criar camada `ProjectRepository`.
- [ ] Criar tabela `projects`.
- [ ] Criar tabela `assets`.
- [ ] Criar tabela `history`.
- [ ] Criar tabela `exports`.
- [ ] Criar tabela `thumbnails`.
- [ ] Criar migrations.
- [ ] Migrar JSON antigo para SQLite.
- [ ] Salvar thumbnails separados.
- [ ] Implementar backup/export JSON.
- [ ] Garantir escrita atômica.
- [ ] Adicionar índices básicos.

## Critérios de aceite

- Projeto salva/carrega via SQLite.
- Histórico não depende de snapshot gigante.
- Galeria lista projetos com thumbnail.
- Runtime DB não entra no Git.
- Export JSON continua disponível para interoperabilidade.

## Observação

SQLite é suficiente para local-first. Autenticação/cloud podem vir depois.
