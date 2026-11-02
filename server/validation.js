const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,15}$/;
const RESERVED_SLUGS = new Set(['api', 'm', 'assets', 'favicon-ico']);

export function normalizeClassCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : '';
}

export function validateBoardInput(body = {}) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const code = normalizeClassCode(body.code);
  const slug = code.toLowerCase();
  if (title.length < 3 || title.length > 80) {
    return { error: 'O nome do mural deve ter entre 3 e 80 caracteres.' };
  }
  if (!/^[A-Z0-9][A-Z0-9-]{1,15}$/.test(code) || code.endsWith('-')) {
    return { error: 'A sigla precisa ter de 2 a 16 caracteres: letras, números e hífen.' };
  }
  if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) {
    return { error: 'Essa sigla não pode ser usada. Escolha outra.' };
  }
  return { value: { title, code, slug } };
}

export function validatePostInput(body = {}) {
  const kind = body.kind;
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const urlInput = typeof body.url === 'string' ? body.url.trim() : '';
  if (!['text', 'link'].includes(kind)) return { error: 'Escolha texto ou link.' };
  if (kind === 'text') {
    if (!content || content.length > 20000) return { error: 'A anotação precisa ter até 20.000 caracteres.' };
    return { value: { kind, content, url: null } };
  }
  if (content.length > 500) return { error: 'A observação do link pode ter até 500 caracteres.' };
  if (!urlInput || urlInput.length > 2048) return { error: 'Informe um endereço válido de até 2048 caracteres.' };
  let url;
  try {
    const parsed = new URL(urlInput);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid scheme');
    url = parsed.href;
  } catch {
    return { error: 'Use um endereço começando com http:// ou https://.' };
  }
  return { value: { kind, content, url } };
}

export function normalizeNickname(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export function validateNickname(value) {
  const nickname = normalizeNickname(value);
  if (!nickname) return { error: 'Informe seu apelido para entrar na sala.' };
  if (nickname.length > 48) return { error: 'O apelido pode ter até 48 caracteres.' };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u.test(nickname)) return { error: 'Use letras, números, espaços, ponto, hífen ou sublinhado no apelido.' };
  return { value: nickname };
}

export function normalizeListLimit(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return 60;
  return Math.max(1, Math.min(number, 100));
}
