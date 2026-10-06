// Apple's name is supplied only on the first authorization, outside id_token.
// Use it only as display text after the code/token/nonce have been verified.
export function appleDisplayName(raw) {
  try {
    const name = JSON.parse(raw || '{}').name;
    return [name?.firstName, name?.lastName]
      .filter(value => typeof value === 'string')
      .map(value => value.replace(/[\u0000-\u001f\u007f]/g, '').trim())
      .filter(Boolean).join(' ').slice(0, 100) || null;
  } catch { return null; }
}
