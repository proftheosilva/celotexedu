import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminClient } from '@insforge/sdk';
import { createApp } from './app.js';
import { readRuntimeConfig } from './config.js';

const enabled = process.env.CELOTEX_INTEGRATION === '1';

test('integra apelidos, papéis, contribuições, ordenação e limpeza com InsForge', { skip: !enabled }, async (t) => {
  const config = readRuntimeConfig();
  const client = createAdminClient({ baseUrl: config.baseUrl, apiKey: config.apiKey });
  const server = createApp({ db: client.database }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const code = `T${Date.now().toString(36).toUpperCase().slice(-10)}`;
  let boardId;

  try {
    const created = await fetch(`${baseUrl}/api/boards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Teste de integração celotex', code }) });
    const board = await created.json(); assert.equal(created.status, 201, JSON.stringify(board));
    boardId = board.board.id;

    const register = async (nickname, role = 'student') => {
      const response = await fetch(`${baseUrl}/api/boards/${board.slug}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname, role }) });
      return { response, result: await response.json() };
    };
    const teacher = await register('Docente', 'teacher'); assert.equal(teacher.response.status, 201, JSON.stringify(teacher.result));
    const student = await register('Áluno'); assert.equal(student.response.status, 201, JSON.stringify(student.result));
    const restoredMember = await fetch(`${baseUrl}/api/boards/${board.slug}/members/me`, { headers: { 'x-member-token': student.result.memberToken } });
    assert.equal(restoredMember.status, 200); assert.equal((await restoredMember.json()).member.nickname, 'aluno');
    const duplicate = await register('aluno'); assert.equal(duplicate.response.status, 409);
    const otherTeacher = await register('Outro', 'teacher'); assert.equal(otherTeacher.response.status, 409);

    const post = await fetch(`${baseUrl}/api/boards/${board.slug}/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-member-token': student.result.memberToken }, body: JSON.stringify({ kind: 'text', author: 'Falsificado', content: 'Integração com InsForge' }) });
    const postResult = await post.json(); assert.equal(post.status, 201, JSON.stringify(postResult));
    assert.equal(postResult.post.author, 'aluno'); assert.equal(Object.hasOwn(postResult.post, 'owner_token_hash'), false);

    const listed = await fetch(`${baseUrl}/api/boards/${board.slug}/posts?limit=10`); const listedResult = await listed.json();
    assert.equal(listed.status, 200); assert.equal(listedResult.posts.length, 1); assert.ok(listedResult.activity);
    const reordered = await fetch(`${baseUrl}/api/boards/${board.slug}/reorder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postIds: [postResult.post.id] }) });
    assert.equal(reordered.status, 200, await reordered.text());

    const forbidden = await fetch(`${baseUrl}/api/boards/${board.slug}/posts`, { method: 'DELETE', headers: { 'x-member-token': student.result.memberToken } });
    assert.equal(forbidden.status, 403);
    const cleared = await fetch(`${baseUrl}/api/boards/${board.slug}/posts`, { method: 'DELETE', headers: { 'x-member-token': teacher.result.memberToken } });
    const clearedResult = await cleared.json(); assert.equal(cleared.status, 200, JSON.stringify(clearedResult)); assert.equal(clearedResult.deleted, 1);
    const afterClear = await fetch(`${baseUrl}/api/boards/${board.slug}/posts?limit=10`); assert.equal((await afterClear.json()).posts.length, 0);
  } finally {
    if (boardId) {
      const { error } = await client.database.from('boards').delete().eq('id', boardId);
      assert.ifError(error);
    }
  }
});
