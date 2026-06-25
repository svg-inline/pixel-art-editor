# TASK-013 — Adicionar provider real de IA

Prioridade: P2  
Área: IA / Geração de assets  
Tipo: Feature estratégica

## Objetivo

Separar geração heurística/local de provider real de IA, mantendo fallback local para desenvolvimento.

## Problema

O projeto chama a geração de “IA”, mas o provider padrão é heurístico/local. Ele desenha formas por regra. Isso valida fluxo, mas não é IA real.

## Arquivos prováveis

- `server/ai/AIProvider.ts`
- `server/ai/local-heuristic-provider.ts`
- `server/ai/http-ai-provider.ts`
- `server/mcp-server.ts`
- `server/bridge-server.ts`
- `web/App.tsx`
- `.env.example`

## Checklist

- [ ] Criar interface `AIProvider`.
- [ ] Manter provider heurístico como fallback.
- [ ] Criar provider HTTP usando `PIXEL_AI_ENDPOINT`.
- [ ] Enviar prompt, projeto atual, paleta, seleção e constraints.
- [ ] Receber JSON diff ou PNG/frames.
- [ ] Validar resposta com Zod.
- [ ] Pós-processar para pixel art: paleta, alpha, bounds, limite de cores.
- [ ] Gerar preview antes de aplicar.
- [ ] Permitir accept/reject.
- [ ] Registrar prompt e provider no histórico.
- [ ] Documentar variáveis de ambiente.

## Critérios de aceite

- Sem `PIXEL_AI_ENDPOINT`, fallback local funciona.
- Com `PIXEL_AI_ENDPOINT`, servidor chama provider externo.
- Resposta inválida é rejeitada sem corromper projeto.
- Usuário consegue pré-visualizar antes de aplicar.
- MCP consegue acionar o mesmo fluxo.

## Observação

Não vender o recurso como IA real quando estiver usando provider heurístico.
