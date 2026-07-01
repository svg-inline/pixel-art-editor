# TASK-015 — Criar QA visual profissional para pixel art e exports

Prioridade: P2  
Área: QA / Exportação / Arte  
Tipo: Qualidade visual  
Status: Concluída em 2026-06-30

## Objetivo

Ampliar validação automática de sprites para detectar problemas comuns antes de exportar para jogo.

## Contexto técnico

O projeto já possui QA básico, mas editor profissional precisa detectar falso quadriculado, alpha parcial indevido, cores acima do limite, bounds ruins, margem insuficiente, pivôs ausentes e problemas de atlas/spritesheet.

## Arquivos prováveis

- `shared/qa.ts`
- `shared/render.ts`
- `shared/export-godot.ts`
- `shared/export-unity.ts`
- `web/components/QaPanel.tsx`
- `tests/**/*.test.ts`

## Dependências

- TASK-005
- TASK-007

## Checklist

- [x] Detectar fundo quadriculado falso pintado como pixels reais.
- [x] Detectar alpha parcial quando preset exigir alpha binário.
- [x] Contar cores visíveis e comparar com limite configurado.
- [x] Calcular bounds do objeto por frame.
- [x] Avisar quando asset estiver descentralizado além de tolerância.
- [x] Avisar margem insuficiente para spritesheet/atlas.
- [x] Validar pivot/origin obrigatório para export de jogo.
- [x] Validar hitbox/hurtbox/attackbox quando perfil exigir.
- [x] Comparar projeto vs PNG exportado para evitar divergência.
- [x] Exibir relatório claro na UI antes do export.
- [x] Adicionar testes com PNG/projeto sintético.

## Critérios de aceite

- [x] QA detecta falso quadriculado em caso sintético.
- [x] QA informa transparência real e alpha parcial.
- [x] QA mostra número de cores visíveis por frame/asset.
- [x] Export pode bloquear ou alertar conforme perfil escolhido.
- [x] Relatório é compreensível para artista/desenvolvedor.
- [x] Testes cobrem pelo menos 6 validações.

## O que não deve ser feito

- [ ] Não bloquear export sempre; permitir modo aviso quando adequado.
- [ ] Não confundir checkerboard de UI com pixels reais do projeto.
- [ ] Não fazer julgamento artístico subjetivo como erro técnico.
- [ ] Não alterar arte automaticamente sem confirmação.
- [ ] Não esconder detalhes técnicos do relatório.

## Severidades sugeridas

```txt
error: export inválido para jogo
warning: export possível, mas com risco
info: métrica informativa
```

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.

## Política implementada

- Cada perfil Godot/Unity persiste `warning` ou `block`, limite de cores, alpha
  binário, margem mínima, tolerância de centro, pivot e caixas obrigatórias.
- Erros bloqueiam somente perfis em modo `block`; avisos nunca impedem o export.
- Divergência de dimensão ou pixel entre o projeto composto e o buffer PNG
  bloqueia o arquivo independentemente do modo, evitando pacote corrompido.
- O relatório lista severidade, frame, causa e detalhe técnico, além de métricas
  de transparência, alpha parcial, cores, bounds e margens.
- O detector de falso quadriculado opera apenas nos pixels reais compostos e
  exige padrão alternado de cores neutras; o checkerboard da UI não participa.

## Validação executada

Em 2026-06-30: `npm run typecheck`, `npm test` (99 testes), `npm run build` e
`npm run test:e2e` (14 fluxos Chromium).

O addon Godot não foi alterado. A compatibilidade foi revisada no consumidor
existente: campos adicionais de QA ficam dentro de `export_profile`, enquanto
`animations`, pivots, caixas, nearest filtering e caminhos `res://` permanecem
inalterados; portanto não há projeto Godot executável novo a abrir nesta task.
