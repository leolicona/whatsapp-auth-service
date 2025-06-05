import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { WhatsAppService } from './services/whatsapp';
import { UserService } from './services/user';
import { AuthService } from './services/auth';
import { handleLogin, handleVerify, handleLogout, handleValidate } from './routes/auth';
import { handleWebhookVerification, handleIncomingWebhookMessage } from './routes/webhook';
import { handleGetUserMe, handlePutUserMe } from './routes/user';
import { Env, Variables } from './types';
import { CONFIG, initializeConfig } from './config';
import { authMiddleware } from './middleware/auth';

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
  const authService = new AuthService(userService, whatsappService);
  
  c.set('services', {
    whatsapp: whatsappService,
    user: userService,
    auth: authService
  });
  
  await next();
});

// Auth routes
app.post('/api/auth/login', async (c) => {
  const services = c.get('services');
  return handleLogin(c, services.auth);
});

app.post('/api/auth/verify', async (c) => {
  const services = c.get('services');
  return handleVerify(c, services.auth);
});

app.post('/api/auth/logout', authMiddleware, async (c) => {
  const services = c.get('services');
  return handleLogout(c);
});

app.get('/api/auth/validate', authMiddleware, async (c) => {
  const services = c.get('services');
  return handleValidate(c);
});

// Webhook routes
app.get('/api/webhook', async (c) => {
  return handleWebhookVerification(c);
});

app.post('/api/webhook', async (c) => {
  const services = c.get('services');
  return handleIncomingWebhookMessage(c, services.whatsapp);
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

export default app;