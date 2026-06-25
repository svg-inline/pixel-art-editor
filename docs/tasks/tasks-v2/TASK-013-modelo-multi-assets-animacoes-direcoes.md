# TASK-013 — Consolidar modelo multi-assets, animações e direções

Prioridade: P2  
Área: Modelo de dados / Game Pipeline  
Tipo: Arquitetura de produto  
Status inicial: Backlog

## Objetivo

Evoluir o schema do projeto para suportar produção real de assets com múltiplas animações, direções e perfis de exportação.

## Contexto técnico

O projeto já tem conceitos de assets/animações, mas precisa ficar sólido para RPG/top-down: idle, walk, attack, dodge, skills e 4 ou 8 direções. Também precisa organizar pivot, boxes e export profiles por asset/animação/frame.

## Arquivos prováveis

- `shared/model.ts`
- `shared/schemas.ts`
- `shared/animation.ts`
- `web/components/Timeline.tsx`
- `web/components/GameDataPanel.tsx`
- `shared/export-godot.ts`
- `shared/export-unity.ts`

## Dependências

- TASK-005
- TASK-007

## Checklist

- [ ] Definir schema final de `Project`, `Asset`, `Animation`, `Frame`, `Layer`.
- [ ] Adicionar suporte explícito a direção: N, NE, E, SE, S, SW, W, NW.
- [ ] Permitir múltiplas animações por asset.
- [ ] Permitir duração por frame além de FPS global.
- [ ] Associar pivot/origin por frame ou por animação com override.
- [ ] Associar hitbox/hurtbox/attackbox por frame.
- [ ] Adicionar export profiles por asset.
- [ ] Criar migration para projetos antigos.
- [ ] Atualizar UI para escolher asset, animação e direção.
- [ ] Atualizar exports para respeitar animação/direção.

## Critérios de aceite

- [ ] Projeto antigo abre corretamente após migration.
- [ ] Usuário cria um asset com pelo menos idle/walk/attack.
- [ ] Usuário define direção por animação.
- [ ] Export gera metadata com animações e direções.
- [ ] Godot/Unity recebem informações suficientes para reconstruir animações.
- [ ] Testes cobrem migration e export com múltiplas animações.

## O que não deve ser feito

- [ ] Não quebrar projetos existentes sem migration.
- [ ] Não guardar direção apenas no nome do arquivo.
- [ ] Não duplicar frames desnecessariamente para cada engine.
- [ ] Não acoplar modelo ao Godot.
- [ ] Não impor 8 direções para assets que precisam só de 1 ou 4.

## Modelo alvo simplificado

```ts
Project {
  assets: Asset[]
  palettes: Palette[]
  exportProfiles: ExportProfile[]
}

Asset {
  id: string
  name: string
  animations: Animation[]
}

Animation {
  id: string
  name: string
  direction?: 'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'
  fps: number
  loop: boolean
  frames: Frame[]
}

Frame {
  id: string
  durationMs?: number
  layers: Layer[]
  pivot?: Point
  hitboxes?: Box[]
  hurtboxes?: Box[]
  attackboxes?: Box[]
}
```

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.
