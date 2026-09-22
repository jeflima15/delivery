import 'dotenv/config';
import { connectDatabase } from '../server/db/connect.js';
import { processCatalogImportJobs } from '../server/services/catalogImportJobService.js';

await connectDatabase();
while (true) {
  try { await processCatalogImportJobs(2); } catch { console.error('Falha temporária no worker de importação; nova tentativa em 15 segundos.'); }
  await new Promise((resolve) => setTimeout(resolve, 15_000));
}
