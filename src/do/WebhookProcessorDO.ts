import { Env, WhatsAppWebhookPayload } from '../types';
import { AuthService } from '../services/auth';
import { UserService } from '../services/user';
import { WhatsAppService } from '../services/whatsapp';
import { VerificationService } from '../services/verification';
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
    console.log('[WebhookProcessor] Processing webhook payload');
    
    const processed = await this.state.storage.get('processed');
    if (processed) {
      console.log('[WebhookProcessor] Webhook payload already processed for this DO instance.');
      return new Response('Already processed', { status: 200 });
    }

    console.log('[WebhookProcessor] Webhook payload:', JSON.stringify(payload, null, 2));  
    
    // Process incoming messages
    if (payload.object === 'whatsapp_business_account') {
      console.log(`[WebhookProcessor] Processing WhatsApp business account payload with ${payload.entry.length} entries`);
      
      for (const entry of payload.entry) {
        console.log(`[WebhookProcessor] Processing entry with ${entry.changes.length} changes`);
        
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            const value = change.value;
            console.log(`[WebhookProcessor] Processing messages field:`, value);
              
            // Process incoming messages
            if (value.messages && value.messages.length > 0) {
              console.log(`[WebhookProcessor] Found ${value.messages.length} messages to process`);
              
              for (const message of value.messages) {
                const from = message.from;
                const normalizedFrom = normalizePhoneNumber(from);
                
                console.log(`[WebhookProcessor] Processing message from ${from} (normalized: ${normalizedFrom}), type: ${message.type}`);

                // Handle text messages
                if (message.type === 'text' && message.text) {
                  const text = message.text.body;
                  console.log(`[WebhookProcessor] Received text message from ${from}: ${text}`);
                    
                  // Auto-reply to incoming messages
                  const whatsappService = new WhatsAppService(this.env.WHATSAPP_API_TOKEN, this.env.WHATSAPP_PHONE_NUMBER_ID);
                  await whatsappService.sendTextMessage(
                    normalizedFrom,
                    'Thank you for your message. This is an automated login service. Please use the app to initiate login.'
                  );
                  console.log(`[WebhookProcessor] Sent auto-reply to ${normalizedFrom}`);
                }
                  
                // Handle interactive messages (button clicks)
                if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
                  const buttonPayload = message.interactive.button_reply.id;
                  console.log(`[WebhookProcessor] Received button click from ${from} with payload length: ${buttonPayload.length}`);
                  console.log(`[WebhookProcessor] Button payload preview: ${buttonPayload.substring(0, 100)}...`);

                  const whatsappService = new WhatsAppService(this.env.WHATSAPP_API_TOKEN, this.env.WHATSAPP_PHONE_NUMBER_ID);
                  const userService = new UserService(this.env.DB);
                  const verificationService = new VerificationService(this.env.DB);
                  const authService = new AuthService(userService, whatsappService, verificationService);
                  console.log(`[WebhookProcessor] AuthService instance created`);
                  await this.handleAuthButtonPayload(
                    authService,
                    whatsappService,
                    normalizedFrom,
                    buttonPayload
                  );
                  console.log(`[WebhookProcessor] Auth button payload processed`);
                }
              }
            } else {
              console.log(`[WebhookProcessor] No messages found in this change`);
            }
          } else {
            console.log(`[WebhookProcessor] Skipping change with field: ${change.field}`);
          }
        }
      }
    } else {
      console.log(`[WebhookProcessor] Unexpected payload object type: ${payload.object}`);
    }
        
    await this.state.storage.put('processed', true);
    return new Response('Processed', { status: 200 });
  }

  private async handleAuthButtonPayload(
    authService: AuthService,
    whatsappService: WhatsAppService,
    phoneNumber: string,
    token: string
  ) {
    console.log(`[WebhookProcessor] Handling auth button payload for phone: ${phoneNumber}, token length: ${token.length}`);
    
    const result = await authService.verifyLogin(token);
  
    if (result) {
      const { authToken, refreshToken, userId } = result;
      console.log(`[WebhookProcessor] User ${userId} authenticated successfully`);
      console.log(`[WebhookProcessor] AuthToken length: ${authToken.length}, RefreshToken length: ${refreshToken.length}`);
      
      // Instead of storing in DO, we will update the session in the DB for polling
      // If using WebSockets, this is where you'd push to the WebSocket connected to AuthSessionDO
      // const userSession = await authService.getUserService().findSessionByUserId(userId); // Need to get the current session ID

      // Find the sessionId from the loginToken payload (this was added in AuthService.initiateLogin)
      console.log(`[WebhookProcessor] Verifying login token to extract session info`);
      const loginTokenPayload = await authService.verifyLoginTokenOnly(token); // Need a new method to just verify token without full login flow
      console.log(`[WebhookProcessor] Login token payload:`, loginTokenPayload);
      if (loginTokenPayload && loginTokenPayload.sessionId) {
        console.log(`[WebhookProcessor] Found sessionId: ${loginTokenPayload.sessionId}`);
        const sessionId = loginTokenPayload.sessionId;
        // Convert sessionId to a valid 64-character hex string for Durable Object ID
        // We'll use the sessionId as a name to generate a consistent Durable Object ID
        const id = this.env.AUTH_SESSION_DO.idFromName(sessionId);
        const stub = this.env.AUTH_SESSION_DO.get(id);
        
        console.log(`[WebhookProcessor] Sending tokens to AuthSessionDO`);
        // Call the DO to send tokens over WebSocket
        await stub.fetch(
          new Request(new URL('/send-tokens', 'http://do-stub').toString(), {
            method: 'POST',
            body: JSON.stringify({ authToken, refreshToken, userId }),
            headers: { 'Content-Type': 'application/json' }
          })
        );
        console.log(`[WebhookProcessor] Tokens sent to AuthSessionDO successfully`);
      } else {
        console.log(`[WebhookProcessor] No sessionId found in token payload, skipping WebSocket notification`);
      }
    } else {
      console.log(`[WebhookProcessor] Authentication failed for phone: ${phoneNumber}`);
      // Handle authentication failure
      await whatsappService.sendTextMessage(
        phoneNumber,
        'Authentication failed. Please try again or contact support if the issue persists.'
      );
    }
  }
}
