# TASK-006 — Migrar TypeScript para strict mode gradual

Prioridade: P1  
Área: TypeScript / Qualidade  
Tipo: Hardening técnico  
Status inicial: Backlog

## Objetivo

Ativar regras TypeScript mais rígidas de forma incremental, começando por `shared/` e `server/`, sem travar desenvolvimento do frontend.

## Contexto técnico

O projeto já possui typecheck passando, mas `strict: false` ainda permite inconsistências em dados de projeto, patches, exports e contratos MCP. Para editor profissional, o core precisa ser estrito.

## Arquivos prováveis

- `tsconfig.json`
- `tsconfig.strict.json`
- `shared/**/*.ts`
- `server/**/*.ts`
- `mcp/**/*.ts`
- `web/**/*.tsx`

## Dependências

- TASK-005 recomendada antes para reduzir área de impacto.

## Checklist

- [ ] Criar estratégia incremental em vez de ativar `strict` no projeto inteiro de uma vez.
- [ ] Criar `tsconfig.strict.json` focado inicialmente em `shared/` e `server/`.
- [ ] Ativar `strict`, `noImplicitAny` e, se viável, `noUncheckedIndexedAccess` no config estrito.
- [ ] Corrigir tipos do core compartilhado primeiro.
- [ ] Corrigir contratos do server/MCP depois.
- [ ] Adicionar script `typecheck:strict`.
- [ ] Documentar pendências para migrar `web/` posteriormente.
- [ ] Evitar uso de `as any` como solução padrão.

## Critérios de aceite

- [ ] `npm run typecheck` continua passando.
- [ ] `npm run typecheck:strict` passa para os diretórios incluídos.
- [ ] Core compartilhado não depende de `any` desnecessário.
- [ ] Erros de null/undefined em raster, frames, layers e exports são tratados explicitamente.
- [ ] Existe plano documentado para incluir `web/` no strict depois.

## O que não deve ser feito

- [ ] Não ativar strict global e deixar o projeto quebrado.
- [ ] Não resolver tudo com `as any`, `!` ou casts cegos.
- [ ] Não trocar tipos fortes por `unknown` sem narrowing.
- [ ] Não alterar comportamento de runtime só para satisfazer compilador sem teste.
- [ ] Não bloquear outras tasks com uma migração grande demais.

## Scripts sugeridos

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "typecheck:strict": "tsc --noEmit -p tsconfig.strict.json"
  }
}
```

## Validação obrigatória

Antes de marcar a task como concluída, rodar:

```bash
npm run typecheck
npm test
npm run build
```

Se a task alterar Godot, validar também abrindo o projeto Godot com o addon ativo e registrando o comportamento esperado no README da task ou no PR.
