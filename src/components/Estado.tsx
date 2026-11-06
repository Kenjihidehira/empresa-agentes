import { ESTADO_TAREFA_LABEL, type EstadoTarefa } from '../../shared/types';

export function EstadoTarefaTag({ estado }: { estado: EstadoTarefa }) {
  return <span className={`tag t-${estado}`}>{ESTADO_TAREFA_LABEL[estado]}</span>;
}
