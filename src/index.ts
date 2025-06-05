import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { WhatsAppService } from './services/whatsapp';
import { UserService } from './services/user';
import { AuthService } from './services/auth';
import { createAuthRoutes } from './routes/auth';
import { createWebhookRoutes } from './routes/webhook';
import { createUserRoutes } from './routes/user';
import { Env } from './types';
import { CONFIG, initializeConfig } from './config';

type Variables = {
  services: {
    whatsapp: WhatsAppService;
    user: UserService;
    auth: AuthService;
  }
};

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
  const authApp = createAuthRoutes(services.auth);
  return authApp.fetch(c.req.raw, c.env);
});

app.post('/api/auth/verify', async (c) => {
  const services = c.get('services');
  const authApp = createAuthRoutes(services.auth);
  return authApp.fetch(c.req.raw, c.env);
});

app.post('/api/auth/logout', async (c) => {
  const services = c.get('services');
  const authApp = createAuthRoutes(services.auth);
  return authApp.fetch(c.req.raw, c.env);
});

app.get('/api/auth/validate', async (c) => {
  const services = c.get('services');
  const authApp = createAuthRoutes(services.auth);
  return authApp.fetch(c.req.raw, c.env);
});

// Webhook routes
app.get('/api/webhook', async (c) => {
  const services = c.get('services');
  console.log("token", CONFIG.WHATSAPP.WEBHOOK_VERIFY_TOKEN)
  const webhookApp = createWebhookRoutes(services.whatsapp);
  //return webhookApp.fetch(c.req.raw, c.env);
  //console.log('GET /api/webhook', services.auth);
  return c.json({ status: 'WhatsApp OTPless Auth Service is running' });
});

app.post('/api/webhook', async (c) => {
  const services = c.get('services');
  const webhookApp = createWebhookRoutes(services.whatsapp);
  return webhookApp.fetch(c.req.raw, c.env);
});

// User routes
app.get('/api/user/me', async (c) => {
  const services = c.get('services');
  const userApp = createUserRoutes(services.user, services.auth);
  return userApp.fetch(c.req.raw, c.env);
});

app.put('/api/user/me', async (c) => {
  const services = c.get('services');
  const userApp = createUserRoutes(services.user, services.auth);
  return userApp.fetch(c.req.raw, c.env);
});

// Root route
app.get('/', (c) => c.json({ status: 'WhatsApp OTPless Auth Service is running' }));

export default app;