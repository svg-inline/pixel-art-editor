# TASK-016 — Melhorar MCP com diffs, Zod, preview e accept/reject

Prioridade: P1  
Área: MCP / IA / Segurança de dados  
Tipo: Feature estrutural

## Objetivo

Fazer o MCP operar por diffs validados, com preview antes de aplicar e histórico do comando executado.

## Problema

Aplicar projeto inteiro aumenta risco de sobrescrita, payload grande e perda de controle. MCP profissional deve propor alteração, validar, pré-visualizar e só então aplicar.

## Arquivos prováveis

- `server/mcp-server.ts`
- `server/bridge-server.ts`
- `shared/pixel-core.ts`
- `shared/schema.ts`
- `shared/diff.ts`
- `web/App.tsx`

## Checklist

- [ ] Criar schema Zod para `ProjectDiff`.
- [ ] Criar schema Zod para comandos MCP.
- [ ] Criar `applyProjectDiff`.
- [ ] Criar `validateProjectDiff`.
- [ ] MCP deve retornar diff além do projeto inteiro.
- [ ] Criar endpoint de preview.
- [ ] Editor deve mostrar preview de alteração MCP.
- [ ] Criar fluxo accept/reject.
- [ ] Registrar comando MCP no histórico.
- [ ] Registrar prompt, ferramenta, timestamp e diff.
- [ ] Proteger contra diff fora dos bounds.
- [ ] Proteger contra excesso de cores e payload gigante.

## Critérios de aceite

- MCP consegue propor alteração sem aplicar direto.
- Usuário aceita ou rejeita alteração no editor.
- Payload inválido é rejeitado.
- Histórico mostra comando que gerou a alteração.
- Project inteiro só é usado em import/export, não no fluxo normal de edição.
