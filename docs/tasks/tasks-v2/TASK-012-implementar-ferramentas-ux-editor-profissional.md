# TASK-012 — Implementar ferramentas e UX de editor profissional

Prioridade: P2  
Área: Frontend / UX / Ferramentas  
Tipo: Feature profissional  
Status inicial: Backlog

## Objetivo

Adicionar ferramentas de edição que tornam o editor usável para produção real, não apenas geração/preview.

## Contexto técnico

O editor já possui seleção, linha, retângulo e elipse, mas ainda faltam recursos comuns de produtividade: pan/zoom decente, atalhos configuráveis, lock alpha, lock layer, merge down, simetria, magic wand e lasso.

## Arquivos prováveis

- `web/components/CanvasEditor.tsx`
- `web/components/Toolbar.tsx`
- `web/components/LayerPanel.tsx`
- `web/hooks/useCanvasInput.ts`
- `web/hooks/useKeyboardShortcuts.ts`
- `shared/selection.ts`
- `shared/raster.ts`

## Dependências

- TASK-004
- TASK-005
- TASK-009

## Checklist

- [ ] Implementar pan com spacebar ou botão central.
- [ ] Implementar zoom centrado no cursor.
- [ ] Criar sistema de atalhos configuráveis ou pelo menos documentados.
- [ ] Adicionar lock alpha por camada.
- [ ] Adicionar lock layer.
- [ ] Adicionar merge down.
- [ ] Adicionar ferramenta de simetria horizontal/vertical.
- [ ] Adicionar magic wand baseada em cor/contiguidade.
- [ ] Adicionar lasso ou seleção livre simplificada.
- [ ] Adicionar brush preview antes de aplicar.
- [ ] Adicionar resize canvas e crop por bounds.
- [ ] Garantir acessibilidade mínima em botões e atalhos.

## Critérios de aceite

- [ ] Usuário edita com zoom/pan sem perder precisão de pixel.
- [ ] Lock alpha impede alteração em pixels transparentes.
- [ ] Lock layer impede edição acidental.
- [ ] Merge down preserva composição visual.
- [ ] Magic wand seleciona área esperada por cor/contiguidade.
- [ ] Atalhos principais estão documentados.
- [ ] Testes cobrem pelo menos lock alpha, merge down e seleção.

## O que não deve ser feito

- [ ] Não adicionar todas as ferramentas em um único PR sem divisão interna.
- [ ] Não usar antialiasing em ferramentas pixel art.
- [ ] Não alterar pixels em camada bloqueada.
- [ ] Não fazer resize com interpolação suave por padrão.
- [ ] Não esconder atalhos sem documentação.

## Subtasks sugeridas

```txt
12A - Pan/zoom/atalhos
12B - Lock alpha/layer/merge down
12C - Simetria/magic wand/lasso
12D - Resize/crop/brush preview
```

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.
