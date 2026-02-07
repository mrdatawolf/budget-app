import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// Import route modules (to be created)
// import budgets from './routes/budgets';
// import transactions from './routes/transactions';
// etc.

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}));

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes will be mounted here
// app.route('/api/budgets', budgets);
// app.route('/api/transactions', transactions);
// etc.

// Placeholder for now - routes will be migrated from Next.js
app.get('/api/*', (c) => {
  return c.json({
    error: 'Route not yet migrated',
    message: 'This API server is being set up. Routes will be migrated from Next.js.'
  }, 501);
});

// Start the server
const port = parseInt(process.env.PORT || '3001', 10);

console.log(`Starting Budget API server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`Budget API server running at http://localhost:${info.port}`);
});

export default app;
