import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeListLimit, validateBoardInput, validateNickname, validatePostInput } from './validation.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const boardFields = 'id, slug, title, created_at, updated_at';
const postFields = 'id, board_id, author, kind, content, url, created_at, position, member_id';

function rateLimitHandler(_req, res) {
  return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
}

function hashOwnerToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function readMemberToken(req) {
  const token = String(req.get('x-member-token') || '');
  return /^[a-f0-9]{64}$/.test(token) ? token : '';
}

async function findMember(db, boardId, token) {
  if (!token) return null;
  const { data } = await db.from('board_members').select('id, nickname, role')
    .eq('board_id', boardId).eq('member_token_hash', hashOwnerToken(token)).maybeSingle();
  return data || null;
}

export function createApp({ db, production = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '128kb', type: 'application/json' }));

  const boardCreateLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, handler: rateLimitHandler });
  const postCreateLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, handler: rateLimitHandler });
  const memberCreateLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, handler: rateLimitHandler });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/boards', boardCreateLimit, async (req, res) => {
    const validation = validateBoardInput(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const { value } = validation;
    const { data, error } = await db.from('boards')
      .insert([{ slug: value.slug, title: value.title }])
      .select(boardFields)
      .single();
    if (error) {
      if (error.code === '23505' || /duplicate|unique/i.test(error.message || '')) {
        return res.status(409).json({ error: 'Essa sigla já está em uso. Escolha outra.' });
      }
      console.error('board.create failed:', error.code || 'database_error');
      return res.status(500).json({ error: 'Não foi possível criar o mural agora.' });
    }
    return res.status(201).json({ slug: data.slug, board: data });
  });

  app.get('/api/boards/:slug', async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,15}$/.test(slug)) return res.status(400).json({ error: 'Sigla inválida.' });
    const { data, error } = await db.from('boards').select(boardFields).eq('slug', slug).maybeSingle();
    if (error) {
      console.error('board.read failed:', error.code || 'database_error');
      return res.status(500).json({ error: 'Não foi possível abrir o mural agora.' });
    }
    if (!data) return res.status(404).json({ error: 'Mural não encontrado. Confira a sigla e tente novamente.' });
    return res.json({ board: data });
  });

  app.get('/api/boards/:slug/activity', async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,15}$/.test(slug)) return res.status(400).json({ error: 'Sigla inválida.' });
    const { data, error } = await db.from('boards').select('slug, updated_at').eq('slug', slug).maybeSingle();
    if (error) {
      console.error('board.activity failed:', error.code || 'database_error');
      return res.status(500).json({ error: 'Não foi possível atualizar o mural.' });
    }
    if (!data) return res.status(404).json({ error: 'Mural não encontrado.' });
    return res.json({ activity: data.updated_at });
  });

  app.get('/api/boards/:slug/members/me', async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,15}$/.test(slug)) return res.status(400).json({ error: 'Sigla inválida.' });
    const boardResult = await db.from('boards').select('id').eq('slug', slug).maybeSingle();
    if (boardResult.error) return res.status(500).json({ error: 'Não foi possível restaurar sua participação.' });
    if (!boardResult.data) return res.status(404).json({ error: 'Mural não encontrado.' });
    const member = await findMember(db, boardResult.data.id, readMemberToken(req));
    if (!member) return res.status(401).json({ error: 'A chave desta participação não está mais disponível.' });
    return res.json({ member });
  });

  app.post('/api/boards/:slug/members', memberCreateLimit, async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,15}$/.test(slug)) return res.status(400).json({ error: 'Sigla inválida.' });
    const validation = validateNickname(req.body?.nickname);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const nickname = validation.value;
    const requestedRole = req.body?.role === 'teacher' ? 'teacher' : 'student';
    const boardResult = await db.from('boards').select('id').eq('slug', slug).maybeSingle();
    if (boardResult.error) return res.status(500).json({ error: 'Não foi possível entrar no mural agora.' });
    if (!boardResult.data) return res.status(404).json({ error: 'Mural não encontrado.' });

    const memberToken = readMemberToken(req);
    const nicknameKey = nickname;
    if (memberToken) {
      const existing = await db.from('board_members').select('id, nickname, role')
        .eq('board_id', boardResult.data.id).eq('nickname_key', nicknameKey)
        .eq('member_token_hash', hashOwnerToken(memberToken)).maybeSingle();
      if (existing.data) return res.json({ member: existing.data, memberToken });
    }

    const newToken = randomBytes(32).toString('hex');
    const { data, error } = await db.from('board_members').insert([{
      board_id: boardResult.data.id,
      nickname,
      nickname_key: nicknameKey,
      role: requestedRole,
      member_token_hash: hashOwnerToken(newToken),
    }]).select('id, nickname, role').single();
    if (error) {
      if (error.code === '23505' || /duplicate|unique/i.test(error.message || '')) {
        if (requestedRole === 'teacher') {
          const teacher = await db.from('board_members').select('id').eq('board_id', boardResult.data.id).eq('role', 'teacher').maybeSingle();
          if (teacher.data) return res.status(409).json({ code: 'teacher_exists', error: 'Já há um professor cadastrado neste mural. Entre como estudante.' });
        }
        return res.status(409).json({ code: 'nickname_taken', error: 'Esse apelido já está em uso nesta sala. Escolha outro apelido.' });
      }
      console.error('member.register failed:', error.code || 'database_error');
      return res.status(500).json({ error: 'Não foi possível registrar sua entrada.' });
    }
    return res.status(201).json({ member: data, memberToken: newToken });
  });

  app.get('/api/boards/:slug/posts', async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,15}$/.test(slug)) return res.status(400).json({ error: 'Sigla inválida.' });
    const boardResult = await db.from('boards').select('id, updated_at').eq('slug', slug).maybeSingle();
    if (boardResult.error) {
      console.error('board.posts board lookup failed:', boardResult.error.code || 'database_error');
      return res.status(500).json({ error: 'Não foi possível carregar as contribuições.' });
    }
    if (!boardResult.data) return res.status(404).json({ error: 'Mural não encontrado.' });
    const { data, error } = await db.from('board_posts').select(postFields)
      .eq('board_id', boardResult.data.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(normalizeListLimit(req.query.limit));
    if (error) {
      console.error('board.posts read failed:', error.code || 'database_error');
      return res.status(500).json({ error: 'Não foi possível carregar as contribuições.' });
    }
    return res.json({ posts: data || [], activity: boardResult.data.updated_at });
  });

  app.post('/api/boards/:slug/posts', postCreateLimit, async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,15}$/.test(slug)) return res.status(400).json({ error: 'Sigla inválida.' });
    const validation = validatePostInput(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const boardResult = await db.from('boards').select('id').eq('slug', slug).maybeSingle();
    if (boardResult.error) {
      console.error('post.create board lookup failed:', boardResult.error.code || 'database_error');
      return res.status(500).json({ error: 'Não foi possível publicar agora.' });
    }
    if (!boardResult.data) return res.status(404).json({ error: 'Mural não encontrado.' });
    const member = await findMember(db, boardResult.data.id, readMemberToken(req));
    if (!member) return res.status(401).json({ error: 'Entre no mural com seu apelido antes de publicar.' });
    const firstPost = await db.from('board_posts').select('position').eq('board_id', boardResult.data.id)
      .order('position', { ascending: true }).limit(1);
    const nextPosition = firstPost.data?.length ? Number(firstPost.data[0].position) - 1 : 0;
    const ownerToken = randomBytes(32).toString('hex');
    const { data, error } = await db.from('board_posts')
      .insert([{ board_id: boardResult.data.id, member_id: member.id, author: member.nickname, position: nextPosition, owner_token_hash: hashOwnerToken(ownerToken), ...validation.value }])
      .select(postFields)
      .single();
    if (error) {
      console.error('post.create failed:', error.code || 'database_error');
      return res.status(500).json({ error: 'Não foi possível publicar agora.' });
    }
    return res.status(201).json({ post: data, ownerToken });
  });

  app.delete('/api/boards/:slug/posts/:postId', postCreateLimit, async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    const postId = String(req.params.postId || '');
    const ownerToken = String(req.get('x-owner-token') || '');
    if (!/^[a-z0-9][a-z0-9-]{1,15}$/.test(slug)) return res.status(400).json({ error: 'Sigla inválida.' });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(postId)) return res.status(400).json({ error: 'Publicação inválida.' });
    const boardResult = await db.from('boards').select('id').eq('slug', slug).maybeSingle();
    if (boardResult.error) {
      console.error('post.delete board lookup failed:', boardResult.error.code || 'database_error');
      return res.status(500).json({ error: 'Não foi possível apagar agora.' });
    }
    if (!boardResult.data) return res.status(404).json({ error: 'Mural não encontrado.' });
    const member = await findMember(db, boardResult.data.id, readMemberToken(req));
    const target = await db.from('board_posts').select('id, member_id, owner_token_hash').eq('id', postId).eq('board_id', boardResult.data.id).maybeSingle();
    if (target.error) return res.status(500).json({ error: 'Não foi possível apagar agora.' });
    if (!target.data) return res.status(404).json({ error: 'Esta publicação já foi apagada.' });
    const isMemberOwner = Boolean(member && (member.role === 'teacher' || target.data.member_id === member.id));
    const isLegacyOwner = /^[a-f0-9]{64}$/.test(ownerToken) && target.data.owner_token_hash === hashOwnerToken(ownerToken);
    if (!isMemberOwner && !isLegacyOwner) return res.status(403).json({ error: 'Somente quem publicou ou o professor pode apagar este cartão.' });
    const { data, error } = await db.from('board_posts').delete().eq('id', postId).eq('board_id', boardResult.data.id).select('id').maybeSingle();
    if (error) {
      console.error('post.delete failed:', error.code || 'database_error');
      return res.status(500).json({ error: 'Não foi possível apagar agora.' });
    }
    if (!data) return res.status(404).json({ error: 'Esta publicação não foi criada neste navegador ou já foi apagada.' });
    return res.json({ deleted: true, id: data.id });
  });

  app.delete('/api/boards/:slug/posts', postCreateLimit, async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,15}$/.test(slug)) return res.status(400).json({ error: 'Sigla inválida.' });
    const boardResult = await db.from('boards').select('id').eq('slug', slug).maybeSingle();
    if (boardResult.error) return res.status(500).json({ error: 'Não foi possível limpar o mural.' });
    if (!boardResult.data) return res.status(404).json({ error: 'Mural não encontrado.' });
    const member = await findMember(db, boardResult.data.id, readMemberToken(req));
    if (!member || member.role !== 'teacher') return res.status(403).json({ error: 'Somente o professor deste mural pode limpar as contribuições.' });
    const { data, error } = await db.from('board_posts').delete().eq('board_id', boardResult.data.id).select('id');
    if (error) {
      console.error('posts.clear failed:', error.code || 'database_error');
      return res.status(500).json({ error: 'Não foi possível limpar o mural.' });
    }
    return res.json({ deleted: data?.length || 0 });
  });

  app.post('/api/boards/:slug/reorder', postCreateLimit, async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    const postIds = req.body?.postIds;
    if (!/^[a-z0-9][a-z0-9-]{1,15}$/.test(slug)) return res.status(400).json({ error: 'Sigla inválida.' });
    if (!Array.isArray(postIds) || postIds.length > 60 || postIds.some((id) => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) || new Set(postIds).size !== postIds.length) return res.status(400).json({ error: 'A ordem enviada não é válida.' });
    const boardResult = await db.from('boards').select('id').eq('slug', slug).maybeSingle();
    if (boardResult.error) return res.status(500).json({ error: 'Não foi possível mover os cartões.' });
    if (!boardResult.data) return res.status(404).json({ error: 'Mural não encontrado.' });
    const current = await db.from('board_posts').select('id').eq('board_id', boardResult.data.id).limit(100);
    if (current.error) return res.status(500).json({ error: 'Não foi possível mover os cartões.' });
    const currentIds = new Set((current.data || []).map((post) => post.id));
    if (postIds.some((id) => !currentIds.has(id))) return res.status(409).json({ error: 'O mural mudou durante a movimentação. Atualize e tente novamente.' });
    const { data, error } = await db.rpc('reorder_board_posts', { p_board_id: boardResult.data.id, p_post_ids: postIds });
    if (error) {
      console.error('posts.reorder failed:', error.code || 'database_error');
      return res.status(500).json({ error: 'Não foi possível salvar a nova posição.' });
    }
    return res.json({ reordered: Number(data) || postIds.length });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota da API não encontrada.' }));

  const distPath = path.join(projectRoot, 'dist');
  app.use(express.static(distPath, { index: false, maxAge: production ? '1h' : 0 }));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(distPath, 'index.html'), (error) => error && next(error));
  });

  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'A solicitação ficou grande demais.' });
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'O conteúdo enviado não é um JSON válido.' });
    console.error('request failed:', error?.message || 'unknown_error');
    return res.status(500).json({ error: 'Ocorreu um erro interno.' });
  });

  return app;
}
