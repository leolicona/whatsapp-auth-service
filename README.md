# WhatsApp OTPless Authentication Service

This project implements a WhatsApp OTPless login service using the WhatsApp Cloud API, Hono framework, and Cloudflare Workers with SQLite D1 database.

## Features

- OTPless authentication via WhatsApp messages
- Secure JWT-based authentication
- User profile management
- WhatsApp webhook integration

## Prerequisites

- Node.js (v14 or higher)
- npm or pnpm
- Cloudflare account
- Meta Developer account with WhatsApp Business API access

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure WhatsApp Cloud API

1. Create a Meta Developer Account at https://developers.facebook.com/
2. Create a Meta App and enable WhatsApp messaging
3. Set up a WhatsApp Business Account
4. Generate and note down your WhatsApp API token
5. Set up webhook verification and subscribe to relevant events

### 3. Create a WhatsApp Message Template

Create a WhatsApp message template in the Meta Business Manager:

1. Go to your WhatsApp Business Account in Meta Business Manager
2. Navigate to Message Templates
3. Create a new template named "login_link" with the following content:

```
Here's your login link: {{1}}

This link will expire in 15 minutes. Do not share this link with anyone.
```

### 4. Set up Cloudflare D1 Database

```bash
npx wrangler d1 create whatsapp-auth-db
```

Update the `wrangler.toml` file with your database ID.

### 5. Run Database Migrations

```bash
npx wrangler d1 execute whatsapp-auth-db --file=migrations/init.sql
```

### 6. Configure Environment Variables

Set up your secrets using wrangler:

```bash
npx wrangler secret put WHATSAPP_API_TOKEN
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
npx wrangler secret put WHATSAPP_WEBHOOK_VERIFY_TOKEN
npx wrangler secret put JWT_SECRET
```

## Development

Run the development server:

```bash
npx wrangler dev
```

## Deployment

Deploy to Cloudflare Workers:

```bash
npx wrangler deploy
```

## API Endpoints

### Authentication

- `POST /api/auth/login` - Initiate login by sending WhatsApp message
- `POST /api/auth/verify` - Verify login token and issue auth token
- `POST /api/auth/logout` - Logout (requires authentication)
- `GET /api/auth/validate` - Validate token (for client-side validation)

### User Management

- `GET /api/user/me` - Get current user profile
- `PUT /api/user/me` - Update user profile

### WhatsApp Webhook

- `GET /api/webhook` - Webhook verification endpoint
- `POST /api/webhook` - Webhook for incoming messages

## License

MIT