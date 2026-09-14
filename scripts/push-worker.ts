import 'dotenv/config';
import { connectDatabase } from '../server/db/connect.js';
import { processPushJobs, pushConfig } from '../server/services/pushService.js';

if (!pushConfig()) throw new Error('Configure PUSH_VAPID_PUBLIC_KEY, PUSH_VAPID_PRIVATE_KEY e PUSH_VAPID_SUBJECT.');
await connectDatabase();
while (true) {
  try { await processPushJobs(); } catch { console.error('Falha temporaria no worker push; nova tentativa em 15 segundos.'); }
  await new Promise((resolve) => setTimeout(resolve, 15000));
}
