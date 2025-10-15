import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import client from 'prom-client';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/error.js';
import { notFound } from './middlewares/notFound.js';
import { buildRoutes } from './routes/index.js';
import { logger } from './utils/logger.js';

const app = express();

// Security & parsing
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// CORS
const defaultCorsOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://flow.equussystems.co',
];

const allowedOrigins = Array.from(
  new Set([...(env.corsOrigins ?? []), ...defaultCorsOrigins]),
);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }),
);

// Logging
app.use(
  pinoHttp({
    logger,
    autoLogging: true,
  }),
);

// Metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Routes
app.use(buildRoutes(env.apiPrefix));

// 404 & errors
app.use(notFound);
app.use(errorHandler);

export { app };
