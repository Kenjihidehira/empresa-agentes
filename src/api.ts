import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot, StatusMotor } from '../shared/types';

export class ErroApi extends Error {
  constructor(message: string, public status: number, public dados?: any) {
    super(message);
  }
}

export async function api<T = any>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(caminho, {
      method: metodo,
      headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroApi('Sem conexão com o servidor. Ele está rodando (npm run dev)?', 0);
  }
  const dados = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 422) throw new ErroApi(dados.erro ?? `Erro ${r.status}`, r.status, dados);
  return dados as T;
}

/** Estado completo da empresa, atualizado em tempo real via Server-Sent Events. */
export function useEmpresa() {
  const [dados, setDados] = useState<Snapshot | null>(null);
  const [motor, setMotor] = useState<StatusMotor | null>(null);
  const [conectado, setConectado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const emVoo = useRef(false);
  const deNovo = useRef(false);

  const recarregar = useCallback(async () => {
    if (emVoo.current) {
      deNovo.current = true;
      return;
    }
    emVoo.current = true;
    try {
      setDados(await api<Snapshot>('GET', '/api/estado'));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      emVoo.current = false;
      if (deNovo.current) {
        deNovo.current = false;
        recarregar();
      }
    }
  }, []);

  useEffect(() => {
    recarregar();
    api<StatusMotor>('GET', '/api/motor').then(setMotor).catch(() => {});
    const es = new EventSource('/api/stream');
    es.addEventListener('mudanca', () => recarregar());
    es.onopen = () => {
      setConectado(true);
      recarregar();
    };
    es.onerror = () => setConectado(false);
    return () => es.close();
  }, [recarregar]);

  return { dados, motor, conectado, erro, recarregar };
}

export const moeda = (n: number) => `US$ ${n.toFixed(2)}`;
export const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export function useMedia(query: string) {
  const [ok, setOk] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const f = () => setOk(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [query]);
  return ok;
}
