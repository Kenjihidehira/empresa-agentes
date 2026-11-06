import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({ titulo, onFechar, children, lateral }: { titulo: string; onFechar: () => void; children: ReactNode; lateral?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const primeiro = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.fechar)');
    (primeiro ?? ref.current)?.focus();
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', f);
    return () => {
      window.removeEventListener('keydown', f);
      anterior?.focus?.();
    };
  }, [onFechar]);
  return (
    <div className={`fundo-modal ${lateral ? 'lateral' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" role="dialog" aria-modal={!lateral} aria-label={titulo} ref={ref} tabIndex={-1}>
        <header className="modal-topo">
          <h2>{titulo}</h2>
          <button className="fechar" onClick={onFechar} aria-label="Fechar">
            ✕
          </button>
        </header>
        <div className="modal-corpo">{children}</div>
      </div>
    </div>
  );
}
