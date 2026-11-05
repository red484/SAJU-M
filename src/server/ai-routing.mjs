// Read only documented routing identifiers, never arbitrary extra_fields or error bodies.
export function routingMetadata(raw) {
  const identifier = (value, pattern) => typeof value === 'string' && !/^sk-/i.test(value) && pattern.test(value) ? value : null;
  return {
    provider: identifier(raw?.provider, /^[a-z][a-z0-9._-]{0,63}$/),
    model: identifier(raw?.resolved_model_used, /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/)
  };
}
