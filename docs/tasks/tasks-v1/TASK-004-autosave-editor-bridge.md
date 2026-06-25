# TASK-004 — Implementar autosave debounced Editor → Bridge

Prioridade: P0  
Área: Integração Editor / Bridge / MCP  
Tipo: Funcionalidade crítica

## Objetivo

Garantir que o MCP sempre leia o projeto atual desenhado no editor, sem depender de salvamento manual.

## Problema

MCP → editor funciona via SSE, mas editor → MCP ainda depende de salvar manualmente no backend. Se o usuário desenha e não salva, o MCP pode operar sobre um projeto antigo.

## Arquivos prováveis

- `web/App.tsx`
- `server/bridge-server.ts`
- `shared/pixel-core.ts`
- arquivo de client HTTP do frontend, se existir

## Checklist

- [ ] Criar estado `dirty` no editor.
- [ ] Criar autosave debounced após alterações no projeto.
- [ ] Definir debounce inicial: 500ms a 1500ms.
- [ ] Cancelar autosave se projeto não mudou.
- [ ] Evitar salvar a cada mousemove individual.
- [ ] Enviar versão/revision do projeto para bridge.
- [ ] Bridge deve rejeitar escrita com revision antiga.
- [ ] Exibir estado discreto: `salvando`, `salvo`, `erro`.
- [ ] MCP deve ler sempre a última versão persistida.
- [ ] Testar conflito: editor desenha enquanto MCP aplica alteração.

## Critérios de aceite

- Ao desenhar no canvas, a bridge recebe atualização sem clique manual.
- MCP lê a versão recém-editada.
- Não há flood de requests durante desenho contínuo.
- Em erro de autosave, o usuário vê indicação.
- Não ocorre sobrescrita silenciosa por versão velha.

## Risco

Autosave ingênuo pode gerar perda de edição. Use `revision`, escrita atômica e controle de concorrência.
