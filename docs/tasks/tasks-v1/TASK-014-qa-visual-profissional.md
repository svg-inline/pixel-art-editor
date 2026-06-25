# TASK-014 — Melhorar QA visual profissional de sprite

Prioridade: P2  
Área: QA / Validação visual  
Tipo: Feature

## Objetivo

Evoluir o QA básico para validação profissional de sprites e assets de jogo.

## Problema

O QA atual valida métricas básicas, mas ainda falta validação orientada a produção: bounds, margem, paleta, alpha, falso fundo, legibilidade, frame consistency e exportabilidade.

## Arquivos prováveis

- `shared/pixel-core.ts`
- `shared/quality-report.ts`
- `web/App.tsx`
- `server/mcp-server.ts`

## Checklist

- [ ] Validar transparência real.
- [ ] Detectar falso fundo quadriculado.
- [ ] Medir pixels opacos/transparentes.
- [ ] Medir alpha parcial.
- [ ] Medir número de cores.
- [ ] Medir bounds do objeto.
- [ ] Medir margem mínima.
- [ ] Medir centro/offset.
- [ ] Validar limite de cores por perfil.
- [ ] Validar pivot/origin ausente.
- [ ] Validar consistência entre frames.
- [ ] Validar tamanho ocupado versus canvas.
- [ ] Gerar relatório legível no editor.
- [ ] Permitir auto-fix quando seguro.

## Critérios de aceite

- QA mostra problemas antes da exportação.
- QA bloqueia ou alerta sobre falso fundo.
- QA alerta quando asset está encostando na borda.
- QA alerta ausência de pivot para asset de jogo.
- MCP pode retornar relatório de QA.
