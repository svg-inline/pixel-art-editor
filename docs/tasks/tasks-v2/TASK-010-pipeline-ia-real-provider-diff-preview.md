# TASK-010 — Profissionalizar pipeline de IA com provider, diff, preview e auditoria

Prioridade: P1  
Área: IA / MCP / Bridge  
Tipo: Feature estrutural  
Status inicial: Backlog

## Objetivo

Separar claramente geração heurística local de geração por IA real e transformar toda alteração de IA em diff auditável com preview, accept/reject e histórico.

## Contexto técnico

O projeto já aceita `PIXEL_AI_ENDPOINT` e possui fallback local. Isso é bom, mas o produto não deve tratar fallback heurístico como IA real. A IA precisa operar por contrato: input validado, output validado, diff visual, aceite explícito e rastreabilidade.

## Arquivos prováveis

- `.env.example`
- `server/ai-provider.ts`
- `server/bridge-server.ts`
- `mcp/**/*.ts`
- `shared/schemas.ts`
- `shared/diff.ts`
- `web/components/AiPanel.tsx`
- `web/hooks/useBridge.ts`
- `tests/**/*.test.ts`

## Dependências

- TASK-007
- TASK-014

## Checklist

- [ ] Definir contrato do provider externo: request, response, erros e timeout.
- [ ] Separar `heuristic` de `external-ai` na UI e logs.
- [ ] Validar prompt, projeto atual e parâmetros antes de enviar ao provider.
- [ ] Normalizar output recebido do provider.
- [ ] Converter output de IA em patch/diff, não snapshot cego.
- [ ] Gerar preview visual antes de aplicar.
- [ ] Exigir accept/reject explícito no frontend.
- [ ] Registrar prompt, provider, timestamp, diff e resultado no histórico.
- [ ] Criar fallback seguro quando provider falhar.
- [ ] Adicionar limite de tamanho/tempo para resposta de IA.
- [ ] Adicionar testes com provider fake.

## Critérios de aceite

- [ ] Usuário consegue saber se a geração veio do provider real ou fallback heurístico.
- [ ] Nenhuma resposta de IA altera o projeto sem preview e aceite.
- [ ] Diff aplicado é validado por schema.
- [ ] Falha do provider não corrompe projeto.
- [ ] Histórico mostra operação de IA de forma auditável.
- [ ] Testes cobrem accept, reject, timeout e payload inválido.

## O que não deve ser feito

- [ ] Não chamar fallback heurístico de IA real.
- [ ] Não aplicar JSON bruto do provider direto no estado.
- [ ] Não salvar chave de IA no frontend.
- [ ] Não travar UI esperando provider indefinidamente.
- [ ] Não remover o fallback local, pois ele é útil para desenvolvimento.

## Estados esperados na UI

```txt
idle
validating
sending_to_provider
preview_ready
accepted
rejected
failed_with_recoverable_error
```

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.
