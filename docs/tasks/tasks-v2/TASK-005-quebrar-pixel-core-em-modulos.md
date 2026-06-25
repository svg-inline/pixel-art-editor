# TASK-005 — Quebrar `pixel-core.ts` em módulos especializados

Prioridade: P1  
Área: Shared Core / Arquitetura  
Tipo: Refatoração estrutural  
Status inicial: Backlog

## Objetivo

Dividir `shared/pixel-core.ts` em módulos menores, preservando API pública compatível onde necessário.

## Contexto técnico

O core compartilhado resolveu a duplicação entre frontend/backend/MCP, mas agora concentra raster, render, seleção, QA, export, animação, parser e modelo. Isso vira gargalo para manutenção e testes.

## Arquivos prováveis

- `shared/pixel-core.ts`
- `shared/model.ts`
- `shared/palette.ts`
- `shared/raster.ts`
- `shared/render.ts`
- `shared/selection.ts`
- `shared/animation.ts`
- `shared/qa.ts`
- `shared/export-godot.ts`
- `shared/export-unity.ts`
- `shared/export-aseprite.ts`
- `shared/prompt-parser.ts`
- `shared/index.ts`

## Dependências

- TASK-004 pode ser feita antes ou em paralelo, mas não no mesmo PR grande.

## Checklist

- [ ] Criar mapa de exports atuais de `pixel-core.ts`.
- [ ] Separar tipos/modelos em `model.ts`.
- [ ] Separar funções de raster/pixel em `raster.ts`.
- [ ] Separar composição/renderização em `render.ts`.
- [ ] Separar seleção/transformações em `selection.ts`.
- [ ] Separar animações em `animation.ts`.
- [ ] Separar QA em `qa.ts`.
- [ ] Separar exports por engine/formato.
- [ ] Criar `shared/index.ts` como fachada pública.
- [ ] Atualizar imports no web, server e MCP.
- [ ] Garantir que testes existentes continuem passando.

## Critérios de aceite

- [ ] Nenhuma função pública necessária é perdida.
- [ ] Imports ficam mais claros e específicos.
- [ ] Testes atuais passam sem regressão.
- [ ] Arquivos novos têm responsabilidade única.
- [ ] `pixel-core.ts` deixa de ser o ponto central de toda regra de negócio ou vira apenas fachada temporária.

## O que não deve ser feito

- [ ] Não alterar comportamento visual do editor.
- [ ] Não mudar schema do projeto nesta task.
- [ ] Não misturar refatoração com otimização de performance profunda.
- [ ] Não criar dependência circular entre módulos shared.
- [ ] Não duplicar funções antigas nos novos módulos.

## Estrutura alvo sugerida

```txt
shared/
  index.ts
  model.ts
  palette.ts
  raster.ts
  render.ts
  selection.ts
  animation.ts
  qa.ts
  export-godot.ts
  export-unity.ts
  export-aseprite.ts
  prompt-parser.ts
```

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.
