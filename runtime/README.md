# Runtime local

Este diretório recebe dados gerados pela aplicação em desenvolvimento local.

Arquivos comuns:

- `pixel-project.mcp.json`: projeto compartilhado entre editor, bridge e MCP.
- `pixel-art-db.json`: galeria local, usuários locais e histórico compacto.
- `editor.sqlite`: banco SQLite local usado pela bridge e pelo MCP.
- `*.sqlite-wal` / `*.sqlite-shm`: arquivos auxiliares do SQLite.
- `backups/`: cópias criadas antes de migrações ou resets.
- `exports/`: arquivos exportados localmente para Godot/Unity/atlas.

O conteúdo de runtime é ignorado pelo Git, com exceção deste README e de `.gitkeep`. Não commite bancos, JSONs locais, backups ou exports gerados. Para recriar arquivos iniciais:

```bash
npm run runtime:migrate
```

Para limpar o runtime local com backup antes:

```bash
npm run runtime:reset
```
