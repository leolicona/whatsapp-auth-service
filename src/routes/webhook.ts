import { Hono, Context } from 'hono';
import { WhatsAppService } from '../services/whatsapp';
import { CONFIG } from '../config';
import { Env, WhatsAppWebhookPayload, Variables } from '../types';
import { normalizePhoneNumber } from '../utils/phone';
import { AuthService } from '../services/auth';

export function handleWebhookVerification(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>) {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  console.log("token", CONFIG.WHATSAPP.WEBHOOK_VERIFY_TOKEN);

  if (mode === 'subscribe' && token === CONFIG.WHATSAPP.WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified successfully');
    return c.text(challenge || '');
  } else {
    console.error('Webhook verification failed');
    return c.text('Verification failed', 403);
  }
}

export async function handleIncomingWebhookMessage(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, services: Variables['services']) {
  const payload = await c.req.json<WhatsAppWebhookPayload>();
  console.log("payload", payload);  
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
                await services.whatsapp.sendTextMessage(
                  normalizedFrom,
                  'Thank you for your message. This is an automated login service. Please use the app to initiate login.'
                );
              }
                
              // Handle button clicks
              if (message.type === 'button' && message.button) {
                const payload = message.button.payload;
                console.log(`Received button click from ${from} with payload: ${payload}. Normalized from: ${normalizedFrom}`);
                  
                // Process button actions if needed
                await handleAuthButtonPayload(c, services.auth, services.whatsapp, normalizedFrom, payload);
              }
            }
          }
        }
      }
    }
      
    return c.json({ success: true });
  }
    
  return c.json({ success: false, error: 'Invalid payload' }, 400);
}

async function handleAuthButtonPayload(
  c: Context<{
    Bindings: Env;
    Variables: Variables;
  }>,
  authService: AuthService,
  whatsappService: WhatsAppService,
  phoneNumber: string,
  token: string
) {
  const result = await authService.verifyLogin(token);

  if (result) {
    const { authToken, refreshToken, userId } = result;
    console.log(`User ${userId} authenticated. AuthToken: ${authToken}, RefreshToken: ${refreshToken}`);
    
    // Update the session with the new tokens and set status to 'ready'
    const sessionId = c.get('authInfo')?.sessionId; // Assuming session ID is available in authInfo after verifyLogin creates a session
    if (sessionId) {
      await authService.getUserService().updateSessionTokens(sessionId, authToken, refreshToken);
      console.log(`Session ${sessionId} updated with tokens.`);
    } else {
      console.error('Session ID not found after successful login verification.');
      // This indicates a potential issue in the flow where session is not created or available
    }

  } else {
    console.log(`Failed to verify token for phone number: ${phoneNumber}`);
    // Optionally send a message back to the user via WhatsApp if verification fails
    await whatsappService.sendTextMessage(
      phoneNumber,
      'Authentication failed. Please try again.'
    );
  }
}
