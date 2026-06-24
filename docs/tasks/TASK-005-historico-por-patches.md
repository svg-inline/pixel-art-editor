# TASK-005 — Trocar histórico por patches/comandos

Prioridade: P0  
Área: Persistência / Undo / Performance  
Tipo: Refatoração de dados

## Objetivo

Substituir snapshots completos do projeto por histórico baseado em patches ou comandos reversíveis.

## Problema

`pixel-art-db.json` ficou grande demais porque histórico antigo guardou projetos expandidos com arrays de 65.536 pixels. Mesmo com poucas entradas, o arquivo já ficou pesado. Para editor profissional, undo/history não deve salvar snapshot completo a cada ação.

## Arquivos prováveis

- `shared/history.ts`
- `shared/pixel-core.ts`
- `server/bridge-server.ts`
- `web/App.tsx`
- arquivo de persistência atual do projeto
- `pixel-art-db.json`

## Checklist

- [ ] Definir formato `HistoryCommand`.
- [ ] Definir formato `PixelPatch`.
- [ ] Criar comando para `setPixel`.
- [ ] Criar comando para `drawLine`.
- [ ] Criar comando para `drawRect`.
- [ ] Criar comando para `floodFill`.
- [ ] Criar comando para operações de camada/frame.
- [ ] Criar `applyPatch`.
- [ ] Criar `revertPatch`.
- [ ] Substituir undo/redo por stack de patches.
- [ ] Persistir histórico compacto.
- [ ] Limitar tamanho do histórico.
- [ ] Criar migração para descartar/compactar snapshots antigos.

## Exemplo de formato

```ts
type PixelPatch = {
  type: 'pixels.changed'
  frameId: string
  layerId: string
  changes: Array<{
    index: number
    before: string | null
    after: string | null
  }>
}
```

## Critérios de aceite

- Undo/redo funciona sem salvar projeto inteiro.
- Histórico de 100 ações pequenas não explode o tamanho do banco.
- A bridge consegue persistir e recuperar histórico.
- Operações MCP também entram no histórico.
- É possível ver qual comando gerou uma alteração.

## Risco

Patches precisam guardar `before` e `after`; sem isso o redo/undo fica quebrado.
