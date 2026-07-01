# TASK-017 — Melhorar documentação de setup, variáveis e fluxos

Prioridade: P2  
Área: Documentação / DX  
Tipo: Documentação técnica  
Status: Concluída

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

- [x] Documentar instalação limpa.
- [x] Documentar scripts disponíveis.
- [x] Documentar variáveis: bridge port, token, CORS, AI endpoint, runtime path.
- [x] Documentar diferença entre IA real e fallback heurístico.
- [x] Documentar como rodar MCP.
- [x] Documentar como conectar editor à bridge.
- [x] Documentar export para Godot/Unity.
- [x] Documentar onde ficam bancos/runtime locais.
- [x] Documentar como gerar ZIP limpo.
- [x] Documentar troubleshooting de erros comuns.

## Critérios de aceite

- [x] Um dev novo consegue rodar o projeto seguindo o README.
- [x] Variáveis obrigatórias e opcionais estão claras.
- [x] Godot possui instrução separada e testável.
- [x] Documentação não promete IA real quando só fallback está ativo.
- [x] Comandos documentados batem com `package.json`.

## O que não deve ser feito

- [x] Não deixar comandos antigos conflitantes.
- [x] Não documentar segredo real em exemplo.
- [x] Não prometer recurso que ainda não existe.
- [x] Não misturar instruções Windows/Linux sem indicar diferença.
- [x] Não usar README como depósito de backlog gigante.

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

## Resultado da validação

Validação executada em 2026-06-30:

- `npm run typecheck`: passou.
- `npm test`: 99 testes passando.
- `npm run build`: passou.
- O código do addon Godot não foi alterado; o guia separado foi alinhado ao fluxo e aos caminhos implementados no addon e recebeu um checklist de validação manual.
