import { Context } from 'hono';
import { CONFIG } from '../config';
import { Env, WhatsAppWebhookPayload, Variables } from '../types';
import { normalizePhoneNumber } from '../utils/phone';
import { AuthService } from '../services/auth';
import crypto from 'node:crypto';

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
  try {
    // Verify webhook signature
    const signature = c.req.header('X-Hub-Signature-256');
    if (!signature) {
      console.log('Missing signature header');
      return c.text('Forbidden', 403);
    }

    const body = await c.req.text();
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', CONFIG.WHATSAPP.WEBHOOK_VERIFY_TOKEN)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.log('Invalid signature');
      return c.text('Forbidden', 403);
    }

    // Parse webhook payload
    const payload: WhatsAppWebhookPayload = JSON.parse(body);
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
                  
                // Handle interactive button responses (new secure flow)
                if (message.type === 'interactive' && (message as any).interactive?.type === 'button_reply') {
                  const buttonId = (message as any).interactive.button_reply.id;
                  console.log(`Received button click from ${from} with token: ${buttonId}. Normalized from: ${normalizedFrom}`);
                    
                  // Process verification token
                  await handleVerificationToken(c, services.auth, normalizedFrom, buttonId);
                }
                
                // Handle legacy button clicks (for backward compatibility)
                if (message.type === 'button' && message.button) {
                  const payload = message.button.payload;
                  console.log(`Received legacy button click from ${from} with payload: ${payload}. Normalized from: ${normalizedFrom}`);
                    
                  // Process verification token (same handler)
                  await handleVerificationToken(c, services.auth, normalizedFrom, payload);
                }
              }
            }
          }
        }
      }
        
      return c.json({ success: true });
    }
      
    return c.json({ success: false, error: 'Invalid payload' }, 400);
  } catch (error) {
    console.error('Webhook processing error:', error);
    return c.text('Internal Server Error', 500);
  }
}

async function handleVerificationToken(
  c: Context<{
    Bindings: Env;
    Variables: Variables;
  }>,
  authService: AuthService,
  phoneNumber: string,
  token: string
) {
  try {
    // Verify the token and complete authentication
    const result = await authService.verifyWebhookToken(phoneNumber, token);
    
    if (result) {
      const { userId } = result;
      console.log(`User ${userId} authenticated successfully for ${phoneNumber}`);
      
      // Log token info (first 20 chars for security)
      console.log('Tokens generated:', {
        userId: result.userId,
        accessToken: result.accessToken.substring(0, 20) + '...',
        refreshToken: result.refreshToken.substring(0, 20) + '...'
      });
      
      // TODO: Implement real-time token delivery to client
      // This could involve:
      // 1. WebSocket connection identified by session ID
      // 2. Server-Sent Events
      // 3. Storing tokens in a temporary store for client polling
      // 4. Push notification to mobile app
      
      // For now, tokens are generated and logged
      // The client application needs to implement a mechanism to receive these tokens
      
    } else {
      console.log(`Authentication failed for ${phoneNumber} with token ${token.substring(0, 10)}...`);
      
      // Note: We don't send error messages back via WhatsApp to avoid spam
      // and potential security issues. The client should handle timeout scenarios.
    }
  } catch (error) {
    console.error('Error handling verification token:', error);
  }
}
