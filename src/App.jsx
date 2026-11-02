import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const ICONS = {
  board: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5z"/><path d="M8 21h8M12 17v4M8 8h8M8 12h5"/></>,
  arrow: <><path d="M7 17 17 7M7 7h10v10"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
  note: <><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  arrowLeft: <><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></>,
  trash: <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></>,
  grip: <><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  close: <><path d="m18 6-12 12M6 6l12 12"/></>,
};

function Icon({ name, size = 18 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>;
}

function normalizeSlug(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

function normalizeClassCode(value) {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

function roomNameKey(slug) { return `celotex-room-name:${slug}`; }
function memberTokenKey(slug) { return `celotex-room-member:${slug}`; }
function memberRoleKey(slug) { return `celotex-room-role:${slug}`; }
function postOwnerKey(slug, postId) { return `celotex-post-owner:${slug}:${postId}`; }
function normalizeNickname(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
function normalizeSearchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}
function readRoomName(slug) {
  try { return localStorage.getItem(roomNameKey(slug)) || sessionStorage.getItem(roomNameKey(slug)) || ''; } catch { return ''; }
}
function saveRoomName(slug, name) {
  try { localStorage.setItem(roomNameKey(slug), name); sessionStorage.setItem(roomNameKey(slug), name); } catch { /* a sessão atual ainda pode continuar */ }
}
function readMemberToken(slug) {
  try { return localStorage.getItem(memberTokenKey(slug)) || ''; } catch { return ''; }
}
function saveMember(slug, nickname, role, token) {
  try {
    localStorage.setItem(memberTokenKey(slug), token);
    localStorage.setItem(memberRoleKey(slug), role);
    saveRoomName(slug, nickname);
    return true;
  } catch { return false; }
}
function forgetMember(slug) {
  try {
    localStorage.removeItem(memberTokenKey(slug));
    localStorage.removeItem(memberRoleKey(slug));
  } catch { /* a tela de entrada ainda permite tentar novamente */ }
}
function readMemberRole(slug) {
  try { return localStorage.getItem(memberRoleKey(slug)) || 'student'; } catch { return 'student'; }
}
async function registerMember(slug, nickname, role = 'student') {
  const token = readMemberToken(slug);
  const response = await fetch(`/api/boards/${encodeURIComponent(slug)}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-member-token': token } : {}) },
    body: JSON.stringify({ nickname: normalizeNickname(nickname), role }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível entrar no mural.');
  const stored = saveMember(slug, result.member.nickname, result.member.role, result.memberToken);
  if (!stored) throw new Error('O navegador bloqueou o armazenamento da sua identificação. Habilite o armazenamento local e tente novamente.');
  return result.member;
}
async function restoreMember(slug, token = readMemberToken(slug)) {
  if (!token) return null;
  const response = await fetch(`/api/boards/${encodeURIComponent(slug)}/members/me`, { headers: { 'x-member-token': token } });
  const result = await response.json();
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(result.error || 'Não foi possível restaurar sua participação.');
  saveMember(slug, result.member.nickname, result.member.role, token);
  return result.member;
}
function readPostOwnerToken(slug, id) {
  try { return localStorage.getItem(postOwnerKey(slug, id)) || ''; } catch { return ''; }
}
function savePostOwnerToken(slug, id, token) {
  try { localStorage.setItem(postOwnerKey(slug, id), token); return true; } catch { return false; }
}
function forgetPostOwnerToken(slug, id) {
  try { localStorage.removeItem(postOwnerKey(slug, id)); } catch { /* a publicação já foi removida do servidor */ }
}

function safeUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function Brand({ compact = false }) {
  return <a className={`brand ${compact ? 'brand-compact' : ''}`} href="/" aria-label="celotexEDU, página inicial">
    <span className="brand-mark"><Icon name="board" size={21} /></span>
    <span className="brand-word">celotex<span>EDU</span></span>
  </a>;
}

const POLICY_LINKS = [
  ['/termos-de-uso', 'Termos de Uso'],
  ['/politica-de-privacidade', 'Privacidade'],
  ['/politica-de-cookies', 'Cookies'],
  ['/politica-de-conteudo', 'Conteúdo'],
  ['/politica-de-reembolso', 'Reembolso'],
];

function PolicyLinks() {
  return <nav className="policy-links" aria-label="Regras e políticas do celotexEDU">
    {POLICY_LINKS.map(([href, label], index) => <span key={href}>
      {index > 0 && <span className="policy-separator" aria-hidden="true">|</span>}
      <a href={href}>{label}</a>
    </span>)}
  </nav>;
}

const POLICY_CONTENT = {
  '/termos-de-uso': {
    title: 'Termos de Uso', intro: 'Estes termos explicam as condições para usar o celotexEDU, uma plataforma gratuita de apoio à educação.', sections: [
      ['Acesso gratuito', 'O uso do celotexEDU é gratuito. Atualmente não cobramos pelo acesso, criação de murais ou publicação de textos e links. Se isso mudar, os termos serão atualizados antes da introdução de cobranças.'],
      ['Licença do código do sistema', 'O código original do celotexEDU é disponibilizado sob licença dupla: GNU General Public License, versão 2 (GPLv2) ou versão 3 (GPLv3), à escolha de quem recebe o código. Você pode usar, estudar, modificar e redistribuir o programa conforme a versão escolhida, cumprindo seus termos, incluindo manter os avisos de licença e disponibilizar o código-fonte correspondente quando exigido pela GPL. Os textos integrais estão nos arquivos LICENSE-GPL-2.0.txt e LICENSE-GPL-3.0.txt deste projeto.'],
      ['O que a licença cobre', 'A licença GPL se aplica ao código do celotexEDU cujos direitos pertencem ao projeto. Ela não transforma automaticamente em GPL os textos e links publicados pelos usuários, as marcas e imagens do celotexEDU nem as bibliotecas de terceiros; cada conteúdo ou componente mantém os direitos e termos aplicáveis a ele. Quem publica deve ter autorização para compartilhar o material.'],
      ['Uso dos murais', 'Os murais podem ser lidos por qualquer pessoa que tenha, encontre ou descubra sua sigla ou endereço. Não publique senhas, dados pessoais ou sensíveis, material confidencial, conteúdo ilegal ou material que você não tenha direito de compartilhar. O professor e a instituição devem orientar a turma. Consulte também a Política de Conteúdo e a Política de Privacidade.'],
      ['Disponibilidade e alterações', 'O serviço pode passar por manutenção, mudanças ou interrupções. Estes termos descrevem a versão atual e podem ser atualizados quando o sistema mudar. A licença GPL do código é independente da disponibilidade contínua do serviço hospedado.'],
    ], links: [
      { href: '/LICENSE-GPL-2.0.txt', label: 'Ler a licença GNU GPL versão 2' },
      { href: '/LICENSE-GPL-3.0.txt', label: 'Ler a licença GNU GPL versão 3' },
      { href: 'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html', label: 'Consultar o texto oficial no site GNU: GPL versão 2' },
      { href: 'https://www.gnu.org/licenses/gpl-3.0.html', label: 'Consultar o texto oficial no site GNU: GPL versão 3' },
    ],
  },
  '/politica-de-privacidade': {
    title: 'Política de Privacidade', intro: 'Esta página explica, em linguagem simples, quais informações o celotexEDU usa na versão atual do mural escolar.', sections: [
      ['Como funciona o mural', 'Cada mural pode ser lido e receber contribuições por qualquer pessoa que encontre ou receba seu endereço ou sua sigla. A sigla identifica o mural, mas não é uma senha nem impede que outras pessoas o encontrem, compartilhem ou tentem adivinhar. Trate tudo o que publicar como informação pública.'],
      ['Informações usadas', 'Para entrar em cada mural, a pessoa registra um apelido. Ele é convertido para letras minúsculas e sem acentos e deve ser único somente naquele mural; o mesmo apelido pode ser usado em outra sala. O apelido, o papel escolhido (estudante ou professor), a ordem dos cartões, o conteúdo, links e datas das publicações ficam no banco InsForge. Não há conta de aluno nem solicitação de e-mail.'],
      ['Chaves locais e identificação', 'Este navegador guarda uma chave aleatória para manter a identificação no mural. No banco fica somente o resumo criptográfico dessa chave. Se os dados locais do site forem apagados ou a pessoa trocar de aparelho, ela poderá precisar entrar com outro apelido. Apelidos já registrados ficam reservados naquela sala.'],
      ['Apagar e organizar cartões', 'Qualquer participante pode arrastar cartões para mudar a ordem. Cada pessoa pode apagar as próprias publicações; o professor cadastrado na sala também pode apagar qualquer publicação ou limpar o mural. A primeira pessoa que escolher “Sou o professor” assume esse papel; a aplicação não verifica identidade ou vínculo escolar, então essa opção deve ser usada somente pelo docente.'],
      ['Dados técnicos e fornecedores', 'O servidor processa temporariamente o endereço IP da conexão para aplicar limites contra excesso de tentativas. O serviço de hospedagem, o proxy e o provedor do banco também podem processar ou registrar dados técnicos conforme suas próprias configurações e políticas. Não confirmamos aqui os prazos de retenção desses registros nem a localização exata em que cada fornecedor mantém os dados.'],
      ['Uso educacional e segurança', 'Não publique nome completo de estudante, telefone, e-mail, endereço, senha, informações de saúde ou qualquer dado pessoal ou sensível. Prefira apelidos. O professor e a instituição devem orientar e acompanhar o uso da turma. Esta página informa como a aplicação funciona; ela não substitui a orientação da escola nem define, por si só, a base legal para o uso de dados de crianças e adolescentes.'],
      ['Acesso, correção ou remoção', 'A pessoa pode apagar seus próprios cartões enquanto a chave local de participação estiver disponível. O professor cadastrado pode apagar qualquer cartão e limpar a sala. A aplicação não tem edição de publicações, denúncia de conteúdo ou formulário de contato; procure o professor ou a instituição que compartilhou a sigla e use o canal escolar que forneceram.'],
      ['Links externos e mudanças', 'Os links publicados podem levar a serviços de terceiros, com práticas próprias. Esta política pode ser atualizada quando o funcionamento do celotexEDU mudar; consulte a data no início da página.'],
    ], links: [{ href: 'https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares', label: 'Saiba mais sobre direitos dos titulares na ANPD' }],
  },
  '/politica-de-cookies': {
    title: 'Política de Cookies', intro: 'O celotexEDU não usa cookies próprios de publicidade ou análise de navegação na interface atual.', sections: [
      ['Armazenamento no navegador', 'O apelido e uma chave aleatória de participação ficam em localStorage para reconhecer a pessoa ao voltar ao mural, permitir a exclusão de suas publicações e manter o papel de professor. Nenhum dos dois recursos é um cookie ou uma conta.'],
      ['Serviços técnicos e links externos', 'O servidor e os provedores de hospedagem podem usar recursos técnicos próprios para entregar e proteger o serviço; as configurações e os prazos desses fornecedores não são definidos por esta página. Sites abertos por links do mural podem usar cookies e tecnologias próprias. Consulte as políticas desses serviços.'],
      ['Como apagar os dados locais', 'Você pode apagar os dados do site nas configurações do navegador. Isso remove a chave que identifica você na sala; não apaga as publicações enviadas nem libera o apelido, que continua reservado naquele mural. Se trocar de aparelho ou navegador, será necessário registrar outro apelido.'],
    ],
  },
  '/politica-de-conteudo': {
    title: 'Política de Conteúdo', intro: 'O celotexEDU é um mural de apoio à educação. Publique somente materiais pertinentes à aula e adequados à comunidade escolar.', sections: [
      ['O que pode ser publicado', 'Anotações, lembretes, referências e links úteis para as atividades de aprendizagem, respeitando as orientações do professor e da instituição.'],
      ['O que não pode ser publicado', 'Não publique dados pessoais ou sensíveis de estudantes ou terceiros; ameaças, assédio, discriminação, conteúdo sexual, violência, fraude, spam, malware, conteúdo ilegal, falsa identidade ou material que viole direitos autorais. Não use o mural para assuntos alheios à atividade escolar quando isso prejudicar a turma.'],
      ['Responsabilidade e supervisão', 'Quem publica é responsável pelo conteúdo enviado. Professores e instituições devem explicar as regras e acompanhar a participação, especialmente quando a turma inclui crianças ou adolescentes. A sigla não restringe quem consegue ver o conteúdo.'],
      ['Limites da ferramenta', 'Qualquer participante pode mover os cartões. A pessoa autora pode apagar seus cartões, e o professor registrado pode apagar cartões da turma ou limpar o mural. O primeiro participante que selecionar o papel de professor recebe esses controles; a aplicação não confirma identidade nem vínculo escolar. A versão atual não possui denúncia, moderação automática ou edição de publicações. Para comunicar um problema, procure o professor ou a instituição pelo canal escolar que forneceram. Não publique material que exija confidencialidade.'],
    ],
  },
  '/politica-de-reembolso': {
    title: 'Política de Reembolso', intro: 'Na versão atual, o celotexEDU não vende planos, assinaturas, créditos ou outros produtos pagos.', sections: [
      ['Compras e reembolsos', 'Como não há cobrança feita pela aplicação, não existe compra ou solicitação de reembolso a processar neste momento. Se forem adicionados pagamentos no futuro, esta política será atualizada antes de a função ser oferecida.'],
    ],
  },
};

function PolicyPage({ path }) {
  const policy = POLICY_CONTENT[path];
  useEffect(() => { document.title = `${policy.title} · celotexEDU`; }, [policy.title]);
  return <main className="policy-shell">
    <header className="topbar policy-topbar"><Brand compact/><a className="back-link" href="/">Página inicial</a></header>
    <article className="policy-article">
      <span className="board-kicker">CELOTEXEDU · APOIO À EDUCAÇÃO</span>
      <h1>{policy.title}</h1><p className="policy-updated">Atualizada em 2 de novembro de 2026</p>
      <p className="policy-intro">{policy.intro}</p>
      {policy.sections.map(([heading, body]) => <section key={heading}><h2>{heading}</h2><p>{body}</p></section>)}
      {policy.links?.map((link) => <p className="policy-source" key={link.href}><a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a></p>)}
      <p className="policy-note">Estas informações descrevem a versão atual do aplicativo. A escola ou instituição responsável deve orientar a turma sobre o uso do mural e os canais disponíveis.</p>
    </article>
    <footer className="policy-footer"><PolicyLinks/><span>celotexEDU · mural colaborativo educacional</span></footer>
  </main>;
}

function Landing({ onOpen }) {
  const [title, setTitle] = useState('');
  const [classCode, setClassCode] = useState('');
  const [joinSlug, setJoinSlug] = useState('');
  const [joinAuthor, setJoinAuthor] = useState('');
  const [joinAsTeacher, setJoinAsTeacher] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function createBoard(event) {
    event.preventDefault();
    setError('');
    const cleanTitle = title.trim();
    if (cleanTitle.length < 3) return setError('Escreva um nome curto para o mural.');
    const code = normalizeClassCode(classCode);
    if (!/^[A-Z0-9][A-Z0-9-]{1,15}$/.test(code) || code.endsWith('-')) return setError('Use uma sigla de 2 a 16 caracteres, com letras, números ou hífen.');
    const slug = code.toLowerCase();
    setBusy(true);
    try {
      const response = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: cleanTitle, code, slug }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível criar o mural.');
      window.location.assign(`/m/${result.slug}`);
    } catch (err) {
      setError(err.message || 'Não foi possível criar o mural.');
      setBusy(false);
    }
  }

  async function joinBoard(event) {
    event.preventDefault();
    const slug = normalizeSlug(joinSlug);
    if (!slug) return setJoinError('Digite a sigla da sala para acessar o mural e contribuir.');
    const savedToken = readMemberToken(slug);
    if (savedToken) {
      setBusy(true);
      setJoinError('');
      try {
        const member = await restoreMember(slug, savedToken);
        if (member) { onOpen(slug, member.nickname); return; }
        forgetMember(slug);
      } catch (err) {
        setJoinError(err.message || 'Não foi possível restaurar sua entrada.');
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    const author = normalizeNickname(joinAuthor);
    if (!author) return setJoinError('Informe seu apelido para entrar na sala.');
    setJoinError('');
    setBusy(true);
    try {
      await registerMember(slug, author, joinAsTeacher ? 'teacher' : 'student');
      onOpen(slug, author);
    } catch (err) {
      setJoinError(err.message || 'Não foi possível entrar na sala.');
      setBusy(false);
    }
  }

  return <main className="landing-shell">
    <header className="topbar landing-topbar"><Brand /><span className="topbar-note">MURAL COLABORATIVO DA TURMA</span></header>
    <section className="landing-hero">
      <div className="landing-copy">
        <div className="eyebrow"><span className="eyebrow-dot" /> UM QUADRO DE AVISOS PARA APRENDER JUNTO</div>
        <h1>Ideias da aula,<br /><em>à vista de todos.</em></h1>
        <p>Crie um mural para sua turma e compartilhe textos e links importantes. Sem cadastro: basta enviar o endereço para participar.</p>
        <div className="landing-points"><span><i>01</i> Crie o mural</span><span><i>02</i> Compartilhe o link</span><span><i>03</i> A turma contribui</span></div>
      </div>
      <div className="landing-board-art" aria-hidden="true">
        <div className="art-pin pin-one" /><div className="art-pin pin-two" />
        <div className="art-card art-card-note"><span>LEMBRETE DA AULA</span><b>Uma ideia boa<br />cresce quando<br />é compartilhada.</b><small>— mural da turma</small></div>
        <div className="art-card art-card-link"><div className="art-link-icon"><Icon name="link" size={17}/></div><span>LINK DE ESTUDO</span><b>Material complementar</b><i>↗</i></div>
        <div className="art-tape" />
      </div>
    </section>
    <section className="entry-panel">
      <form className="entry-create" onSubmit={createBoard}>
        <div className="entry-icon"><Icon name="plus" size={20}/></div>
        <div className="entry-fields"><label htmlFor="board-title">Comece um novo mural</label><input id="board-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome da turma ou assunto" maxLength={80} required /></div>
        <label className="class-code-field" htmlFor="class-code"><span>SIGLA DE ACESSO</span><input id="class-code" value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase())} placeholder="IA-8A" maxLength={16} autoCapitalize="characters" required /><small>Única para cada turma</small></label>
        <button className="button button-primary" disabled={busy}>{busy ? 'Criando…' : <>Criar mural <Icon name="arrow" size={17}/></>}</button>
      </form>
      <p className="code-explanation">A sigla será o endereço curto do mural. Compartilhe-a para que todos possam entrar.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="entry-divider"><span>OU ENTRE EM UM MURAL EXISTENTE</span></div>
      <form className="entry-join" onSubmit={joinBoard}>
        <Icon name="link" size={18}/><input aria-label="Sigla do mural" required aria-invalid={Boolean(joinError)} aria-describedby={joinError ? 'join-error' : undefined} value={joinSlug} onChange={(e) => { setJoinSlug(e.target.value.toUpperCase()); if (e.target.value.trim()) setJoinError(''); }} placeholder="Sigla da turma (ex.: IA-8A)" />
        <input className="entry-nickname" aria-label="Seu apelido" required={!readMemberToken(normalizeSlug(joinSlug))} maxLength={48} value={joinAuthor} onChange={(e) => { setJoinAuthor(e.target.value); if (e.target.value.trim()) setJoinError(''); }} placeholder={readMemberToken(normalizeSlug(joinSlug)) ? 'Participação reconhecida ao entrar' : 'Seu apelido'} />
        <label className="entry-teacher"><input type="checkbox" checked={joinAsTeacher} onChange={(e) => setJoinAsTeacher(e.target.checked)} /> Sou o professor</label>
        <button className="button button-soft" type="submit" disabled={busy}>{busy ? 'Entrando…' : <>Acessar <Icon name="arrow" size={16}/></>}</button>
      </form>
      {joinError && <p id="join-error" className="form-error" role="alert">{joinError}</p>}
    </section>
    <footer className="landing-footer"><span>Um mural simples, feito para a comunidade escolar.</span><span>celotexEDU <i>·</i> aprendizagem compartilhada</span><PolicyLinks/></footer>
  </main>;
}

function PostCard({ post, index, ownerToken, ownPost, isTeacher, onDelete, onDragStart, canDrag = true }) {
  const tones = ['tone-paper', 'tone-sand', 'tone-sage', 'tone-blue'];
  const url = post.kind === 'link' ? safeUrl(post.url) : '';
  const initials = (post.author || 'V').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  const contentRef = useRef(null);
  const dialogRef = useRef(null);
  const [canExpand, setCanExpand] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copyState, setCopyState] = useState('');

  useEffect(() => {
    const element = contentRef.current;
    if (!element || !post.content) return undefined;
    const measure = () => setCanExpand(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [post.content]);

  useEffect(() => {
    if (dialogOpen && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [dialogOpen]);

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(post.content || '');
      setCopyState('Copiado');
    } catch {
      setCopyState('Não foi possível copiar');
    }
    window.setTimeout(() => setCopyState(''), 1800);
  }

  return <article className={`post-card ${post.kind === 'text' ? 'post-card-text' : 'post-card-link'} ${tones[index % tones.length]}`} data-post-id={post.id}>
    <div className="post-pin" aria-hidden="true" />
    <div className="post-topline"><span className={`post-type ${post.kind === 'link' ? 'post-type-link' : ''}`}><Icon name={post.kind === 'link' ? 'link' : 'note'} size={14}/>{post.kind === 'link' ? 'LINK' : 'ANOTAÇÃO'}</span><time dateTime={post.created_at}>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(post.created_at))}</time><div className="post-actions"><button className={`post-drag-handle ${canDrag ? '' : 'post-drag-disabled'}`} type="button" disabled={!canDrag} onPointerDown={(event) => canDrag && onDragStart(event, post.id)} aria-label={`Mover cartão de ${post.author}`} title={canDrag ? 'Arraste para mudar de posição' : 'Limpe a busca para mover cartões'}><Icon name="grip" size={17}/></button>{post.kind === 'text' && <button className={`post-copy ${copyState ? 'post-copy-feedback' : ''}`} type="button" onClick={copyContent} aria-label={copyState === 'Copiado' ? 'Conteúdo copiado' : copyState ? 'Falha ao copiar conteúdo' : 'Copiar conteúdo completo'} title={copyState || 'Copiar conteúdo'} aria-live="polite">{copyState ? (copyState === 'Copiado' ? '✓' : '!') : <Icon name="copy" size={15}/>}</button>}{(ownerToken || ownPost || isTeacher) && <button className="post-delete" type="button" onClick={() => onDelete(post)} aria-label={isTeacher && !ownPost ? 'Apagar publicação como professor' : 'Apagar sua publicação'} title={isTeacher && !ownPost ? 'Apagar como professor' : 'Apagar publicação'}><Icon name="trash" size={15}/></button>}</div></div>
    {post.content && <p ref={contentRef} className="post-content">{post.content}</p>}
    {canExpand && <button className="post-more" type="button" onClick={() => setDialogOpen(true)}>Ver mais</button>}
    {url && <a className="post-link" href={url} target="_blank" rel="noopener noreferrer"><span className="post-link-icon"><Icon name="arrow" size={17}/></span><span><strong>{new URL(url).hostname.replace(/^www\./, '')}</strong><small>{url}</small></span><Icon name="arrow" size={16}/></a>}
    <div className="post-author"><span className="author-avatar">{initials || 'V'}</span><span>{post.author || 'Visitante'}</span></div>
    {post.content && <dialog ref={dialogRef} className="post-dialog" aria-labelledby={`post-dialog-title-${post.id}`} onClose={() => setDialogOpen(false)} onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current.close(); }}>
      <div className="post-dialog-head"><div><span className={`post-type ${post.kind === 'link' ? 'post-type-link' : ''}`}><Icon name={post.kind === 'link' ? 'link' : 'note'} size={14}/>{post.kind === 'link' ? 'LINK' : 'ANOTAÇÃO'}</span><h2 id={`post-dialog-title-${post.id}`}>Conteúdo completo</h2></div><button className="post-dialog-close" type="button" onClick={() => dialogRef.current?.close()} aria-label="Fechar conteúdo completo">×</button></div>
      <p className="post-dialog-content">{post.content}</p>
      <div className="post-dialog-actions"><button className="post-dialog-copy" type="button" onClick={copyContent}><Icon name="copy" size={15}/>{copyState || 'Copiar texto'}</button><span>{post.author || 'Visitante'}</span></div>
    </dialog>}
  </article>;
}

function Composer({ slug, onPosted, author, memberToken }) {
  const [kind, setKind] = useState('text');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (kind === 'text' && !content.trim()) return setError('Escreva o texto que deseja compartilhar.');
    if (!author.trim() || !memberToken) return setError('Entre no mural com seu apelido antes de publicar.');
    if (kind === 'link' && !safeUrl(url.trim())) return setError('Informe um endereço começando com http:// ou https://.');
    setBusy(true);
    try {
      const response = await fetch(`/api/boards/${encodeURIComponent(slug)}/posts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-member-token': memberToken },
        body: JSON.stringify({ kind, content: content.trim(), url: url.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível publicar.');
      setContent(''); setUrl('');
      onPosted(result.post, result.ownerToken);
    } catch (err) {
      setError(err.message || 'Não foi possível publicar.');
    } finally { setBusy(false); }
  }

  return <form className="composer" onSubmit={submit}>
    <div className="composer-head"><div><div className="eyebrow composer-eyebrow">CONTRIBUA COM A TURMA</div><h2>O que vale a pena guardar?</h2></div><span className="composer-mark"><Icon name="plus" size={19}/></span></div>
    <div className="composer-tabs" role="tablist" aria-label="Tipo de contribuição">
      <button type="button" role="tab" aria-selected={kind === 'text'} className={kind === 'text' ? 'selected' : ''} onClick={() => setKind('text')}><Icon name="note" size={16}/> Texto</button>
      <button type="button" role="tab" aria-selected={kind === 'link'} className={kind === 'link' ? 'selected' : ''} onClick={() => setKind('link')}><Icon name="link" size={16}/> Link</button>
    </div>
    {kind === 'text' ? <label className="field-label" htmlFor="post-content">Sua anotação <span className="optional">até 20 mil caracteres</span><textarea id="post-content" value={content} onChange={(e) => setContent(e.target.value)} maxLength={20000} rows={5} placeholder="Compartilhe uma ideia, lembrete ou resumo da aula…" /></label> : <div className="link-fields"><label className="field-label" htmlFor="post-url">Endereço do link<input id="post-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2048} placeholder="https://…" /></label><label className="field-label" htmlFor="post-caption">Uma observação <span className="optional">opcional</span><textarea id="post-caption" value={content} onChange={(e) => setContent(e.target.value)} maxLength={500} rows={2} placeholder="O que a turma vai encontrar nesse link?" /></label></div>}
    <div className="composer-bottom"><div className="author-field"><span>SEU APELIDO</span><strong className="fixed-nickname">{author}</strong></div><button className="button button-dark" disabled={busy}>{busy ? 'Fixando…' : <>Fixar no mural <Icon name="arrow" size={17}/></>}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="composer-hint"><strong>Atenção:</strong> qualquer pessoa que tenha ou descubra a sigla pode ver este mural. Não publique nomes completos, contatos, senhas ou dados pessoais/sensíveis. O conteúdo poderá ser visto por toda a turma.</p>
  </form>;
}

function BoardPage({ slug, onHome }) {
  const hasLoadedBoard = useRef(false);
  const cardRects = useRef(new Map());
  const [board, setBoard] = useState(null);
  const [posts, setPosts] = useState([]);
  const [memberToken, setMemberToken] = useState(() => readMemberToken(slug));
  const [memberRole, setMemberRole] = useState(() => readMemberRole(slug));
  const [author, setAuthor] = useState('');
  const [entryName, setEntryName] = useState(() => readRoomName(slug));
  const [entryAsTeacher, setEntryAsTeacher] = useState(false);
  const [entryError, setEntryError] = useState('');
  const [restoring, setRestoring] = useState(() => Boolean(readMemberToken(slug)));
  const [restoreError, setRestoreError] = useState('');
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [activity, setActivity] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchBoard = useCallback(async () => {
    const response = await fetch(`/api/boards/${encodeURIComponent(slug)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Mural não encontrado.');
    setBoard(data.board);
    return data.board;
  }, [slug]);

  const fetchPosts = useCallback(async () => {
    const response = await fetch(`/api/boards/${encodeURIComponent(slug)}/posts?limit=60`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as contribuições.');
    setPosts(data.posts || []);
    setActivity(data.activity || '');
  }, [slug]);

  useEffect(() => {
    if (!memberToken || author) { setRestoring(false); return undefined; }
    let active = true;
    setRestoring(true);
    setRestoreError('');
    fetch(`/api/boards/${encodeURIComponent(slug)}/members/me`, { headers: { 'x-member-token': memberToken } })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 401) {
            forgetMember(slug);
            setMemberToken('');
            setMemberRole('student');
            setEntryName(readRoomName(slug));
            return;
          }
          throw new Error(result.error || 'Não foi possível restaurar sua participação.');
        }
        if (!active) return;
        saveRoomName(slug, result.member.nickname);
        setEntryName(result.member.nickname);
        setMemberRole(result.member.role);
        setAuthor(result.member.nickname);
      })
      .catch((err) => { if (active) setRestoreError(err.message || 'Não foi possível conectar ao mural.'); })
      .finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [slug, memberToken, author, restoreAttempt]);

  useLayoutEffect(() => {
    const nextRects = new Map();
    document.querySelectorAll('.post-grid [data-post-id]').forEach((element) => {
      const id = element.dataset.postId;
      const rect = element.getBoundingClientRect();
      const previous = cardRects.current.get(id);
      if (previous && (previous.left !== rect.left || previous.top !== rect.top) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        element.animate([
          { transform: `translate(${previous.left - rect.left}px, ${previous.top - rect.top}px)` },
          { transform: 'translate(0, 0)' },
        ], { duration: 360, easing: 'cubic-bezier(.2,.75,.3,1)' });
      }
      nextRects.set(id, { left: rect.left, top: rect.top });
    });
    cardRects.current = nextRects;
  });

  useEffect(() => {
    if (!author.trim()) { setLoading(false); return undefined; }
    let mounted = true;
    if (!hasLoadedBoard.current) setLoading(true);
    Promise.all([fetchBoard(), fetchPosts()]).then(() => { hasLoadedBoard.current = true; }).catch((err) => { if (mounted) setError(err.message); }).finally(() => { if (mounted) setLoading(false); });
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch(`/api/boards/${encodeURIComponent(slug)}/activity`);
        if (!response.ok) return;
        const data = await response.json();
        if (data.activity && data.activity !== activity) await fetchPosts();
      } catch { /* a próxima atualização tentará novamente */ }
    }, 10000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [slug, fetchBoard, fetchPosts, activity, author]);

  useEffect(() => {
    const original = document.title;
    if (board?.title) document.title = `${board.title} · celotexEDU`;
    return () => { document.title = original; };
  }, [board?.title]);

  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  }

  async function enterRoom(event) {
    event.preventDefault();
    const nickname = normalizeNickname(entryName);
    if (!nickname) return;
    setEntryError('');
    try {
      const member = await registerMember(slug, nickname, entryAsTeacher ? 'teacher' : 'student');
      setAuthor(member.nickname);
      setEntryName(member.nickname);
      setMemberToken(readMemberToken(slug));
      setMemberRole(member.role);
    } catch (err) { setEntryError(err.message || 'Não foi possível entrar no mural.'); }
  }

  async function deletePost(post) {
    if (!window.confirm('Apagar esta publicação? Essa ação não pode ser desfeita.')) return;
    try {
      const ownerToken = readPostOwnerToken(slug, post.id);
      const response = await fetch(`/api/boards/${encodeURIComponent(slug)}/posts/${encodeURIComponent(post.id)}`, {
        method: 'DELETE', headers: { ...(ownerToken ? { 'x-owner-token': ownerToken } : {}), ...(memberToken ? { 'x-member-token': memberToken } : {}) },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível apagar esta publicação.');
      setPosts((current) => current.filter((item) => item.id !== post.id));
      forgetPostOwnerToken(slug, post.id);
      setActivity(new Date().toISOString());
      setNotice('Publicação apagada.');
    } catch (err) {
      setNotice(err.message || 'Não foi possível apagar esta publicação.');
    }
  }

  const sortedPosts = useMemo(() => [...posts].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0) || new Date(b.created_at) - new Date(a.created_at)), [posts]);
  const filteredPosts = useMemo(() => {
    const term = normalizeSearchText(searchTerm).trim();
    if (!term) return sortedPosts;
    return sortedPosts.filter((post) => normalizeSearchText([post.content, post.url, post.author].join(' ')).includes(term));
  }, [sortedPosts, searchTerm]);
  const addPost = (post, ownerToken) => {
    if (!post) return;
    const stored = ownerToken ? savePostOwnerToken(slug, post.id, ownerToken) : false;
    setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)].slice(0, 60));
    setActivity(post.created_at);
    setNotice(stored ? 'Sua publicação foi adicionada ao mural.' : 'Publicado, mas este navegador não conseguiu guardar a chave para apagar o cartão depois.');
  };

  function startCardDrag(event, postId) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingId(postId);
  }
  const [draggingId, setDraggingId] = useState('');
  function moveCardOver(event) {
    if (!draggingId) return;
    const targetId = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-post-id]')?.dataset.postId;
    if (!targetId || targetId === draggingId) return;
    setPosts((current) => {
      const from = current.findIndex((post) => post.id === draggingId);
      const to = current.findIndex((post) => post.id === targetId);
      if (from < 0 || to < 0 || from === to) return current;
      const next = [...current];
      const [moving] = next.splice(from, 1);
      next.splice(to, 0, moving);
      return next.map((post, index) => ({ ...post, position: index }));
    });
  }
  async function finishCardDrag() {
    const wasDragging = draggingId;
    setDraggingId('');
    if (!wasDragging) return;
    try {
      const response = await fetch(`/api/boards/${encodeURIComponent(slug)}/reorder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postIds: sortedPosts.map((post) => post.id) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar a ordem.');
      setNotice('Posição dos cartões atualizada para todos.');
    } catch (err) {
      setNotice(err.message || 'Não foi possível salvar a ordem.');
      await fetchPosts();
    }
  }
  async function clearBoard() {
    if (!window.confirm('Apagar todas as contribuições deste mural? Esta ação não pode ser desfeita.')) return;
    try {
      const response = await fetch(`/api/boards/${encodeURIComponent(slug)}/posts`, { method: 'DELETE', headers: { 'x-member-token': memberToken } });
      const result = await response.json();
      if (!response.ok) return setNotice(result.error || 'Não foi possível limpar o mural.');
      setPosts([]);
      setActivity(new Date().toISOString());
      setNotice(`${result.deleted} ${result.deleted === 1 ? 'cartão apagado' : 'cartões apagados'}.`);
    } catch { setNotice('Não foi possível conectar ao mural. Tente novamente.'); }
  }

  const latestPost = useMemo(() => [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0], [posts]);

  if (!author.trim() && (restoring || restoreError)) return <main className="board-shell">
    <header className="topbar board-topbar"><Brand compact/><a className="back-link" href="/" onClick={(event) => { event.preventDefault(); onHome(); }}>Página inicial</a></header>
    <div className="state-card">{restoreError ? <><p>Não consegui restaurar sua entrada neste momento.</p><p>{restoreError}</p><button className="button button-primary" type="button" onClick={() => setRestoreAttempt((attempt) => attempt + 1)}>Tentar novamente</button></> : 'Reconhecendo sua participação…'}</div>
    <footer className="board-footer"><Brand compact/><PolicyLinks/></footer>
  </main>;

  if (!author.trim()) return <main className="board-shell">
    <header className="topbar board-topbar"><Brand compact/><a className="back-link" href="/" onClick={(event) => { event.preventDefault(); onHome(); }}>Página inicial</a></header>
    <section className="nickname-gate" aria-labelledby="nickname-title"><form className="nickname-card" onSubmit={enterRoom}>
      <span className="board-kicker">ENTRADA DO MURAL</span><h1 id="nickname-title">Como podemos chamar você?</h1><p>Informe um apelido para entrar na sala. Ele aparecerá nas suas contribuições.</p>
      <label htmlFor="entry-nickname">Seu apelido</label><input id="entry-nickname" value={entryName} onChange={(event) => { setEntryName(event.target.value); setEntryError(''); }} required maxLength={48} autoComplete="nickname" autoFocus placeholder="Ex.: Ana, Rafa ou Estudante 12" />
      <label className="teacher-choice"><input type="checkbox" checked={entryAsTeacher} onChange={(event) => setEntryAsTeacher(event.target.checked)} /> Sou o professor deste mural</label>
      <small>O primeiro apelido registrado como professor poderá apagar cartões de todos e limpar o mural.</small>
      {entryError && <p className="form-error" role="alert">{entryError}</p>}
      <button className="button button-primary" type="submit">Entrar na sala <Icon name="arrow" size={16}/></button>
      <small>Evite usar seu nome completo ou outras informações pessoais.</small>
    </form></section>
    <footer className="board-footer"><Brand compact/><PolicyLinks/></footer>
  </main>;

  return <main className="board-shell">
    <header className="topbar board-topbar"><Brand compact/><div className="board-header-right"><span className="board-live"><i/> mural aberto</span><button className="button button-share" onClick={copyLink}><Icon name="copy" size={16}/>{copied ? 'Link copiado' : 'Compartilhar'}</button></div></header>
    <div className="board-wrap">
      <a className="back-link" href="/" onClick={(e) => { e.preventDefault(); onHome(); }}><Icon name="arrowLeft" size={15}/> Página inicial</a>
      {loading ? <div className="state-card">Abrindo o mural…</div> : error ? <div className="state-card state-error"><span>Este mural não está disponível.</span><p>{error}</p><button className="button button-soft" onClick={onHome}>Voltar à página inicial</button></div> : <>
        <section className="board-heading"><div className="board-heading-copy"><span className="board-kicker">QUADRO DE AVISOS DA TURMA</span><h1>{board?.title}</h1><p>Textos e links importantes compartilhados pela comunidade da aula.</p><div className="access-code"><span>SIGLA PARA ENTRAR</span><strong>{board?.slug?.toUpperCase()}</strong></div></div><div className="board-summary"><div className="board-count"><strong>{posts.length}</strong><span>{posts.length === 1 ? 'contribuição' : 'contribuições'}</span></div><div className="board-latest"><span>Última contribuição</span><strong>{latestPost?.author || 'Ainda não há contribuições'}</strong>{latestPost && <time dateTime={latestPost.created_at}>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(latestPost.created_at))}</time>}</div></div></section>
        <div className="board-layout"><Composer slug={slug} author={author} memberToken={memberToken} onPosted={addPost}/><section className="wall-section" aria-labelledby="wall-title"><div className="wall-heading"><div><span className="board-kicker">O QUE A TURMA COMPARTILHOU</span><h2 id="wall-title">No mural</h2></div><div className="wall-tools">{memberRole === 'teacher' && <button className="clear-wall-button" type="button" onClick={clearBoard}><Icon name="trash" size={14}/> Limpar mural</button>}<span className="wall-count">{posts.length} {posts.length === 1 ? 'item' : 'itens'}</span></div></div>
          <div className="wall-search-wrap"><label className="wall-search"><Icon name="search" size={17}/><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar palavras nos cartões…" aria-label="Buscar por texto, link ou apelido" />{searchTerm && <button type="button" onClick={() => setSearchTerm('')} aria-label="Limpar busca"><Icon name="close" size={15}/></button>}</label>{searchTerm.trim() && <span className="wall-results-count" role="status">{filteredPosts.length} {filteredPosts.length === 1 ? 'resultado' : 'resultados'}</span>}</div>
          {notice && <p className="board-notice" role="status">{notice}</p>}
          {posts.length && filteredPosts.length ? <div className={`post-grid ${draggingId ? 'post-grid-dragging' : ''}`} onPointerMove={searchTerm.trim() ? undefined : moveCardOver} onPointerUp={searchTerm.trim() ? undefined : finishCardDrag} onPointerCancel={searchTerm.trim() ? undefined : finishCardDrag}>{filteredPosts.map((post, index) => <PostCard key={post.id} post={post} index={index} ownerToken={readPostOwnerToken(slug, post.id)} ownPost={post.author === author} isTeacher={memberRole === 'teacher'} onDragStart={startCardDrag} onDelete={deletePost} canDrag={!searchTerm.trim()}/>)}</div> : posts.length ? <div className="empty-wall search-empty"><div className="empty-illustration"><Icon name="search" size={24}/></div><h3>Nenhum cartão encontrado</h3><p>Não há cartões com “{searchTerm.trim()}”. Experimente outro termo.</p><button className="button button-soft" type="button" onClick={() => setSearchTerm('')}>Limpar busca</button></div> : <div className="empty-wall"><div className="empty-illustration"><Icon name="board" size={27}/></div><h3>O mural está esperando por você</h3><p>Adicione a primeira anotação ou compartilhe um link importante da aula.</p></div>}
          {sortedPosts.length >= 60 && <p className="wall-limit">Mostrando as 60 contribuições mais recentes.</p>}
        </section></div>
      </>}
    </div>
    <footer className="board-footer"><span><Brand compact/></span><span>Um espaço simples para aprender junto.</span><span>celotexEDU <i>·</i> mural colaborativo</span><PolicyLinks/></footer>
  </main>;
}

export default function App() {
  const policyPath = POLICY_CONTENT[window.location.pathname.replace(/\/$/, '')] ? window.location.pathname.replace(/\/$/, '') : '';
  const readRoute = () => {
    const match = window.location.pathname.match(/^\/m\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : '';
  };
  const [slug, setSlug] = useState(readRoute);
  useEffect(() => {
    const onPop = () => setSlug(readRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  function openBoard(nextSlug) { window.location.assign(`/m/${encodeURIComponent(nextSlug)}`); }
  if (policyPath) return <PolicyPage path={policyPath}/>;
  return slug ? <BoardPage key={slug} slug={slug} onHome={() => { window.history.pushState({}, '', '/'); setSlug(''); }} /> : <Landing onOpen={openBoard}/>;
}
