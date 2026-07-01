# TASK-014 — Melhorar histórico, undo/redo e UI de patches

Prioridade: P2  
Área: Histórico / UX / Persistência  
Tipo: Feature estrutural  
Status: Concluída em 2026-06-29

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

- [x] Criar painel de histórico com lista de ações.
- [x] Nomear ações humanas: draw, erase, fill, move, rotate, layer change, frame change.
- [x] Nomear ações de IA com prompt resumido e provider.
- [x] Permitir undo/redo por ação.
- [x] Permitir preview de alteração antes de reverter quando aplicável.
- [x] Garantir que patches tenham operação inversa ou snapshot mínimo seguro.
- [x] Persistir histórico relevante sem inflar banco.
- [x] Limitar tamanho do histórico com política clara.
- [x] Adicionar testes de apply/revert patch.

## Critérios de aceite

- [x] Usuário entende o que será desfeito antes de clicar.
- [x] Undo/redo preserva pixels, camadas, frames e metadata.
- [x] Operações de IA aparecem no histórico.
- [x] Histórico não volta a salvar snapshots gigantes por padrão.
- [x] Testes cobrem pelo menos draw, fill, layer, frame e AI patch.

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

Validação executada em 2026-06-29: `npm run typecheck`, `npm test` (93 testes)
e `npm run build`, todos concluídos com sucesso.

## Política implementada

- A sessão mantém no máximo 100 comandos e persiste patches no navegador com
  orçamento de 1,5 MB; comandos mais antigos são descartados primeiro.
- SQLite mantém fisicamente no máximo 100 entradas por trilha de histórico,
  auditoria de IA e exportações.
- Draw, erase, fill, layer, frame e metadata usam patches inversíveis. Snapshot
  compacto integral fica restrito a importação/substituição estrutural que não
  possa ser representada com segurança pelos patches específicos.
- O comando navegável de IA persiste somente um resumo de até 120 caracteres do
  prompt; a auditoria técnica local da TASK-010 continua separada, enquanto
  provider, modelo e resultado permanecem visíveis no painel.

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.
