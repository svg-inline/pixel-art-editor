# Runtime local

Este diretório recebe dados gerados pela aplicação em desenvolvimento local.

Arquivos comuns:

- `pixel-project.mcp.json`: projeto compartilhado entre editor, bridge e MCP.
- `pixel-art-db.json`: galeria local, usuários locais e histórico compacto.
- `backups/`: cópias criadas antes de migrações ou resets.

O conteúdo de runtime é ignorado pelo Git. Para recriar arquivos iniciais:

```bash
npm run runtime:migrate
```

Para limpar o runtime local com backup antes:

```bash
npm run runtime:reset
```
