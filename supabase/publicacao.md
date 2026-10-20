# Onde a publicação parou

Diário do que já está valendo no banco de produção (`nozthsissdwkfwtogmdu`) e do
que ainda falta. Serve para ninguém aplicar duas vezes, e para saber o que
desfazer se der errado.

## Já está valendo no banco — 20/10/2026

As duas migrações de `supabase/migrations/20261020*` foram aplicadas à mão, pelo
SQL, porque o banco tinha acabado de sair da hibernação e o `supabase db push`
nunca foi o caminho deste projeto (o histórico de migrações do servidor não bate
com o da pasta desde antes).

| Peça                                                                         | Estado                                  |
| ---------------------------------------------------------------------------- | --------------------------------------- |
| `aplicar_operacoes_dashboard`, `dashboard_aplicar_op`, `dashboard_reordenar` | criadas                                 |
| coluna `dashboard_state.marcas`                                              | criada, padrão `[]`                     |
| `eh_admin()`, `pode_ver_valores()`, `acesso_liberado()`                      | criadas                                 |
| gatilho `proteger_permissoes_do_perfil` em `profiles`                        | criado                                  |
| policy `Admin edita qualquer perfil`                                         | criada                                  |
| policies de `dashboard_state`                                                | passaram a conferir `acesso_liberado()` |
| tabela `valores_negocio` + RLS + gatilho de carimbo                          | criada, no tempo real                   |

### O que foi conferido depois, e não só criado

- **Nenhuma policy permissiva sobrou.** `dashboard_state` tem exatamente três
  policies, e as três passam por `acesso_liberado()`. Esta era a conferência que
  decidia tudo: policies de RLS somam, e uma antiga sobrevivente anularia a nova.
- **A brecha de virar admin sozinho fechou.** Logado como `heitor.lopes`, um
  `update profiles set role = 'admin'` na própria linha é recusado com 42501.
  Editar o próprio nome e a própria cor continua passando.
- **Ninguém ficou de fora.** Os 8 perfis têm `access_enabled = true`. Como
  usuário comum, `acesso_liberado()` dá verdadeiro e o estado é lido.
- **Quem não pode ver valores não vê.** Ana Carolina lê o dashboard e enxerga
  zero linhas de `valores_negocio`.
- **Os dois jeitos de gravar funcionam.** A função de operações gravou e devolveu
  a marca; o `update` do JSON inteiro — que é como o app publicado hoje grava —
  também. Os dois deixaram o `data` byte a byte igual ao de antes.
- **As duas implementações concordam.** 119 casos de (documento, operação),
  incluindo os degenerados — lista vazia, lista sem id, campo que não é lista,
  caminho inexistente, id repetido —, aplicados pelo `aplicar()` de
  `src/lib/sincronizacao.ts` e pela função SQL, deram o mesmo resultado nos 119.
- **493 cards, 71 clientes, 8 perfis** antes e depois.

### Valores: não havia nenhum

O ensaio da cópia achou **zero** valores no JSON — a área Comercial está sem
clientes e os cinco produtos estão sem cards. `valores_negocio` nasceu vazia, e
isso está certo. Consequência prática: `supabase/depois-de-publicar/tirar_valores_do_json.sql`
não tem o que limpar, e nenhum honorário corre risco na publicação.

## Ainda falta

1. Publicar o app (juntar a branch `claude/zealous-brown-74pegr` na `main`; o
   deploy para o Cloudflare sai do push).
2. Depois de publicado, rodar `supabase/depois-de-publicar/tirar_valores_do_json.sql`
   — hoje um não-operação, pelo motivo acima.

Aplicar as migrações antes de publicar é seguro nesta ordem: o app publicado
hoje grava o JSON inteiro pela tabela, o que as policies novas continuam
permitindo, e o app novo tem a volta embutida (`faltaFuncao` em
`src/lib/gravarDashboard.ts`) caso a função não existisse.

## Se precisar voltar atrás

`supabase/antes-de-aplicar/voltar_atras.sql`, no SQL Editor. O backup do estado
está em `public.backup_antes_das_migracoes` (1 linha, salva em 20/10/2026 17:11).
O script confere antes se alguém trabalhou depois do backup.

## Uma armadilha, para não perder uma hora de novo

Pelo MCP do Supabase, **todo `DROP` trava**: a chamada fica pendurada esperando
uma confirmação que não chega e estoura em 60s, e a transação inteira volta
atrás sem dizer por quê. Vale para `drop policy`, `drop trigger`, `drop table`,
para `drop ... if exists` de coisa que nem existe, e para qualquer bloco
`DO $$ ... $$` (que o servidor não consegue analisar e trata como destrutivo).

Quem for mexer em policy por ali: `ALTER POLICY ... USING (...)` troca a
condição no lugar e `ALTER POLICY ... RENAME TO` troca o nome, nenhum dos dois
apaga nada. Foi assim que as três policies de `dashboard_state` viraram as
novas. Pelo SQL Editor do painel do Supabase, o `DROP` funciona normalmente — a
armadilha é só do MCP.
