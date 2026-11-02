import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClassCode, normalizeListLimit, normalizeNickname, validateBoardInput, validateNickname, validatePostInput } from './validation.js';

test('normaliza a sigla da turma sem transformar o nome do mural em código', () => {
  assert.equal(normalizeClassCode(' ia-8a '), 'IA-8A');
  assert.deepEqual(validateBoardInput({ title: '8º ano · Inteligência Artificial', code: 'IA-8A' }).value, {
    title: '8º ano · Inteligência Artificial',
    code: 'IA-8A',
    slug: 'ia-8a',
  });
});

test('rejeita siglas curtas demais, duplicáveis por ambiguidade ou reservadas', () => {
  assert.match(validateBoardInput({ title: 'Turma válida', code: 'A' }).error, /sigla/i);
  assert.match(validateBoardInput({ title: 'Turma válida', code: 'API' }).error, /sigla/i);
  assert.match(validateBoardInput({ title: 'Turma válida', code: 'AULA-' }).error, /sigla/i);
});

test('limita o comprimento do nome do mural', () => {
  assert.match(validateBoardInput({ title: 'Oi', code: 'IA8A' }).error, /nome/i);
  assert.match(validateBoardInput({ title: 'x'.repeat(81), code: 'IA8A' }).error, /nome/i);
});

test('valida contribuição separada da identificação do participante', () => {
  assert.deepEqual(validatePostInput({ kind: 'text', content: 'Resumo da aula' }).value, {
    kind: 'text', content: 'Resumo da aula', url: null,
  });
  assert.match(validatePostInput({ kind: 'text', content: '   ' }).error, /anotação/i);
  assert.equal(validatePostInput({ kind: 'text', content: 'x'.repeat(20000) }).value.content.length, 20000);
  assert.match(validatePostInput({ kind: 'text', content: 'x'.repeat(20001) }).error, /20\.000/i);
});

test('só aceita links HTTP ou HTTPS e mantém observação opcional', () => {
  assert.deepEqual(validatePostInput({ kind: 'link', url: 'https://example.org/a', content: 'Leitura complementar' }).value, {
    kind: 'link', content: 'Leitura complementar', url: 'https://example.org/a',
  });
  assert.match(validatePostInput({ kind: 'link', author: 'Bia', url: 'javascript:alert(1)' }).error, /http/i);
  assert.match(validatePostInput({ kind: 'link', url: 'https://example.org', content: 'x'.repeat(501) }).error, /500/i);
});

test('normaliza apelidos sem acentos e valida tamanho e caracteres', () => {
  assert.equal(normalizeNickname('  ÁNA   Silva '), 'ana silva');
  assert.deepEqual(validateNickname('João_7').value, 'joao_7');
  assert.match(validateNickname('   ').error, /apelido/i);
  assert.match(validateNickname('x'.repeat(49)).error, /48/i);
  assert.match(validateNickname('nome@invalido').error, /letras/i);
});

test('limita a listagem de contribuições a no máximo 100', () => {
  assert.equal(normalizeListLimit('1000'), 100);
  assert.equal(normalizeListLimit('-4'), 1);
  assert.equal(normalizeListLimit('abc'), 60);
});
