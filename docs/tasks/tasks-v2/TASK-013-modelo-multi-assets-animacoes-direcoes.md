# TASK-013 — Consolidar modelo multi-assets, animações e direções

Prioridade: P2  
Área: Modelo de dados / Game Pipeline  
Tipo: Arquitetura de produto  
Status: Concluída

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

- [x] Definir schema final de `Project`, `Asset`, `Animation`, `Frame`, `Layer`.
- [x] Adicionar suporte explícito a direção: N, NE, E, SE, S, SW, W, NW.
- [x] Permitir múltiplas animações por asset.
- [x] Permitir duração por frame além de FPS global.
- [x] Associar pivot/origin por frame ou por animação com override.
- [x] Associar hitbox/hurtbox/attackbox por frame.
- [x] Adicionar export profiles por asset.
- [x] Criar migration para projetos antigos.
- [x] Atualizar UI para escolher asset, animação e direção.
- [x] Atualizar exports para respeitar animação/direção.

## Critérios de aceite

- [x] Projeto antigo abre corretamente após migration.
- [x] Usuário cria um asset com pelo menos idle/walk/attack.
- [x] Usuário define direção por animação.
- [x] Export gera metadata com animações e direções.
- [x] Godot/Unity recebem informações suficientes para reconstruir animações.
- [x] Testes cobrem migration e export com múltiplas animações.

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

## Resultado da implementação

- Schema v3 com migração automática de projetos legados e aliases compatíveis com o schema v2.
- Pivot padrão por animação, override por frame e coleções explícitas de hurtboxes/attackboxes.
- Perfis Godot e Unity por asset, incluindo pixels por unidade.
- Metadados Godot e Unity em layout multi-row, com todas as animações, direções e durações.
- Pacote ZIP inclui spritesheet da animação ativa e spritesheet completo do asset.
- O addon/projeto em `godot/` não foi alterado; portanto, não houve mudança de runtime a validar no editor Godot.

Validação executada em 29/06/2026:

```text
npm run typecheck        OK
npm run typecheck:strict OK
npm test                 OK (88 testes)
npm run build            OK
```
