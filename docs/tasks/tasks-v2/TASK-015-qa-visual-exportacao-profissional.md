# TASK-015 — Criar QA visual profissional para pixel art e exports

Prioridade: P2  
Área: QA / Exportação / Arte  
Tipo: Qualidade visual  
Status inicial: Backlog

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

- [ ] Detectar fundo quadriculado falso pintado como pixels reais.
- [ ] Detectar alpha parcial quando preset exigir alpha binário.
- [ ] Contar cores visíveis e comparar com limite configurado.
- [ ] Calcular bounds do objeto por frame.
- [ ] Avisar quando asset estiver descentralizado além de tolerância.
- [ ] Avisar margem insuficiente para spritesheet/atlas.
- [ ] Validar pivot/origin obrigatório para export de jogo.
- [ ] Validar hitbox/hurtbox/attackbox quando perfil exigir.
- [ ] Comparar projeto vs PNG exportado para evitar divergência.
- [ ] Exibir relatório claro na UI antes do export.
- [ ] Adicionar testes com PNG/projeto sintético.

## Critérios de aceite

- [ ] QA detecta falso quadriculado em caso sintético.
- [ ] QA informa transparência real e alpha parcial.
- [ ] QA mostra número de cores visíveis por frame/asset.
- [ ] Export pode bloquear ou alertar conforme perfil escolhido.
- [ ] Relatório é compreensível para artista/desenvolvedor.
- [ ] Testes cobrem pelo menos 6 validações.

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
