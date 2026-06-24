# TASK-007 — Corrigir segurança da bridge: CORS, token e SSE

Prioridade: P0  
Área: Segurança / Bridge HTTP/SSE  
Tipo: Correção crítica

## Objetivo

Impedir que qualquer página local consiga chamar a bridge e corrigir autenticação para fluxos SSE.

## Problema

A segurança da bridge é fraca quando `PIXEL_BRIDGE_TOKEN` não está ativo. Além disso, `EventSource` não envia header customizado, então autenticação por header não resolve SSE de forma limpa.

## Arquivos prováveis

- `server/bridge-server.ts`
- `web/App.tsx`
- `.env.example`
- README

## Checklist

- [ ] Definir token obrigatório por padrão em ambiente não-dev.
- [ ] Fazer bind local em `127.0.0.1` por padrão.
- [ ] Restringir CORS para origem do editor.
- [ ] Adicionar body limit nas rotas.
- [ ] Validar payload com Zod.
- [ ] Corrigir autenticação SSE via query token, cookie HttpOnly ou sessão local.
- [ ] Bloquear SSE sem token válido.
- [ ] Bloquear POST/PUT sem token válido.
- [ ] Criar `.env.example` com `PIXEL_BRIDGE_TOKEN`.
- [ ] Documentar modo dev e modo seguro.

## Critérios de aceite

- Requisição sem token não altera projeto.
- SSE sem token não conecta quando segurança estiver ativa.
- CORS não fica `*` em modo seguro.
- Editor oficial continua conectando.
- MCP continua funcionando com token configurado.

## Risco

Token via query aparece em logs. Para versão profissional, cookie/sessão local é melhor.
