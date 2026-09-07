import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const HASH_PREFIX = 'scrypt';

const deriveKey = (password: string, salt: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, key) => {
      if (error !== null) {
        reject(error);
        return;
      }

      resolve(key);
    });
  });

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = await deriveKey(password, salt);

  return `${HASH_PREFIX}$${salt}$${hash.toString('hex')}`;
};

export const verifyPassword = async (
  password: string,
  encodedHash: string,
): Promise<boolean> => {
  const [prefix, salt, storedHashHex, ...extraParts] = encodedHash.split('$');

  if (
    prefix !== HASH_PREFIX ||
    salt === undefined ||
    storedHashHex === undefined ||
    extraParts.length > 0
  ) {
    return false;
  }

  const storedHash = Buffer.from(storedHashHex, 'hex');

  if (storedHash.length !== KEY_LENGTH) {
    return false;
  }

  const suppliedHash = await deriveKey(password, salt);

  return timingSafeEqual(storedHash, suppliedHash);
};

