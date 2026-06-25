# TASK-017 — Melhorar documentação de setup, variáveis e fluxos

Prioridade: P2  
Área: Documentação / DX  
Tipo: Documentação técnica  
Status inicial: Backlog

## Objetivo

Atualizar documentação para reduzir ambiguidade sobre instalação, bridge, MCP, IA, Godot, exports e arquivos runtime.

## Contexto técnico

O projeto cresceu: web editor, server bridge, MCP, SQLite, IA externa, fallback local, exports e Godot. Sem documentação clara, o setup vira tentativa e erro.

## Arquivos prováveis

- `README.md`
- `.env.example`
- `godot/README-GODOT.md`
- `docs/**/*.md`
- `package.json`

## Dependências

- TASK-002
- TASK-003
- TASK-010

## Checklist

- [ ] Documentar instalação limpa.
- [ ] Documentar scripts disponíveis.
- [ ] Documentar variáveis: bridge port, token, CORS, AI endpoint, runtime path.
- [ ] Documentar diferença entre IA real e fallback heurístico.
- [ ] Documentar como rodar MCP.
- [ ] Documentar como conectar editor à bridge.
- [ ] Documentar export para Godot/Unity.
- [ ] Documentar onde ficam bancos/runtime locais.
- [ ] Documentar como gerar ZIP limpo.
- [ ] Documentar troubleshooting de erros comuns.

## Critérios de aceite

- [ ] Um dev novo consegue rodar o projeto seguindo o README.
- [ ] Variáveis obrigatórias e opcionais estão claras.
- [ ] Godot possui instrução separada e testável.
- [ ] Documentação não promete IA real quando só fallback está ativo.
- [ ] Comandos documentados batem com `package.json`.

## O que não deve ser feito

- [ ] Não deixar comandos antigos conflitantes.
- [ ] Não documentar segredo real em exemplo.
- [ ] Não prometer recurso que ainda não existe.
- [ ] Não misturar instruções Windows/Linux sem indicar diferença.
- [ ] Não usar README como depósito de backlog gigante.

## Estrutura sugerida de README

```txt
1. Visão geral
2. Setup rápido
3. Scripts
4. Bridge/MCP
5. IA externa vs fallback local
6. Exportações
7. Godot
8. Runtime e banco local
9. Troubleshooting
```

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.
