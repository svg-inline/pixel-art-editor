# TASK-014 — Melhorar histórico, undo/redo e UI de patches

Prioridade: P2  
Área: Histórico / UX / Persistência  
Tipo: Feature estrutural  
Status inicial: Backlog

## Objetivo

Expor o histórico por patches de forma navegável e confiável na UI, com undo/redo claro e integração com operações de IA.

## Contexto técnico

O histórico por patches já é um avanço sobre snapshots gigantes. O próximo passo é tornar esse histórico visível, auditável e seguro para o usuário, principalmente quando alterações vierem da IA.

## Arquivos prováveis

- `shared/diff.ts`
- `shared/history.ts`
- `web/components/HistoryPanel.tsx`
- `web/hooks/useProject.ts`
- `server/**/*.ts`
- `tests/**/*.test.ts`

## Dependências

- TASK-007
- TASK-010

## Checklist

- [ ] Criar painel de histórico com lista de ações.
- [ ] Nomear ações humanas: draw, erase, fill, move, rotate, layer change, frame change.
- [ ] Nomear ações de IA com prompt resumido e provider.
- [ ] Permitir undo/redo por ação.
- [ ] Permitir preview de alteração antes de reverter quando aplicável.
- [ ] Garantir que patches tenham operação inversa ou snapshot mínimo seguro.
- [ ] Persistir histórico relevante sem inflar banco.
- [ ] Limitar tamanho do histórico com política clara.
- [ ] Adicionar testes de apply/revert patch.

## Critérios de aceite

- [ ] Usuário entende o que será desfeito antes de clicar.
- [ ] Undo/redo preserva pixels, camadas, frames e metadata.
- [ ] Operações de IA aparecem no histórico.
- [ ] Histórico não volta a salvar snapshots gigantes por padrão.
- [ ] Testes cobrem pelo menos draw, fill, layer, frame e AI patch.

## O que não deve ser feito

- [ ] Não voltar para histórico por snapshot completo como padrão.
- [ ] Não permitir undo quebrar schema do projeto.
- [ ] Não esconder operações de IA do histórico.
- [ ] Não salvar prompt sensível sem considerar privacidade em futura versão com login.
- [ ] Não criar histórico infinito sem limite.

## Ações mínimas no histórico

```txt
draw_pixel
erase_pixel
fill_area
transform_selection
create_layer
delete_layer
create_frame
delete_frame
ai_preview_accept
import_asset
export_asset
```

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.
