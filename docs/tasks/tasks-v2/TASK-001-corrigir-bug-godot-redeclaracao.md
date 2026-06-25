# TASK-001 — Corrigir bug de redeclaração no addon Godot

Prioridade: P0  
Área: Godot / Integração  
Tipo: Bugfix  
Status inicial: Backlog

## Objetivo

Corrigir a redeclaração duplicada de `settings_path` no plugin Godot e garantir que o addon carregue sem erro de parser.

## Contexto técnico

Na avaliação atual, o addon Godot contém duas declarações iguais de `var settings_path := sheet_path + ".pixel_art_import.json"` na mesma função. Isso pode quebrar o carregamento do plugin no Godot antes mesmo de testar a importação.

## Arquivos prováveis

- `godot/addons/pixel_art_mcp/pixel_art_mcp_plugin.gd`
- `godot/README-GODOT.md`

## Checklist

- [ ] Remover a declaração duplicada de `settings_path`.
- [ ] Abrir o arquivo inteiro e verificar se não existem outras variáveis redeclaradas no mesmo escopo.
- [ ] Verificar se o plugin aparece habilitável em Project > Project Settings > Plugins.
- [ ] Testar o botão/fluxo de importação existente depois da correção.
- [ ] Adicionar nota curta no README Godot explicando como validar o plugin.

## Critérios de aceite

- [ ] O addon Godot carrega sem erro de parser.
- [ ] O plugin aparece na tela de plugins do Godot.
- [ ] Nenhuma funcionalidade existente de importação é removida.
- [ ] A correção é mínima e isolada ao bug encontrado.

## O que não deve ser feito

- [ ] Não reescrever o addon inteiro nesta task.
- [ ] Não alterar o protocolo da bridge.
- [ ] Não criar novo formato de metadata.
- [ ] Não mascarar o erro com `try/catch` ou checks genéricos.

## Observações

- Esta é uma task pequena e deve ser feita antes da task de importação Godot profissional.

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.
