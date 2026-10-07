import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(derive);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const validPassword = value => typeof value === 'string' && value.length >= 12 && value.length <= 128;
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 32, options);
  return `scrypt1:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const match = /^scrypt1:([a-f0-9]{32}):([a-f0-9]{64})$/.exec(encoded || '');
  // Perform the same expensive derivation for unknown users.
  const key = await scrypt(password, match?.[1] || '0'.repeat(32), 32, options);
  return timingSafeEqual(key, Buffer.from(match?.[2] || '0'.repeat(64), 'hex')) && Boolean(match);
}
