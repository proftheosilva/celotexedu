import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';

function createMemoryDb() {
  const tables = { boards: [], board_posts: [], board_members: [] };
  const db = {
    from(table) {
      let action = 'select'; let insertRows = []; let filters = []; let maxRows = Infinity; let selectedFields = null; let ordering = [];
      const query = {
        select(fields) { selectedFields = typeof fields === 'string' ? fields.split(',').map((field) => field.trim()) : null; return query; },
        insert(rows) { action = 'insert'; insertRows = rows; return query; },
        delete() { action = 'delete'; return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        order(column, options = {}) { ordering.push([column, options.ascending !== false]); return query; },
        limit(value) { maxRows = value; return run(); },
        then(resolve, reject) { return run().then(resolve, reject); },
        async single() { return run(); },
        async maybeSingle() { const result = await run(); return { data: Array.isArray(result.data) ? result.data[0] || null : result.data, error: result.error }; },
      };
      function run() {
        const rows = tables[table];
        if (action === 'insert') {
          const added = insertRows.map((row, index) => ({ id: `00000000-0000-4000-8000-${String(rows.length + index + 1).padStart(12, '0')}`, created_at: new Date(Date.now() + index).toISOString(), updated_at: new Date().toISOString(), ...row }));
          if (table === 'boards' && rows.some((item) => item.slug === added[0]?.slug)) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
          if (table === 'board_members' && added.some((item) => rows.some((existing) => existing.board_id === item.board_id && (existing.nickname_key === item.nickname_key || (existing.role === 'teacher' && item.role === 'teacher'))))) return Promise.resolve({ data: null, error: { code: '23505', message: 'unique violation' } });
          rows.push(...added);
          return Promise.resolve({ data: projectFields(added[0]) || null, error: null });
        }
        let result = rows.filter((row) => filters.every(([column, value]) => row[column] === value));
        if (ordering.length) result = [...result].sort((a, b) => {
          for (const [column, ascending] of ordering) {
            const comparison = (a[column] > b[column] ? 1 : a[column] < b[column] ? -1 : 0) * (ascending ? 1 : -1);
            if (comparison) return comparison;
          }
          return 0;
        });
        if (action === 'delete') tables[table] = rows.filter((row) => !result.includes(row));
        return Promise.resolve({ data: result.slice(0, maxRows).map(projectFields), error: null });
      }
      function projectFields(row) { return !row || !selectedFields ? row : Object.fromEntries(selectedFields.map((field) => [field, row[field]])); }
      return query;
    },
    async rpc(name, args) {
      if (name !== 'reorder_board_posts') return { data: null, error: { message: 'unknown function' } };
      args.p_post_ids.forEach((id, index) => { const post = tables.board_posts.find((item) => item.id === id && item.board_id === args.p_board_id); if (post) post.position = index + 1; });
      return { data: args.p_post_ids.length, error: null };
    },
  };
  return db;
}

async function withServer(t, db, run) {
  const server = createApp({ db }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  await run(`http://127.0.0.1:${server.address().port}`);
}

async function createBoard(baseUrl, code) {
  const response = await fetch(`${baseUrl}/api/boards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `Mural ${code}`, code }) });
  assert.equal(response.status, 201);
  return response.json();
}

async function register(baseUrl, slug, nickname, role = 'student') {
  const response = await fetch(`${baseUrl}/api/boards/${slug}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname, role }) });
  return { response, result: await response.json() };
}

test('cria mural pela sigla e impede que a mesma sigla seja reutilizada', async (t) => {
  await withServer(t, createMemoryDb(), async (baseUrl) => {
    const created = await createBoard(baseUrl, 'IA-8A');
    assert.equal(created.slug, 'ia-8a');
    const duplicate = await fetch(`${baseUrl}/api/boards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Outra turma', code: 'ia-8a' }) });
    assert.equal(duplicate.status, 409);
  });
});

test('normaliza apelido e torna-o exclusivo somente dentro do mesmo mural', async (t) => {
  await withServer(t, createMemoryDb(), async (baseUrl) => {
    await createBoard(baseUrl, 'TST-01'); await createBoard(baseUrl, 'TST-02');
    const first = await register(baseUrl, 'tst-01', '  ÁNA   Silva ');
    assert.equal(first.response.status, 201); assert.equal(first.result.member.nickname, 'ana silva');
    const restored = await fetch(`${baseUrl}/api/boards/tst-01/members/me`, { headers: { 'x-member-token': first.result.memberToken } });
    assert.equal(restored.status, 200); assert.equal((await restored.json()).member.nickname, 'ana silva');
    const missingKey = await fetch(`${baseUrl}/api/boards/tst-01/members/me`);
    assert.equal(missingKey.status, 401);
    const duplicate = await register(baseUrl, 'tst-01', 'Ana Silva');
    assert.equal(duplicate.response.status, 409); assert.equal(duplicate.result.code, 'nickname_taken');
    const otherRoom = await register(baseUrl, 'tst-02', 'Ana Silva');
    assert.equal(otherRoom.response.status, 201);
  });
});

test('reserva um professor por mural, permite que ele apague qualquer cartão e limpe a sala', async (t) => {
  await withServer(t, createMemoryDb(), async (baseUrl) => {
    await createBoard(baseUrl, 'PROF-1');
    const teacher = await register(baseUrl, 'prof-1', 'Docente', 'teacher');
    assert.equal(teacher.response.status, 201);
    const secondTeacher = await register(baseUrl, 'prof-1', 'Outra pessoa', 'teacher');
    assert.equal(secondTeacher.response.status, 409); assert.equal(secondTeacher.result.code, 'teacher_exists');
    const student = await register(baseUrl, 'prof-1', 'Aluno');
    assert.equal(student.response.status, 201);
    const post = await fetch(`${baseUrl}/api/boards/prof-1/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-member-token': student.result.memberToken }, body: JSON.stringify({ kind: 'text', content: 'Anotação da turma', author: 'apelido falsificado' }) });
    assert.equal(post.status, 201);
    const postResult = await post.json(); assert.equal(postResult.post.author, 'aluno');
    const forbidden = await fetch(`${baseUrl}/api/boards/prof-1/posts`, { method: 'DELETE', headers: { 'x-member-token': student.result.memberToken } });
    assert.equal(forbidden.status, 403);
    const deleteAny = await fetch(`${baseUrl}/api/boards/prof-1/posts/${postResult.post.id}`, { method: 'DELETE', headers: { 'x-member-token': teacher.result.memberToken } });
    assert.equal(deleteAny.status, 200);
    const another = await fetch(`${baseUrl}/api/boards/prof-1/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-member-token': student.result.memberToken }, body: JSON.stringify({ kind: 'text', content: 'Segunda anotação' }) });
    const anotherResult = await another.json(); assert.equal(another.status, 201);
    const clear = await fetch(`${baseUrl}/api/boards/prof-1/posts`, { method: 'DELETE', headers: { 'x-member-token': teacher.result.memberToken } });
    assert.equal(clear.status, 200); assert.equal((await clear.json()).deleted, 1);
    const list = await fetch(`${baseUrl}/api/boards/prof-1/posts?limit=10`); assert.equal((await (await list.json()).posts).length, 0);
  });
});

test('exige registro na sala para publicar e impede exclusão por outro participante', async (t) => {
  await withServer(t, createMemoryDb(), async (baseUrl) => {
    await createBoard(baseUrl, 'OWN-01');
    const outsider = await fetch(`${baseUrl}/api/boards/own-01/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'text', content: 'Sem membro' }) });
    assert.equal(outsider.status, 401);
    const a = await register(baseUrl, 'own-01', 'lia'); const b = await register(baseUrl, 'own-01', 'bia');
    const posted = await fetch(`${baseUrl}/api/boards/own-01/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-member-token': a.result.memberToken }, body: JSON.stringify({ kind: 'text', content: '<script>alert(1)</script>' }) });
    const result = await posted.json(); assert.equal(posted.status, 201); assert.equal(result.post.content, '<script>alert(1)</script>');
    const denied = await fetch(`${baseUrl}/api/boards/own-01/posts/${result.post.id}`, { method: 'DELETE', headers: { 'x-member-token': b.result.memberToken } }); assert.equal(denied.status, 403);
    const deleted = await fetch(`${baseUrl}/api/boards/own-01/posts/${result.post.id}`, { method: 'DELETE', headers: { 'x-member-token': a.result.memberToken } }); assert.equal(deleted.status, 200);
  });
});

test('aceita anotações longas acima do limite anterior e dentro do novo limite', async (t) => {
  await withServer(t, createMemoryDb(), async (baseUrl) => {
    await createBoard(baseUrl, 'LONG-1'); const member = await register(baseUrl, 'long-1', 'bia');
    const content = 'a'.repeat(19000);
    const response = await fetch(`${baseUrl}/api/boards/long-1/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-member-token': member.result.memberToken },
      body: JSON.stringify({ kind: 'text', content }),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).post.content.length, 19000);
  });
});

test('aceita URLs HTTP/HTTPS e rejeita protocolos ativos', async (t) => {
  await withServer(t, createMemoryDb(), async (baseUrl) => {
    await createBoard(baseUrl, 'URL-01'); const member = await register(baseUrl, 'url-01', 'bia');
    const unsafe = await fetch(`${baseUrl}/api/boards/url-01/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-member-token': member.result.memberToken }, body: JSON.stringify({ kind: 'link', url: 'javascript:alert(1)' }) });
    assert.equal(unsafe.status, 400);
    const safe = await fetch(`${baseUrl}/api/boards/url-01/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-member-token': member.result.memberToken }, body: JSON.stringify({ kind: 'link', url: 'https://example.org' }) });
    assert.equal(safe.status, 201);
  });
});

test('salva a ordem dos cartões informada por qualquer participante', async (t) => {
  await withServer(t, createMemoryDb(), async (baseUrl) => {
    await createBoard(baseUrl, 'ORD-01'); const member = await register(baseUrl, 'ord-01', 'aluno');
    const ids = [];
    for (const content of ['um', 'dois', 'três']) {
      const response = await fetch(`${baseUrl}/api/boards/ord-01/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-member-token': member.result.memberToken }, body: JSON.stringify({ kind: 'text', content }) });
      ids.push((await response.json()).post.id);
    }
    const reorder = await fetch(`${baseUrl}/api/boards/ord-01/reorder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postIds: [ids[2], ids[0], ids[1]] }) });
    assert.equal(reorder.status, 200);
    const listed = await fetch(`${baseUrl}/api/boards/ord-01/posts?limit=10`); const posts = (await listed.json()).posts;
    assert.deepEqual(posts.map((post) => post.id), [ids[2], ids[0], ids[1]]);
  });
});

test('não revela acesso para siglas inválidas ou mural inexistente e serve as políticas', async (t) => {
  await withServer(t, createMemoryDb(), async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/boards/bad_code`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/boards/no-such`)).status, 404);
    for (const route of ['/termos-de-uso', '/politica-de-privacidade', '/politica-de-cookies', '/politica-de-conteudo', '/politica-de-reembolso']) {
      const response = await fetch(`${baseUrl}${route}`); assert.equal(response.status, 200, route); assert.match(await response.text(), /<div id="root">/, route);
    }
  });
});
