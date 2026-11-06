import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.env.DB_PATH ?? resolve(process.cwd(), 'data/empresa.db');
for (const f of [base, `${base}-wal`, `${base}-shm`]) rmSync(f, { force: true });
console.log('Banco apagado. Na próxima inicialização a empresa de demonstração será recriada.');
