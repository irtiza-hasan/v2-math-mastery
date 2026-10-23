const encoder = new TextEncoder();
const decoder = new TextDecoder();
function b64(bytes) { let value=''; for (const byte of bytes) value+=String.fromCharCode(byte); return btoa(value); }
function unb64(value) { return Uint8Array.from(atob(value), character=>character.charCodeAt(0)); }
async function keyFrom(secret) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('A controller secret of at least 16 characters is required.');
  const material=await crypto.subtle.digest('SHA-256',encoder.encode(`llm-ta-controller-v1:${secret}`));
  return crypto.subtle.importKey('raw',material,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function sealState(state, secret) {
  const key=await keyFrom(secret), iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('llm-ta-state-v1')},key,encoder.encode(JSON.stringify(state)));
  return `v1.${b64(iv)}.${b64(new Uint8Array(ciphertext))}`;
}
export async function openState(token, secret) {
  if (typeof token!=='string'||token.length>200_000) throw new Error('Invalid learning-state token.');
  const [version,iv,ciphertext,...extra]=token.split('.');
  if(version!=='v1'||!iv||!ciphertext||extra.length) throw new Error('Unsupported learning-state token.');
  const key=await keyFrom(secret);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:encoder.encode('llm-ta-state-v1')},key,unb64(ciphertext));
  const state=JSON.parse(decoder.decode(plain));
  if(!state||![1,2].includes(state.version)||!Array.isArray(state.prerequisites)||typeof state.courseId!=='string'||typeof state.sessionId!=='string'||!Number.isInteger(state.phase)||state.phase<0||state.phase>6) throw new Error('Invalid learning-state payload.');
  return state;
}
