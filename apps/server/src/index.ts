import { startAblePathServer } from './app.js';

const server = await startAblePathServer();

console.log(`AblePath server listening on http://localhost:${server.port}`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
