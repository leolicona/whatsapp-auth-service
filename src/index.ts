import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { WhatsAppService } from './services/whatsapp';
import { UserService } from './services/user';
import { AuthService } from './services/auth';
import { VerificationService } from './services/verification';
import { handleInitiate, handleRefreshToken, handleLogout, handleValidate } from './routes/auth';
import { handleWebhookVerification } from './routes/webhook';
import { handleGetUserMe, handlePutUserMe } from './routes/user';
import { Env, Variables } from './types';
import { CONFIG, initializeConfig } from './config';
import { authMiddleware } from './middleware/auth';
import { WebhookProcessorDO } from './do/WebhookProcessorDO';
import { AuthSessionDO } from './do/AuthSessionDO';
import { createJsonValidator, phoneSchema } from './middleware/validation';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Initialize services and config
app.use('*', async (c, next) => {
  // Initialize config with environment variables
  initializeConfig(c.env);
  
  const whatsappService = new WhatsAppService(
    CONFIG.WHATSAPP.API_TOKEN,
    CONFIG.WHATSAPP.PHONE_NUMBER_ID
  );
  
  const userService = new UserService(c.env.DB);
  const verificationService = new VerificationService(c.env.DB);
  const authService = new AuthService(userService, whatsappService, verificationService);
  
  c.set('services', {
    whatsapp: whatsappService,
    user: userService,
    auth: authService,
    verification: verificationService
  });
  
  await next();
});

// Auth routes
app.post('/api/auth/initiate', createJsonValidator(phoneSchema), async (c) => {
  const services = c.get('services');
  const { phone_number } = c.req.valid('json');
  return handleInitiate(c, services.auth, phone_number);
});

app.post('/api/auth/refresh', async (c) => {
  const services = c.get('services');
  return handleRefreshToken(c, services.auth);
});

app.post('/api/auth/logout', async (c) => {
  const services = c.get('services');
  return handleLogout(c, services.auth);
});

app.get('/api/auth/validate', async (c) => {
  const services = c.get('services');
  return handleValidate(c, services.auth);
});

// WebSocket endpoint for authentication
app.get('/api/auth/ws', async (c) => {
  const sessionId = c.req.query('sessionId');
  if (!sessionId) {
    return c.json({
      status: 'error',
      statusCode: 400,
      error: {
        code: 'MISSING_SESSION_ID',
        message: 'Session ID is required',
        details: 'sessionId query parameter is required for WebSocket connection'
      }
    }, 400);
  }

  const id = c.env.AUTH_SESSION_DO.idFromName(sessionId);
  const stub = c.env.AUTH_SESSION_DO.get(id);

  // Forward the WebSocket request to the Durable Object
  // The DO expects the path '/websocket'
  const doUrl = new URL(c.req.url);
  doUrl.pathname = '/websocket';
  return stub.fetch(doUrl.toString(), c.req.raw);
});

// Webhook routes
app.get('/api/webhook', async (c) => {
  return handleWebhookVerification(c);
});

app.post('/api/webhook', async (c) => {
  const messageId = c.req.header('X-WhatsApp-Message-Id') || `webhook-${Date.now()}`;
  const id = c.env.WEBHOOK_PROCESSOR_DO.idFromName(messageId);
  const stub = c.env.WEBHOOK_PROCESSOR_DO.get(id);
  
  // Create a new Request object to forward to the Durable Object
  const newRequest = new Request(c.req.url, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body ? await c.req.raw.arrayBuffer() : null, // Read body as arrayBuffer
    redirect: c.req.raw.redirect,
    cf: c.req.raw.cf, // Preserve cf properties
  });
  stub.fetch(newRequest)
  //return stub.fetch(newRequest);
  // return 200
  return c.json({
    status: 'success',
    statusCode: 200,
    message: 'Webhook received successfully',
    data: {
      received: true
    }
  }, 200);
});

// User routes
app.get('/api/user/me', authMiddleware, async (c) => {
  const services = c.get('services');
  return handleGetUserMe(c, services.user);
});

app.put('/api/user/me', authMiddleware, async (c) => {
  const services = c.get('services');
  return handlePutUserMe(c, services.user);
});

// Root route
app.get('/', (c) => c.json({ status: 'WhatsApp OTPless Auth Service is running' }));

export { WebhookProcessorDO, AuthSessionDO };

export default app;