// websocket.js
import { WebSocketServer } from 'ws'; // ESM syntax

let wss;

function initWebSocket(server) {
  wss = new WebSocketServer({ server }); 
  
  wss.on('connection', (ws) => {
    console.log('🔌 New WebSocket connection');

    ws.on('message', (message) => {
      console.log('📩 Received:', message.toString());
    });

    ws.on('close', () => {
      console.log('❌ WebSocket connection closed');
    });
  });
}

function broadcast(data) {
  if (!wss) return;
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN === 1
      client.send(payload);
    }
  });
}

export { initWebSocket, broadcast };
