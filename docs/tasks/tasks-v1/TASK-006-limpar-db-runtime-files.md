# TASK-006 — Limpar `pixel-art-db.json` e separar arquivos runtime

Prioridade: P0  
Área: Persistência / Repositório  
Tipo: Higiene técnica

## Objetivo

Remover arquivos runtime pesados do repositório/ZIP e criar uma estrutura limpa para dados locais gerados pela aplicação.

## Problema

Arquivos como `pixel-art-db.json` armazenam dados gerados em runtime e podem crescer muito. Isso não deve ficar versionado junto do código.

## Arquivos prováveis

- `pixel-art-db.json`
- `pixel-project.mcp.json`
- `.gitignore`
- `server/bridge-server.ts`
- diretório `data/`
- diretório `runtime/`
- scripts de seed/migration

## Checklist

- [ ] Criar diretório `runtime/` ou `data/`.
- [ ] Mover banco local para esse diretório.
- [ ] Adicionar arquivos runtime ao `.gitignore`.
- [ ] Criar arquivo seed pequeno para demo, se necessário.
- [ ] Criar script de reset/migration do banco local.
- [ ] Remover snapshots gigantes do histórico.
- [ ] Garantir que o app inicia mesmo sem banco existente.
- [ ] Documentar onde os dados locais ficam.
- [ ] Atualizar README com instrução de limpeza.

## Critérios de aceite

- ZIP/repositório não carrega banco gigante por padrão.
- App cria banco local inicial se não existir.
- Dados de runtime não entram no Git.
- Projeto demo ainda abre normalmente.

## Observação

Não apagar dados do usuário sem backup. Criar cópia antes de migrar.
