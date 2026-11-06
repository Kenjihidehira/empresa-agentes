// Personagens chibi em pixel art (12 px de largura): cabeça grande, corpo pequeno.
// Cada agente ganha cabelo, acessórios e roupa próprios, derivados do id e do setor.
//
// Letras: H cabelo · S pele · E olho · X brilho · R bochecha · M boca · G óculos · K preto (headset/sapato)
//         A roupa principal · B detalhe da roupa · J paletó · W camisa · T gravata · P calça

export const LARGURA_SPRITE = 12;

const ROSTO = [
  '............',
  '............',
  '..SSSSSSSS..',
  '.SSSSSSSSSS.',
  'SSSSSSSSSSSS',
  'SSEESSSSEESS',
  'SSEXSSSSEXSS',
  'SRSSSSSSSSRS',
  '.SSSSMMSSSS.',
  '..SSSSSSSS..',
];

// Penteados: sobrepostos ao rosto ('.' mantém o que estiver embaixo). Linhas além da 9 caem sobre o corpo.
const CABELOS: Record<string, { frente: string[]; costas?: string[] }> = {
  curto: { frente: ['..HHHHHHHH..', '.HHHHHHHHHH.', 'HHHHHHHHHHHH', 'HHHHHHHHHHHH', 'HH........HH', 'H..........H'] },
  espetado: { frente: ['H..H..H..H..', 'HHHHHHHHHHH.', 'HHHHHHHHHHHH', 'HHHHHHHHHHHH', 'H.HH....HH.H'] },
  coque: { frente: ['....HHHH....', '..HHHHHHHH..', '.HHHHHHHHHH.', 'HHHHHHHHHHHH', 'HH........HH', 'H..........H'] },
  franja: {
    frente: ['..HHHHHHHH..', '.HHHHHHHHHH.', 'HHHHHHHHHHHH', 'HHHHHHHHHHHH', 'HHHHHHHHHHHH', 'HH........HH', 'HH........HH', 'HH........HH', 'HH........HH', '.H........H.'],
  },
  longo: {
    frente: [
      '..HHHHHHHH..', '.HHHHHHHHHH.', 'HHHHHHHHHHHH', 'HHHHHHHHHHHH', 'HHH......HHH', 'HH........HH',
      'HH........HH', 'HH........HH', 'HH........HH', 'HHH......HHH', 'HH........HH', 'H..........H',
    ],
    costas: ['............', '............', '............', '............', '............', '............', '............', '............', '............', '............', '.HHHHHHHHHH.', '..HHHHHHHH..'],
  },
  rabo: {
    frente: ['..HHHHHHHH..', '.HHHHHHHHHHH', 'HHHHHHHHHHHH', 'HHHHHHHHHHHH', 'HH........HH', 'H.........HH', '..........HH', '...........H'],
    costas: ['............', '............', '............', '............', '............', '............', '............', '............', '............', '.....HH.....', '.....HH.....', '......H.....'],
  },
  careca: { frente: ['............', '...SSSSSS...', '.SSSSSSSSSS.', 'SSSXSSSSSSSS', 'H..........H', 'H..........H'] },
};
const ESTILOS = Object.keys(CABELOS);

const OCULOS = ['', '', '', '', '.GGGG..GGGG.', '.G..GGGG..G.', '.G..G..G..G.'];
const BARBA = ['', '', '', '', '', '', '', '', '.HHHH..HHHH.', '..HHHHHHHH..'];
const HEADSET = ['..KKKKKKKK..', '.K........K.', '', '', '', 'K..........K', 'K..........K', 'K..........K', '.KKK........'];

const ROUPAS: Record<string, { frente: string[]; corCostas: string; capuz?: boolean }> = {
  terno: { frente: ['...JWTTWJ...', '..JJWTTWJJ..', '.JJJWTTWJJJ.', '.JJJJTTJJJJ.', '.SJJJJJJJJS.', '..JJJJJJJJ..'], corCostas: 'J' },
  moletom: { frente: ['..BAAAAAAB..', '.AAAWAAWAAA.', '.AAAWAAWAAA.', '.AAAAAAAAAA.', '.SABBBBBBAS.', '..AAAAAAAA..'], corCostas: 'A', capuz: true },
  camisa: { frente: ['...WWAAWW...', '..AAAABAAA..', '.AAAAABAAAA.', '.AAAAABAAAA.', '.SAAAABAAAS.', '..PPPPPPPP..'], corCostas: 'A' },
  colete: { frente: ['...WWWWWW...', '..AWWWWWWA..', '.WAAWWWWAAW.', '.WAAAWWAAAW.', '.SAAAAAAAAS.', '..AAAAAAAA..'], corCostas: 'A' },
  polo: { frente: ['...WAAAAW...', '..AAAWWAAA..', '.AAAAAAAAAA.', '.AAAAAAAAAA.', '.SAAAAAAAAS.', '..AAAAAAAA..'], corCostas: 'A' },
  jaqueta: { frente: ['...ABBBBA...', '..AABBBBAA..', '.AAABBBBAAA.', '.AAABBBBAAA.', '.SAABBBBAAS.', '..AAAAAAAA..'], corCostas: 'A' },
};
const ROUPA_POR_SETOR: Record<string, string> = {
  diretoria: 'terno',
  produto: 'camisa',
  design: 'polo',
  frontend: 'moletom',
  backend: 'moletom',
  dados: 'moletom',
  mobile: 'moletom',
  qa: 'colete',
  devops: 'jaqueta',
  suporte: 'polo',
};

const PERNAS_A = ['...PPPPPP...', '...PP..PP...', '...KK..KK...'];
const PERNAS_B = ['...PPPPPP...', '..PP....PP..', '..KK....KK..'];

const CORES_CABELO = ['#2a1f17', '#4a3020', '#7a4a26', '#b7791f', '#e8c07a', '#a3341b', '#5b6472', '#141a26', '#d4567f', '#4f6bd8'];
const CORES_PELE = ['#f6d3b3', '#e7b98a', '#cf9461', '#a5693f', '#6e452a', '#ffe0c2'];
const CORES_CALCA = ['#2f4b7c', '#24262c', '#6f6449', '#3b4252'];

export const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function escurecer(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) * f);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

export type Pose = 'frente' | 'frenteB' | 'costas' | 'costasB' | 'sentadoFrente' | 'sentadoCostas';
export interface SpritePronto {
  mapa: string[];
  cores: Record<string, string>;
}

function sobrepor(base: string[], camada: string[], inicio = 0) {
  camada.forEach((linha, i) => {
    if (!linha) return;
    const y = inicio + i;
    const atual = (base[y] ?? '.'.repeat(LARGURA_SPRITE)).split('');
    [...linha].forEach((ch, x) => {
      if (ch !== '.') atual[x] = ch;
    });
    base[y] = atual.join('');
  });
}

function clarear(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) + (255 - ((n >> s) & 255)) * f);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

const cache = new Map<string, SpritePronto>();

/** Monta (com cache) o chibi de um agente numa pose. `setor` é o id do departamento (sem prefixo de pacote). */
export function chibi(id: string, setor: string, corSetor: string, pose: Pose): SpritePronto {
  const chave = `${id}|${setor}|${corSetor}|${pose}`;
  const pronto = cache.get(chave);
  if (pronto) return pronto;

  const h = hash(id);
  const estilo = ESTILOS[h % ESTILOS.length]!;
  const cabelo = CABELOS[estilo]!;
  const setorBase = setor.split(':').pop()!;
  const roupaNome = ROUPA_POR_SETOR[setorBase] ?? ['moletom', 'camisa', 'polo'][(h >> 5) % 3]!;
  const roupa = ROUPAS[roupaNome]!;
  const oculos = (h >> 7) % 10 < 3;
  const barba = !oculos && ['curto', 'espetado', 'careca'].includes(estilo) && (h >> 9) % 3 === 0;
  const headset = setorBase === 'suporte';
  const costas = pose.startsWith('costas') || pose === 'sentadoCostas';
  const sentado = pose.startsWith('sentado');

  const mapa: string[] = [];
  if (costas) {
    // Silhueta da cabeça preenchida de cabelo (ou pele, se careca).
    const silhueta = [...ROSTO];
    sobrepor(silhueta, cabelo.frente.slice(0, 10));
    const preenchimento = estilo === 'careca' ? 'S' : 'H';
    silhueta.forEach((l) => mapa.push(l.replace(/[^.]/g, preenchimento)));
    if (estilo === 'careca') sobrepor(mapa, ['', '', '...XX.......', '..X.........', 'H..........H', 'H..........H']);
    else {
      // Brilho no alto, sombra na nuca e mechas, para a cabeça não virar um bloco liso.
      sobrepor(mapa, ['', '...LLL......', '..LL....L...', '..L.....LL..', '', '', '....D..D....', '', '.DDDDDDDDDD.', '..DDDDDDDD..']);
      if (['curto', 'espetado', 'coque', 'rabo'].includes(estilo)) sobrepor(mapa, ['', '', '', '', '', 'S..........S', 'S..........S']);
    }
    if (headset) sobrepor(mapa, ['..KKKKKKKK..', '.K........K.', '', '', '', 'K..........K', 'K..........K', 'K..........K']);
    const corpoMain = roupa.corCostas;
    const linha = (s: string) => s.replace(/X/g, corpoMain);
    mapa.push(linha(roupa.capuz ? '..BBBBBBBB..' : '..XXXXXXXX..'));
    for (let i = 0; i < 3; i++) mapa.push(linha('.XXXXXXXXXX.'));
    mapa.push(linha('.SXXXXXXXXS.'), linha('..XXXXXXXX..'));
    if (cabelo.costas) sobrepor(mapa, cabelo.costas);
  } else {
    mapa.push(...ROSTO);
    sobrepor(mapa, cabelo.frente.slice(0, 10));
    if (estilo !== 'careca') {
      // Brilho no cabelo, só onde já é cabelo.
      ['...LL.......', '..L.........'].forEach((l, i) => {
        const y = i + 1;
        mapa[y] = [...mapa[y]!].map((ch, x) => (l[x] === 'L' && ch === 'H' ? 'L' : ch)).join('');
      });
    }
    if (oculos) sobrepor(mapa, OCULOS);
    if (barba) sobrepor(mapa, BARBA);
    if (headset) sobrepor(mapa, HEADSET);
    mapa.push(...roupa.frente);
    // Cabelo longo cai sobre os ombros.
    if (cabelo.frente.length > 10) sobrepor(mapa, cabelo.frente.slice(10), 10);
  }
  if (!sentado) mapa.push(...(pose.endsWith('B') ? PERNAS_B : PERNAS_A));

  const jaqueta = roupaNome === 'jaqueta';
  const corCabelo = CORES_CABELO[(h >> 3) % CORES_CABELO.length]!;
  const cores: Record<string, string> = {
    H: corCabelo,
    L: clarear(corCabelo, 0.35),
    D: escurecer(corCabelo, 0.7),
    S: CORES_PELE[(h >> 11) % CORES_PELE.length]!,
    E: '#1a1a22',
    X: '#ffffff',
    R: '#f29b9b',
    M: '#8a3535',
    G: '#15151a',
    K: '#16161b',
    A: jaqueta ? '#3a3f4a' : corSetor,
    B: jaqueta ? corSetor : escurecer(corSetor, 0.72),
    J: '#2b3140',
    W: '#f1f5f9',
    T: corSetor,
    P: CORES_CALCA[(h >> 13) % CORES_CALCA.length]!,
  };
  const sprite = { mapa, cores };
  cache.set(chave, sprite);
  return sprite;
}

/** Desenha o sprite ancorado pelo centro da base (px, py), com contorno escuro. */
export function desenharSprite(
  ctx: CanvasRenderingContext2D,
  { mapa, cores }: SpritePronto,
  px: number,
  py: number,
  opts: { maosAcima?: boolean; escala?: number } = {},
) {
  const e = opts.escala ?? 2;
  const x0 = Math.round(px - (LARGURA_SPRITE * e) / 2);
  const y0 = Math.round(py - mapa.length * e);
  const cheio = (x: number, y: number) => {
    const ch = mapa[y]?.[x];
    return ch !== undefined && ch !== '.';
  };
  ctx.fillStyle = 'rgba(12,14,20,0.9)';
  for (let y = -1; y <= mapa.length; y++)
    for (let x = -1; x <= LARGURA_SPRITE; x++)
      if (!cheio(x, y) && (cheio(x - 1, y) || cheio(x + 1, y) || cheio(x, y - 1) || cheio(x, y + 1)))
        ctx.fillRect(x0 + x * e + (cheio(x + 1, y) ? e - 1 : 0), y0 + y * e + (cheio(x, y + 1) ? e - 1 : 0), cheio(x - 1, y) || cheio(x + 1, y) ? 1 : e, cheio(x, y - 1) || cheio(x, y + 1) ? 1 : e);
  for (let y = 0; y < mapa.length; y++) {
    const linha = mapa[y]!;
    for (let x = 0; x < LARGURA_SPRITE; x++) {
      const ch = linha[x]!;
      if (ch === '.') continue;
      // Mãos "digitando": sobem 1 pixel do sprite alternadamente.
      const dy = opts.maosAcima && ch === 'S' && y >= 13 ? -1 : 0;
      ctx.fillStyle = cores[ch]!;
      ctx.fillRect(x0 + x * e, y0 + (y + dy) * e, e, e);
    }
  }
}
