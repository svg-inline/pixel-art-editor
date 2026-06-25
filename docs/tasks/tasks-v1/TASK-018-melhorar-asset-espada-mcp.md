# TASK-018 — Melhorar asset da espada gerada via MCP

Prioridade: P3  
Área: Direção de arte / QA visual  
Tipo: Melhoria de asset

## Objetivo

Criar variações melhores da espada gerada via MCP, mantendo transparência real, leitura de gameplay e compatibilidade com Godot.

## Estado atual

A imagem está tecnicamente correta:

- 256x256;
- transparência real;
- sem falso fundo quadriculado;
- 18 cores visíveis no PNG;
- bounds x 68–186, y 19–247;
- objeto ocupa 119x229;
- centro bom, com offset Y +6.

## Problemas visuais

- Está limpa demais.
- Parece muito geométrica.
- Tem pouco desgaste.
- Tem pouca identidade de fantasia feudal sombria.
- Lâmina e guarda parecem ícone vetorial pixelado.
- Cabo poderia ter mais textura.
- Contorno escuro domina bastante.
- Falta pivot/origin.

## Checklist

- [ ] Reduzir um pouco a altura ou aumentar margem inferior.
- [ ] Adicionar lascas/nicks na lâmina.
- [ ] Quebrar simetria perfeita.
- [ ] Adicionar sujeira, ferrugem leve ou metal gasto.
- [ ] Melhorar clusters de pixel na lâmina.
- [ ] Adicionar sombra interna mais controlada.
- [ ] Definir pivot/origin.
- [ ] Criar versão `pickup`.
- [ ] Criar versão `inventory_icon`.
- [ ] Criar versão `weapon_equipped`.
- [ ] Criar variação comum.
- [ ] Criar variação rara.
- [ ] Criar variação Valdren.
- [ ] Criar variação relíquia.
- [ ] Criar variação enferrujada.
- [ ] Rodar QA visual em todas as versões.

## Critérios de aceite

- PNG mantém alpha real.
- Não há falso fundo quadriculado.
- Asset não encosta no limite inferior.
- Cada variação tem identidade própria.
- Metadata contém pivot/origin.
- Exportação Godot inclui PNG + metadata.
