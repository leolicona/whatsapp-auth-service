import { Env } from '../types';

interface SendTokensPayload {
  authToken: string;
  refreshToken: string;
  userId: string;
}

export class AuthSessionDO {
  state: DurableObjectState;
  env: Env;
  sessions: WebSocket[];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = [];
  }

  // Handle HTTP requests to the Durable Object
  async fetch(request: Request) {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/websocket':
        if (request.headers.get('Upgrade') !== 'websocket') {
          return new Response('Expected WebSocket', { status: 400 });
        }

        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];

        this.state.acceptWebSocket(server);
        this.sessions.push(server);

        server.addEventListener('close', () => {
          this.sessions = this.sessions.filter(s => s !== server);
          console.log('WebSocket closed');
        });

        server.addEventListener('error', (event: Event) => {
          console.error('WebSocket error:', event);
        });

        return new Response(null, { status: 101, webSocket: client });

      case '/send-tokens':
        if (request.method !== 'POST') {
          return new Response('Method Not Allowed', { status: 405 });
        }
        const { authToken, refreshToken, userId } = await request.json<SendTokensPayload>();
        this.sendTokensToClient(authToken, refreshToken, userId);
        return new Response('Tokens sent', { status: 200 });

      default:
        return new Response('Not Found', { status: 404 });
    }
  }

  // Method to send tokens to connected WebSocket clients
  sendTokensToClient(authToken: string, refreshToken: string, userId: string) {
    const message = JSON.stringify({ event: 'auth_success', authToken, refreshToken, userId });
    this.sessions.forEach(ws => {
      try {
        if (ws.readyState === ws.OPEN) {
          ws.send(message);
        } else {
          console.log('WebSocket not open, removing from sessions');
          this.sessions = this.sessions.filter(s => s !== ws);
        }
      } catch (e) {
        console.error('Error sending to WebSocket:', e);
        this.sessions = this.sessions.filter(s => s !== ws);
      }
    });
  }
}
