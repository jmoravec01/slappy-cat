// Registration proof of work, off the main thread.
import { sha256Words, zeroBits } from './pow.js';

self.onmessage = (e) => {
  const { challenge, bits } = e.data;
  for (let n = 0; ; n++) {
    if (zeroBits(sha256Words(challenge + ':' + n)) >= bits) { self.postMessage({ nonce: String(n) }); return; }
    if (n % 25000 === 0) self.postMessage({ progress: n });
  }
};
