# Instrucoes de trabalho — Pode Vir

## Antes de alterar

- Confira branch, `git status`, diff local e os arquivos realmente envolvidos. Git e codigo atual sao a fonte de verdade.
- Comece pelo mapa correspondente em `docs/codex/`; leia somente os documentos e contratos necessarios para a tarefa.
- Trate `HANDOFF.txt` apenas como registro historico; handoffs ausentes ou antigos nao substituem o Git e o codigo atual.
- Explique brevemente o estado encontrado, o que falta e a proxima etapa pequena antes de editar.

## Durante o trabalho

- Conclua funcionalidades ponta a ponta dentro do escopo autorizado; nao deixe frontend, API, persistencia, autorizacao ou testes parcialmente desalinhados.
- Preserve alteracoes existentes, inclusive as nao relacionadas. Nao reverta trabalho alheio para simplificar uma tarefa.
- Nao execute edicoes simultaneas na mesma pasta sem coordenacao explicita. Divida trabalho paralelo por fronteiras de arquivos claras.
- Mantenha regras especificas de catalogo, pedidos e logistica nas respectivas areas; arquitetura compartilhada nao deve centralizar todo o backend.
- Nao enfraqueca autenticacao, autorizacao, isolamento por loja, CSRF, valores financeiros autoritativos ou protecao de dados privados para contornar falhas de interface.
- Identidade e tenant devem ser resolvidos e validados no servidor. Toda operacao por recurso deve validar tenant, identidade e permissao aplicavel.
- Segredos ficam somente no servidor e no cofre do ambiente. Nunca mostre valores de `.env`, tokens, cookies, chaves ou credenciais em logs, documentos ou respostas.

## Verificacao e operacao

- Teste na proporcao do risco. Mudancas compartilhadas ou de seguranca exigem regressao de isolamento entre lojas, permissoes e caminhos autenticados relevantes.
- Consulte `docs/codex/00-SHARED.md` para invariantes e `docs/codex/06-CORE.md` para CI, runtime, Vercel, workers e ambiente.
- Nao faca commit, push, instalacao ou atualizacao de dependencias, exclusao, deploy, operacao em producao ou migracao destrutiva sem autorizacao explicita.
- Migracoes nunca rodam no startup. Siga `docs/migration.md`, use dry-run primeiro e exija autorizacao separada para qualquer aplicacao.

## Mapas por area

- `docs/codex/00-SHARED.md`: contratos e invariantes transversais.
- `docs/codex/01-LANDING.md`: landing e entrada publica.
- `docs/codex/02-CATALOGO-VITRINE.md`: catalogo e vitrine.
- `docs/codex/03-PEDIDOS-OPERACAO.md`: pedidos e operacao.
- `docs/codex/04-LOJA-LOGISTICA.md`: painel da loja e logistica.
- `docs/codex/05-MASTER.md`: administracao global.
- `docs/codex/06-CORE.md`: seguranca, infraestrutura e arquitetura compartilhada.
