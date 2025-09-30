import { app } from './app.js';
import { env } from './config/env.js';
import { connectMongo } from './db/mongo.js';
import { logger } from './utils/logger.js';

const buildApiUrl = (base: string, prefix: string): string => {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`;
  return `${normalizedBase}${normalizedPrefix}`;
};

async function main(): Promise<void> {
  await connectMongo();

  const deploymentUrl =
    process.env.RENDER_EXTERNAL_URL ??
    process.env.APP_URL ??
    `http://localhost:${env.port}`;

  app.listen(env.port, () => {
    logger.info(
      {
        port: env.port,
        basePath: env.apiPrefix,
        url: buildApiUrl(deploymentUrl, env.apiPrefix),
      },
      'Server started'
    );
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});