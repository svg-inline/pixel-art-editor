# TASK-010 — Profissionalizar pipeline de IA com provider, diff, preview e auditoria

Prioridade: P1  
Área: IA / MCP / Bridge  
Tipo: Feature estrutural  
Status: Concluída

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

- [x] Definir contrato do provider externo: request, response, erros e timeout.
- [x] Separar `heuristic` de `external-ai` na UI e logs.
- [x] Validar prompt, projeto atual e parâmetros antes de enviar ao provider.
- [x] Normalizar output recebido do provider.
- [x] Converter output de IA em patch/diff, não snapshot cego.
- [x] Gerar preview visual antes de aplicar.
- [x] Exigir accept/reject explícito no frontend.
- [x] Registrar prompt, provider, timestamp, diff e resultado no histórico.
- [x] Criar fallback seguro quando provider falhar.
- [x] Adicionar limite de tamanho/tempo para resposta de IA.
- [x] Adicionar testes com provider fake.

## Critérios de aceite

- [x] Usuário consegue saber se a geração veio do provider real ou fallback heurístico.
- [x] Nenhuma resposta de IA altera o projeto sem preview e aceite.
- [x] Diff aplicado é validado por schema.
- [x] Falha do provider não corrompe projeto.
- [x] Histórico mostra operação de IA de forma auditável.
- [x] Testes cobrem accept, reject, timeout e payload inválido.

## O que não deve ser feito

- [x] Não chamar fallback heurístico de IA real.
- [x] Não aplicar JSON bruto do provider direto no estado.
- [x] Não salvar chave de IA no frontend.
- [x] Não travar UI esperando provider indefinidamente.
- [x] Não remover o fallback local, pois ele é útil para desenvolvimento.

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

## Implementação

- Contrato detalhado em [`docs/ai-provider-contract.md`](../../ai-provider-contract.md).
- Provider HTTP com timeout, limite de bytes, erros tipados e validação de
  request/response.
- Fallback server-side identificado como `heuristic`, com causa rastreável.
- Endpoints de IA geram `ProjectDiff` e preview; inclusive o endpoint legado não
  aplica mais alterações diretamente.
- Auditoria SQLite registra previews de bridge e MCP e seus resultados de
  aceite, rejeição ou falha.
- UI expõe todos os estados esperados, origem, diff, fallback e avisos.

Nenhum arquivo do addon Godot foi alterado; a validação adicional no editor
Godot não se aplica a esta implementação.

## Resultado da validação

- `npm run typecheck`: passou.
- `npm test`: 73 testes passaram.
- `npm run build`: build Vite de produção passou.
- `npm run typecheck:strict`: passou.
- E2E focado em preview de IA: accept e reject passaram no Chromium.
