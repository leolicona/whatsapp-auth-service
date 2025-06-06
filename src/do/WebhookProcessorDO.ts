import { Env, WhatsAppWebhookPayload, Variables } from '../types';
import { AuthService } from '../services/auth';
import { UserService } from '../services/user';
import { WhatsAppService } from '../services/whatsapp';
import { normalizePhoneNumber } from '../utils/phone';

export class WebhookProcessorDO {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/api/webhook' && request.method === 'POST') {
      const payload: WhatsAppWebhookPayload = await request.json();
      return this.processWebhookPayload(payload);
    }

    return new Response('Not Found', { status: 404 });
  }

  private async processWebhookPayload(payload: WhatsAppWebhookPayload): Promise<Response> {
    // Ensure this message hasn't been processed yet
    const processed = await this.state.storage.get('processed');
    if (processed) {
      console.log('Webhook payload already processed for this DO instance.');
      return new Response('Already processed', { status: 200 });
    }

    console.log("WebhookProcessorDO payload", payload);  
    // Process incoming messages
    if (payload.object === 'whatsapp_business_account') {
      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            const value = change.value;
              
            // Process incoming messages
            if (value.messages && value.messages.length > 0) {
              for (const message of value.messages) {
                const from = message.from;
                const normalizedFrom = normalizePhoneNumber(from);

                // Handle text messages
                if (message.type === 'text' && message.text) {
                  const text = message.text.body;
                  console.log(`Received message from ${from}: ${text}. Normalized to: ${normalizedFrom}`);
                    
                  // Auto-reply to incoming messages
                  const whatsappService = new WhatsAppService(this.env.WHATSAPP_API_TOKEN, this.env.WHATSAPP_PHONE_NUMBER_ID);
                  await whatsappService.sendTextMessage(
                    normalizedFrom,
                    'Thank you for your message. This is an automated login service. Please use the app to initiate login.'
                  );
                }
                  
                // Handle button clicks
                if (message.type === 'button' && message.button) {
                  const buttonPayload = message.button.payload;
                  console.log(`Received button click from ${from} with payload: ${buttonPayload}. Normalized from: ${normalizedFrom}`);

                  const whatsappService = new WhatsAppService(this.env.WHATSAPP_API_TOKEN, this.env.WHATSAPP_PHONE_NUMBER_ID);
                  const userService = new UserService(this.env.DB);
                  const authService = new AuthService(userService, whatsappService);

                  await this.handleAuthButtonPayload(
                    authService,
                    whatsappService,
                    normalizedFrom,
                    buttonPayload
                  );
                }
              }
            }
          }
        }
      }
        
      await this.state.storage.put('processed', true);
      return new Response('Processed', { status: 200 });
    }
      
    return new Response('Invalid payload', { status: 400 });
  }

  private async handleAuthButtonPayload(
    authService: AuthService,
    whatsappService: WhatsAppService,
    phoneNumber: string,
    token: string
  ) {
    const result = await authService.verifyLogin(token);
  
    if (result) {
      const { authToken, refreshToken, userId } = result;
      console.log(`User ${userId} authenticated. AuthToken: ${authToken}, RefreshToken: ${refreshToken}`);
      
      // Instead of storing in DO, we will update the session in the DB for polling
      // If using WebSockets, this is where you'd push to the WebSocket connected to AuthSessionDO
      // const userSession = await authService.getUserService().findSessionByUserId(userId); // Need to get the current session ID

      // Find the sessionId from the loginToken payload (this was added in AuthService.initiateLogin)
      const loginTokenPayload = await authService.verifyLoginTokenOnly(token); // Need a new method to just verify token without full login flow

      if (loginTokenPayload && loginTokenPayload.sessionId) {
        const sessionId = loginTokenPayload.sessionId;
        const id = this.env.AUTH_SESSION_DO.idFromString(sessionId);
        const stub = this.env.AUTH_SESSION_DO.get(id);
        
        // Call the DO to send tokens over WebSocket
        await stub.fetch(
          new Request(new URL('/send-tokens', 'http://do-stub').toString(), {
            method: 'POST',
            body: JSON.stringify({ authToken, refreshToken, userId }),
            headers: { 'Content-Type': 'application/json' },
          })
        );
        console.log(`Tokens sent to AuthSessionDO for session ${sessionId}.`);
      } else {
        console.error('Session ID not found in login token payload.');
        // This indicates a potential issue in the flow where session ID is not included in token
      }

    } else {
      console.log(`Failed to verify token for phone number: ${phoneNumber}`);
      await whatsappService.sendTextMessage(
        phoneNumber,
        'Authentication failed. Please try again.'
      );
    }
  }
}
