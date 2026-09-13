import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export function passwordHash(password: string) {
 const salt=randomBytes(16).toString('hex');
 return `scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
}
export function passwordMatches(password: string, stored: string) {
 const [kind,salt,hash]=stored.split(':');
 if(kind!=='scrypt'||!salt||!hash||password.length>256) return false;
 const expected=Buffer.from(hash,'hex'),actual=scryptSync(password,salt,64);
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
