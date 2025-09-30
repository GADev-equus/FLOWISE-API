import { app } from './app.js';
import { env } from './config/env.js';
import { connectMongo } from './db/mongo.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  await connectMongo();

  app.listen(env.port, () => {
    logger.info({ port: env.port, basePath: env.apiPrefix }, 'Server started');
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
