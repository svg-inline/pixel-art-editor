# Contrato do provider de IA

O bridge usa `PIXEL_AI_ENDPOINT` somente no servidor. A chave configurada em
`PIXEL_AI_API_KEY` nunca é enviada ao frontend.

Sem endpoint, o provider ativo é `local-heuristic` e sua origem é exibida como
`heuristic`. Com endpoint configurado, a origem bem-sucedida é `external-ai`.
Se o provider externo falhar, o bridge gera um preview com o provider
heurístico e registra a causa do fallback; ele nunca apresenta esse resultado
como IA externa.

## Request

O endpoint recebe `POST` com `content-type: application/json` e, quando houver
chave, `authorization: Bearer <PIXEL_AI_API_KEY>`.

```json
{
  "prompt": "crie uma espada curta",
  "operation": "generate",
  "project": { "format": "pixel-art-compact-v1" },
  "selection": null,
  "palette": ["#000000", "#ffffff"],
  "constraints": {
    "size": 256,
    "maxColors": 32,
    "preserveOutsideSelection": false
  }
}
```

`prompt` tem de 1 a 2.000 caracteres. Operação, projeto expandido, seleção,
cores e limites são validados antes da chamada externa.

## Response

A resposta deve usar `application/json` e conter ao menos um dos campos:

- `project`: projeto completo ou compacto;
- `frames`: frames a normalizar sobre o projeto atual;
- `diff`: uma alteração de pixels ou uma lista delas.

Também pode informar `provider`, `model` e `warnings`. O bridge normaliza e
valida o resultado como projeto, converte-o para `ProjectDiff` e só então cria
um preview. JSON bruto do provider nunca é aplicado diretamente.

## Limites e erros

- `PIXEL_AI_TIMEOUT_MS`: timeout, padrão `15000`;
- `PIXEL_AI_MAX_RESPONSE_BYTES`: resposta máxima, padrão `2097152`;
- status HTTP não-2xx, content-type inválido, timeout, resposta grande, JSON
  inválido e payload inválido são falhas recuperáveis do provider externo;
- request local inválido não é enviado e não aciona fallback externo.

Quando o endpoint externo falha, `FallbackAIProvider` tenta
`LocalHeuristicProvider`. Se o fallback gerar um projeto válido, o usuário ainda
recebe um preview explícito com `providerKind: "heuristic"` e a causa em
`fallback.code`.

## Preview, aceite e auditoria

`POST /api/ai-preview` e o endpoint legado `POST /api/ai-prompt` apenas criam
preview. A alteração só é persistida por
`POST /api/ai-preview/:id/accept`; `DELETE /api/ai-preview/:id` rejeita o
preview.

Prompt, operação, provider, timestamp, diff, resumo, avisos, erro e resultado
(`preview_ready`, `accepted`, `rejected` ou
`failed_with_recoverable_error`) são persistidos em `ai_audit` e aparecem em
`GET /api/history`. Previews de IA criados pelo MCP usam a mesma auditoria.
