# TASK-009 — Criar modelo de dados com assets, animações e direções

Prioridade: P1  
Área: Modelo de dados  
Tipo: Arquitetura profissional

## Objetivo

Evoluir o projeto de uma animação ativa simples para um modelo profissional com múltiplos assets, animações, direções, frames, pivot e hitboxes.

## Problema

O modelo atual representa basicamente uma animação ativa. Isso limita personagem com idle/walk/attack, 8 direções, exportação para Godot e organização de assets.

## Arquivos prováveis

- `shared/schema.ts`
- `shared/pixel-core.ts`
- `web/App.tsx`
- `server/bridge-server.ts`
- `server/mcp-server.ts`
- exportadores Godot/JSON

## Modelo alvo

```ts
type Project = {
  assets: Asset[]
}

type Asset = {
  id: string
  name: string
  palette: Palette
  animations: Animation[]
  exportProfiles: ExportProfile[]
}

type Animation = {
  id: string
  name: string
  direction: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'
  fps: number
  loop: boolean
  frames: Frame[]
}

type Frame = {
  id: string
  duration: number
  layers: Layer[]
  pivot: Point
  hitboxes: Hitbox[]
}
```

## Checklist

- [ ] Criar schema v2 do projeto.
- [ ] Criar migration v1 → v2.
- [ ] Adicionar `assets`.
- [ ] Adicionar `animations`.
- [ ] Adicionar `direction`.
- [ ] Adicionar `duration` por frame.
- [ ] Adicionar `pivot`.
- [ ] Adicionar `hitboxes`.
- [ ] Atualizar timeline para animação ativa.
- [ ] Atualizar exportação JSON.
- [ ] Atualizar exportação spritesheet.
- [ ] Atualizar MCP para escolher asset/animação/direção.

## Critérios de aceite

- Projeto antigo abre via migration.
- Novo projeto suporta múltiplas animações.
- Cada animação pode ter direção.
- Exportação preserva animação/direção/frame duration.
- Godot consegue consumir metadados básicos.
