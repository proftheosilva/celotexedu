# celotexEDU: rodapé e políticas em português

**Status:** implementado após revisão EGM  
**Escopo:** Termos de Uso e quatro páginas de políticas acessíveis pelo rodapé da página inicial e dos murais.

## Problema e comportamento verificado

As páginas do Dontpad descrevem outro produto e suas próprias práticas; não devem ser copiadas como se fossem as do celotexEDU. A aplicação não tem cadastro de alunos, e-mail, pagamentos, anúncios nem código de analytics no frontend. Ela mantém murais abertos por sigla, sem autenticação: qualquer pessoa que receba, encontre ou adivinhe o endereço pode ler e publicar.

O apelido é opcional e pode ser lembrado no `localStorage` do navegador. Texto, URL, apelido e data/hora de publicação ficam no banco InsForge. O código aplica limites de frequência por endereço IP, sem salvar esse IP junto dos posts. Proxy, hospedagem e provedor de banco podem ter registros técnicos próprios; sua configuração e retenção não foram verificadas. O hostname do InsForge contém `us-east`, mas isso não confirma localização física nem transferência de dados.

A aplicação permite que a pessoa autora apague um post no mesmo navegador por meio de um segredo aleatório: o segredo é guardado no navegador e somente seu hash SHA-256 fica no banco. O apelido não autoriza exclusão. Se o armazenamento local for perdido ou a publicação for feita em outro aparelho, não há recuperação de chave. Ainda não há edição, denúncia de conteúdo alheio ou ferramenta de moderação/remoção, nem formulário de contato.

## Decisões de experiência e texto

- Criar rotas diretas `/politica-de-privacidade`, `/politica-de-cookies`, `/politica-de-conteudo` e `/politica-de-reembolso`, com layout responsivo, título, data, conteúdo em português e retorno à página inicial.
- Mostrar os quatro links nos rodapés da página inicial, do mural e das páginas de política.
- Incluir Termos de Uso informando que o serviço é gratuito e o código original é licenciado em regime dual GNU GPLv2 ou GPLv3, com os textos integrais acessíveis.
- Explicar que a sigla não é senha e que conteúdo/apelidos devem ser considerados públicos.
- Avisar antes da publicação para não inserir dados pessoais ou sensíveis.
- Distinguir `localStorage` de cookies, dados públicos do mural de processamento técnico por IP e comportamento do app de registros não verificados de provedores.
- Exigir apelido para entrar e publicar; guardá-lo em `sessionStorage` por sala/aba, sem tratar o apelido como autenticação.
- Oferecer exclusão da publicação própria com um token aleatório emitido pelo servidor, persistido no navegador e armazenado como hash no banco.
- Manter alturas uniformes nos cartões, mostrar “Ver mais” para conteúdo que excede o espaço e apresentar URLs com quebra segura no mobile.
- Animar discretamente a entrada e o foco dos cartões, respeitando `prefers-reduced-motion`.
- Explicar em termos simples que não há contas ou pagamentos na versão atual; a política de reembolso informa que não existe compra a reembolsar.
- Tratar o contexto educacional sem afirmar que a página define base legal ou garante conformidade legal.

## Alternativas consideradas

- Reutilizar as páginas do Dontpad: rejeitado porque descrevem fornecedores, funcionalidades e práticas diferentes.
- Colocar tudo em uma janela: rejeitado porque dificulta acesso por URL, compartilhamento e leitura em celular.
- Uma única página com quatro seções: seria viável e teria menos navegação, mas quatro páginas curtas foram escolhidas por corresponderem aos quatro links pedidos e permitirem abrir cada política diretamente.
- Criar denúncia/remoção agora: deixado fora deste escopo porque exige mecanismo operacional e responsável verificável; os textos não simulam esse recurso. A lacuna deve ser resolvida pelo produto/operador.

## Revisões EGM e respostas

Três revisões independentes (código/estrutura, compreensão e design) encontraram risco de exagerar a coleta mínima, inferir localização a partir do endpoint, deixar links sem rota, omitir aviso antes de postar e dar a entender que existe suporte ou moderação. A implementação corrige essas afirmações, oferece rotas diretas via fallback SPA existente, informa que a sigla pode ser descoberta e mostra o aviso nos dois modos de publicação. O conteúdo explica o apelido no navegador com linguagem simples e não atribui políticas dos provedores à aplicação.

Continua pendente adicionar um canal real de denúncia e remoção de conteúdo alheio, identificar um responsável operacional e confirmar a configuração/retenção de logs dos fornecedores. Não se deve tratar o texto de política como substituto dessas ações nem como parecer jurídico.

## Critérios de aceite

- Quatro links em português nos três contextos: home, mural e páginas de política.
- Cada URL funciona por navegação direta e atualização.
- Textos correspondem às funções existentes e não prometem capacidades inexistentes.
- Aviso aparece antes de enviar tanto texto quanto link.
- Testes, build e verificação HTTP das rotas passam.
