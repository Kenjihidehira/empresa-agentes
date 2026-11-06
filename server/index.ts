import { criarApp } from './app';
import { recuperarAposReinicio } from './motor';
import { semearSeVazio } from './seed';

process.removeAllListeners('warning'); // silencia o aviso "SQLite is experimental" do Node 22

const PORTA = Number(process.env.PORT ?? 3001);
if (semearSeVazio()) console.log('Banco novo: empresa de demonstração criada.');
recuperarAposReinicio();

criarApp().listen(PORTA, () => {
  const web = process.env.NODE_ENV === 'production' ? `http://localhost:${PORTA}` : 'http://localhost:5173';
  console.log(`API em http://localhost:${PORTA}/api  ·  abra ${web}`);
});
