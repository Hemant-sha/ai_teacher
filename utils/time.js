import { broadcast } from '../webSocket.js';

export async function getTime() {
  broadcast({
    type: 'show-time',
    time: new Date().toLocaleTimeString()
  });
  return new Date().toLocaleTimeString();
}