// Runs a persistent single-node MongoDB replica set for local development
// (replica set so transactions behave as they do on Atlas). Data lives in ./.data/db.
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mkdirSync } from 'fs';

const dbPath = '.data/db';
mkdirSync(dbPath, { recursive: true });

const rs = await MongoMemoryReplSet.create({
  replSet: { count: 1, name: 'rs0', storageEngine: 'wiredTiger' },
  instanceOpts: [{ port: 27017, dbPath }],
});

console.log('\nLocal MongoDB ready. Put this in .env.local:\n');
console.log(`  MONGODB_URI=${rs.getUri('crr')}\n`);
console.log('Press Ctrl+C to stop. Data is kept in .data/db between runs.');

const stop = async () => {
  await rs.stop({ doCleanup: false });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
