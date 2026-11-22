import { startServer } from './server';

const port = Number(process.env.PORT ?? 8787);
const { port: actual } = await startServer(port);
console.log(
  `DemoDogs lobby server on http://localhost:${actual} (the dev client reaches it via /signal)`,
);
