# Paridade com o sistema atual (v4.3.0)

Cada teste do app atual (`claude-code-export/testes/s*.js`, 87 arquivos) com o que verifica, o módulo da reescrita e o destino. Módulos: 1 núcleo · 2 reservas e pedidos · 3 termos · 4 ramais e telefonia · 5 almoxarifado · 6 dashboard, histórico, relatórios e exportação · 7 migração.

Destino do núcleo: o arquivo de teste novo (`api:` = `apps/api/test/*.e2e-spec.ts`, `shared:` = `packages/shared/src/*.test.ts`, `web:` = `apps/web/e2e/*.spec.ts`). A Tarefa 20 confere cada linha do módulo 1.

| Teste atual | O que verifica | Módulo | Regra do spec | Destino |
|---|---|---|---|---|
| sA.js | registrar empréstimo: validações (usuário, técnico, finalidade, Outra, previsão, assinatura) e gravação | 1 | 4.3 | api: emprestimos · shared: esquemas |
| sAcessosRedesign.js | Acessos: permissões em tags, status "Aguardando 1º login", ajuda escondida | 1 | 4.9 | web: admin |
| sAcessosSeg.js | grupos (propagação), vincular ao grupo, status, menu ⋮, suspender, forçar logout, senha temporária | 1 | 4.9 | api: acessos, auth · web: admin |
| sAlfa.js | perfis e permissões em ordem alfabética | 1 | 4.9 | web: admin |
| sAlmox.js | Almoxarifado (cadastro, saídas por setor, entrada, ajuste) e ordem do menu | 5 (menu: 1) | — | módulo 5; ordem do menu: web: login |
| sAtalhos.js | atalhos de teclado, Dashboard em tela cheia, solicitante sem atalhos | 1 (tela cheia: 6) | 7.4 | web: em-uso, admin (busca `/`) |
| sAuditoriaCor.js | cores das ações na Auditoria (Criou verde, Alterou azul) | 1 | 4.11 | web: admin |
| sB.js | pedido normal e urgente, editar e cancelar pedido | 2 | — | módulo 2 |
| sC.js | aprovação de pedido, conflito de reserva, entregar agora | 2 | — | módulo 2 |
| sCascata.js | renomear/excluir setor propaga para usuários, ramais e acessos | 1 (ramais: 4) | 4.8 | api: setores (com chave estrangeira, renomear não precisa propagar) |
| sConfigRedesign.js | Configurações em sub-abas, acessórios em tags, lixeira nas finalidades | 1 | 4.x config | web: admin |
| sConflitoRes.js | reserva com equipamento ocupado; pedido sem equipamento livre | 2 | — | módulo 2 |
| sConsulta.js | perfil Somente consulta ativo e não marcado por engano | 1 | 4.9 | api: acessos · web: admin |
| sD.js | reservas (validações, converter em empréstimo) + cadastro de equipamento (sem código, código repetido em minúsculas) | 2 + 1 | 4.6 | módulo 2 · api: equipamentos |
| sDevolTest.js / sDevolTest2.js | rascunhos de depuração da devolução (sem verificação) | — | — | não se aplica: não verificam nada |
| sDono.js | dono protegido contra outro Master; o próprio dono | 1 | 4.9 | api: acessos |
| sE.js | usuários (validações, e-mail completado com o domínio, telefone) e setores (repetido sem maiúsculas e **sem acento**) | 1 | 4.7, 4.8 | api: pessoas, setores · shared: esquemas |
| sEqLivres.js | Equipamentos: fileira "sem uso" por tipo, sem virar emprestável | 1 | 4.6 | web: equipamentos |
| sEquipCC.js | centro de custo vira lista de setores; valor antigo não some | 1 / 7 | 4.6 | api: equipamentos · importação (valor antigo → obs + aviso) |
| sEquipIp.js | IP só para tipos com IP; DHCP/fixo; trocar para DHCP apaga o IP; IP no cadastro em massa | 1 | 4.6 | shared: esquemas · api: equipamentos |
| sEquipLinha.js | telefones corporativo/particular com caixa; desmarcar apaga; antigo só com número vira corporativo | 1 / 7 | 4.6 | web: equipamentos · importação |
| sEquipLote.js | cadastro em massa de equipamentos (duplicado na lista, Nome existente não é sobrescrito, permissão) | 1 | 4.6 | api: equipamentos |
| sErroDetalhe.js | mensagem de erro amigável com detalhe técnico | 1 | 5 (erros) | api: auth (erro 500 com mensagem fixa; detalhe no log do servidor) |
| sExcluirUser.js | Excluir usuário travado com motivo | 1 | 4.7 | api: pessoas · web: usuarios-setores |
| sExpLimite.js | expediente (módulo 2) e limite por colaborador / liberar exceção | 2 + 1 | 4.3 | módulo 2 · api: emprestimos (limite) |
| sExport6.js | exportar Excel/PDF | 6 | — | módulo 6 |
| sF.js | Configurações (tipos emprestáveis, aviso mínimo, GLPI) + backup e importação | 1 / 7 | config, 8 | api: config · importação |
| sG.js / sG1.js / sG2.js / sG3.js | filtros combinados (Histórico, Equipamentos, Usuários), contadores do Painel, Relatórios | 6 (filtros de Equipamentos e Usuários: 1) | 4.6, 4.7 | módulo 6 · web: equipamentos, usuarios-setores |
| sH.js | paginação; o que cada perfil vê; **textos maliciosos não executam**; Meus equipamentos | 1 (paginação de histórico/pedidos: 6/2) | 4.12 | web: login (perfis) · web: usuarios-setores (texto malicioso) · api: emprestimos (portal) |
| sHistorico.js | filtros e botões do Histórico | 6 | — | módulo 6 |
| sI.js | pedido duplicado (2), chat (2), Termos/Ficha/Sincronizar (3) | 2, 3 | — | módulos 2 e 3 |
| sJ.js | quem vê a Auditoria; registro automático; Excluir e Restaurar | 1 | 4.11 | api: auditoria · web: admin |
| sJornada.js | jornada completa de um dia (da TI ao colaborador) | 1 + 2 | 7 | web: todos os arquivos e2e do núcleo; parte de pedidos no módulo 2 |
| sK.js | "Executar auditoria": achados de qualidade dos dados | 6 | — | módulo 6 (acrescentado ao `PROJETO.md`) |
| sKebabRam.js | menu ⋮ dos ramais | 4 | — | módulo 4 |
| sL.js | padrão Nome / Email; **escolher pessoa com busca** (vários termos, nome + setor em qualquer ordem) | 1 | 4.7 | web: em-uso (SeletorPessoa) |
| sLinkAssin.js | link público de assinatura | 3 | — | módulo 3 |
| sM.js | reservas (2) e filtros em botões de Equipamentos (1) | 2 + 1 | 4.6 | módulo 2 · web: equipamentos |
| sMTipo.js | empréstimo: filtro de Tipo só com disponíveis; começar pelo **leitor (bipar)** | 1 | 4.3 | web: em-uso |
| sModeloRotulo.js | rótulos "Modelo: ..." e "Tipo do chip" | 1 | 4.6 | web: equipamentos |
| sN.js | dois telefones; filtros de telefone; **busca por telefone só com números**; Cobrar usa o corporativo primeiro | 1 | 4.7, 4.13, 4.3 | api: pessoas, busca · web: em-uso |
| sNotebook.js | Notebook Empréstimo × Notebook × Desktop; só o emprestável empresta | 1 | 4.3 | api: emprestimos |
| sO.js | **Cobrar** pelo WhatsApp (corporativo e particular) | 1 | 4.3 | web: em-uso |
| sOrdemMaster.js | ordem dos itens marcados no acesso Master (instantâneo) | 1 | 4.9 | web: admin |
| sP.js | **foto** do usuário e "Minha foto" (tipo e tamanho) | 1 | 4.7 | api: pessoas · web: usuarios-setores |
| sPainel.js | Painel Dashboard | 6 | — | módulo 6 |
| sPedLote.js | aprovação em lote e Kanban | 2 | — | módulo 2 |
| sPrazoTermo.js | prazo do termo (3); vincular/soltar grava e limpa a data | 3 + 1 | 4.6 | módulo 3 · api: equipamentos (vinculado_em) |
| sProto.js | abrir o protótipo do claude.ai | — | — | não se aplica: protótipo abandonado |
| sProxyBug.js | erro de Proxy ao salvar (bug do protótipo) | — | — | não se aplica: problema do adaptador antigo |
| sQ.js | ramal do usuário ↔ lista de Ramais | 4 | — | módulo 4 |
| sR.js | cartões em lista, **carregador pré-marcado no notebook**, Painel | 1 + 6 | 4.3 | web: em-uso · módulo 6 |
| sRamComp.js / sRamaisAud.js / sRamalCompart.js | ramais compartilhados e auditoria de ramais | 4 | — | módulo 4 |
| sReal.js | abrir tudo com os dados reais | 7 | 8 | ensaio da importação com backup real (Tarefa 20) |
| sRegras.js | regras do banco × o que cada perfil faz | 1 | 6.1 | api: todos os testes de 403 |
| sRelatorios.js | tela de Relatórios | 6 | — | módulo 6 |
| sRulesAssin.js | regras do link de assinatura | 3 | — | módulo 3 |
| sRulesDono.js | regras do banco: dono protegido | 1 | 4.9 | api: acessos |
| sRulesDono_antigas.js | regras antigas (arquivo do claude.ai) | — | — | não se aplica: arquivo do ambiente antigo |
| sS.js | nomes dos perfis; o que cada um vê; TIC vê a Auditoria mas não restaura; assinaturas liga/desliga | 1 | 4.9, 4.11, config | api: auditoria, config · migração (TIC ganha auditoria) |
| sSeg1.js | ataques de injeção de HTML/script em textos | 1 | — | web: usuarios-setores (texto malicioso) |
| sT.js | status de conservação (1), penalidade por atraso (2), termo automático (3) | 1 + 2 + 3 | 4.1 | shared: situacoes · módulos 2 e 3 |
| sTelefonia.js | faixas, licenças, ramal com IP/MAC | 4 | — | módulo 4 |
| sTermoTexto.js / sTermos.js / sTermosRevisao.js | texto e PDF do termo, auditar termos, observação do termo | 3 (obs do termo: 1) | 4.6 | módulo 3 · api: equipamentos (termo_obs) |
| sU.js | pedidos por setor (2), auditoria rápida por aba (6), Setores em cartões (1) | 2, 6, 1 | 4.8 | módulos 2 e 6 · web: usuarios-setores |
| sV.js | tela de Novidades do sistema | — | — | depois: entra quando o sistema novo tiver versões publicadas |
| sV4.js | local físico, MAC, garantia (1); **desativar usuário devolve o vinculado ao estoque** (1); consumíveis (5) | 1 + 5 | 4.6, 4.7 | api: equipamentos, pessoas · módulo 5 |
| sVinculo.js | vincular por busca de pessoa; **vínculo em texto livre** (ex.: Sala de Reunião); ver/soltar/vincular equipamento em Editar usuário | 1 | 4.6, 4.7 | api: equipamentos · web: equipamentos, usuarios-setores |
| sVinculoNome.js | vínculo antigo só com nome é casado com a pessoa | 7 | 8 | importação |
| sVinculoPerm.js | botão de vincular só com permissão | 1 | 4.7 | web: usuarios-setores |
| sW.js | Histórico, Ficha, CSV e PDF | 6 | — | módulo 6 |
| sX.js | lista padronizada (1), antecedência dos pedidos (2), auditoria em cards (1/6) | 1, 2, 6 | — | web: usuarios-setores · módulos 2 e 6 |
| sY.js | **colar lista de pessoas** (`email;nome;setor;perfil`), formatos, duplicados, quem já existe | 1 | 4.7 | api: pessoas |
| sZ.js | Acessos: filtros, ordem, dono, Remover, pendências | 1 | 4.9 | api: acessos · web: admin |
| snapAc.js / snapDevol.js / snapLivres.js / snapTipos.js | gravam instantâneos de tela (sem verificação) | — | — | não se aplica: só geram HTML para olhar |

## Regras do núcleo que os testes atuais cobrem e o spec não citava

Acrescentadas ao `SPEC-NUCLEO.md` (seção 4.14) em 14/10/2026:
1. Previsão de entrega obrigatória no registro; previsão antes da retirada é recusada (sA).
2. Equipamento pode ser vinculado a um texto livre em vez de uma pessoa (sVinculo).
3. Desativar um usuário solta os equipamentos vinculados a ele (sV4).
4. Setor repetido também sem diferenciar acento (sE).
5. E-mail digitado sem domínio é completado com `@suinco.com.br` (sE, sY).
6. Busca de pessoa com vários termos (todos precisam bater) em nome, e-mail e setor (sL).
7. Editar usuário mostra os equipamentos vinculados, com soltar e vincular (só equipamentos livres) (sVinculo).
8. Colar lista de pessoas `email;nome;setor;perfil`, com perfil opcional (sY).
9. Aviso de vencimento com mínimo de 5 minutos (sF).
10. Portal: "Perto de vencer" quando falta menos que o aviso configurado (sH).
11. Carregador já marcado ao escolher um notebook (sR).
12. Busca por telefone só com números (sN).
13. Cobrar pelo WhatsApp, corporativo primeiro, nos atrasados (sO, sN).
14. Foto do usuário e "Minha foto" (sP).
15. Leitor de código (bipar) para escolher o equipamento no empréstimo (sMTipo).
16. Textos com HTML aparecem como texto, nunca executam (sH, sSeg1).
