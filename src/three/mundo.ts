import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { EstadoAgente } from '../../shared/types';

// Modelos do kit "empresa-agentes-kit-3d" (glTF 2.0, Y para cima), servidos de /public/modelos.
const BASE = `${import.meta.env.BASE_URL}modelos`;
const AMBIENTE = `${BASE}/sede-nebula-cidade.glb`;
const MODELOS_AGENTES = ['helena', 'rui', 'lia', 'bruno', 'carla', 'diego', 'ana', 'marina', 'igor', 'paula', 'otavio', 'sofia'];

const CLIPE_POR_ESTADO: Record<EstadoAgente, string> = {
  ocioso: 'idle',
  trabalhando: 'work',
  aguardando_aprovacao: 'waiting',
  bloqueado: 'blocked',
  erro: 'blocked',
};

export interface AgenteCena {
  id: string;
  estado: EstadoAgente;
  cor: string;
  visivel: boolean;
}

interface AgenteVivo {
  id: string;
  raiz: THREE.Group;
  mixer: THREE.AnimationMixer;
  acoes: Map<string, THREE.AnimationAction>;
  clipe: string;
  altura: number;
  malhas: THREE.Mesh[];
}

const PE_DIREITO = 2.95; // distância entre andares no modelo da sede
const AFASTAMENTO = 3.2; // espaço extra entre andares na vista explodida

/**
 * Vista explodida ("casa de bonecas"): com a câmera a ~30° de altura, a laje de cima esconderia quase todo o
 * interior. Cada andar (e o telhado) vai para um grupo deslocado para cima; o transform local de cada nó é
 * preservado e as animações continuam funcionando, pois são ligadas pelo nome do nó.
 */
function explodirAndares(sede: THREE.Object3D) {
  const grupos = [0, 1, 2, 3].map((k) => {
    const g = new THREE.Group();
    g.name = `Andar_${k}`;
    g.position.y = k * AFASTAMENTO;
    sede.add(g);
    return g;
  });
  for (const filho of [...sede.children]) {
    if (filho.name.startsWith('Andar_')) continue;
    if (filho.name === 'ElevatorCore') {
      filho.visible = false; // atravessa os três andares; não faz sentido na vista explodida
      continue;
    }
    const k = THREE.MathUtils.clamp(Math.floor((filho.position.y - 0.2) / PE_DIREITO), 0, 3);
    if (k > 0) grupos[k]!.add(filho);
  }
  sede.updateMatrixWorld(true);
}

/** Altura de uma pessoa na escala da sede (mesa a 0,74; pé-direito de 2,7). */
const ALTURA_PESSOA = 1.72;

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export class Mundo {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private readonly controls: OrbitControls;
  private readonly relogio = new THREE.Clock();
  private readonly loader = new GLTFLoader();
  private readonly modelos = new Map<string, Promise<GLTF>>();
  private readonly agentes = new Map<string, AgenteVivo>();
  private readonly spawns = new Map<string, { pos: THREE.Vector3; quat: THREE.Quaternion }>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly anel: THREE.Mesh;
  private mixerAmbiente: THREE.AnimationMixer | null = null;
  private meiaAltura = 18;
  private raf = 0;
  private selecionado: string | null = null;
  private pendentes = new Set<string>();
  private destruido = false;
  private observador: ResizeObserver;
  /** Chamado a cada quadro com a posição (px) da cabeça de cada agente visível. */
  onQuadro: (posicoes: Map<string, [number, number] | null>) => void = () => {};
  onZoom: (zoom: number) => void = () => {};
  onEconomico: () => void = () => {};
  economico = false;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#0d1524');
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x303845, 1.3));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.screenSpacePanning = true;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.minZoom = 0.6;
    this.controls.maxZoom = 6;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = 1.3;
    this.controls.addEventListener('change', () => this.onZoom(this.camera.zoom));

    // Anel de seleção no chão
    this.anel = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.52, 40),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.anel.rotation.x = -Math.PI / 2;
    this.anel.visible = false;
    this.scene.add(this.anel);

    this.observador = new ResizeObserver(() => this.redimensionar());
    this.observador.observe(host);
    this.redimensionar();
  }

  private carregarModelo(url: string) {
    let p = this.modelos.get(url);
    if (!p) {
      p = this.loader.loadAsync(url);
      this.modelos.set(url, p);
    }
    return p;
  }

  async carregarAmbiente(progresso?: (f: number) => void) {
    const gltf = await new Promise<GLTF>((ok, falha) => this.loader.load(AMBIENTE, ok, (e) => e.total && progresso?.(e.loaded / e.total), falha));
    if (this.destruido) return;
    const amb = gltf.scene;
    amb.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
      if ((o as THREE.DirectionalLight).isDirectionalLight) {
        const luz = o as THREE.DirectionalLight;
        luz.castShadow = true;
        luz.shadow.mapSize.set(1536, 1536);
        Object.assign(luz.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 0.5, far: 120 });
        luz.shadow.bias = -0.0005;
      }
    });
    // Corte isométrico: a câmera olha pela direita, onde uma parede inteira tapava as estações de trabalho.
    amb.traverse((o) => {
      if (/^RightWall/.test(o.name)) o.visible = false;
    });
    const sedeNo = amb.getObjectByName('NebulaHeadquarters');
    if (sedeNo) explodirAndares(sedeNo);
    this.scene.add(amb);
    amb.updateMatrixWorld(true);

    // Pontos de spawn: usar a posição no MUNDO (eles ficam dentro de um nó deslocado).
    amb.traverse((o) => {
      const m = o.name.match(/^AgentSpawn_(.+)$/);
      if (m) this.spawns.set(m[1]!, { pos: o.getWorldPosition(new THREE.Vector3()), quat: o.getWorldQuaternion(new THREE.Quaternion()) });
    });

    // Câmera isométrica do arquivo
    const cam = gltf.cameras[0] as THREE.OrthographicCamera | undefined;
    const sede = amb.getObjectByName('NebulaHeadquarters') ?? amb;
    const centro = new THREE.Box3().setFromObject(sede).getCenter(new THREE.Vector3());
    if (cam) {
      cam.updateMatrixWorld(true);
      cam.getWorldPosition(this.camera.position);
      cam.getWorldQuaternion(this.camera.quaternion);
      this.meiaAltura = cam.top || 18;
    } else {
      this.camera.position.set(21, 18, 25);
      this.camera.lookAt(centro);
    }
    // Alvo da órbita: ponto da linha de visão mais próximo do centro do prédio.
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const t = centro.clone().sub(this.camera.position).dot(dir);
    this.controls.target.copy(this.camera.position).addScaledVector(dir, t);
    this.camera.zoom = 1.1;
    this.redimensionar();
    this.controls.update();
    const az = this.controls.getAzimuthalAngle();
    this.controls.minAzimuthAngle = az - 0.9;
    this.controls.maxAzimuthAngle = az + 0.9;

    const amb_clip = THREE.AnimationClip.findByName(gltf.animations, 'ambient');
    if (amb_clip) {
      this.mixerAmbiente = new THREE.AnimationMixer(amb);
      this.mixerAmbiente.clipAction(amb_clip).play();
    }
    this.iniciar();
  }

  /** Posição para agentes sem ponto de spawn próprio (novos ou importados): fileira na praça. */
  private vagaExtra(indice: number) {
    const col = indice % 8;
    const lin = Math.floor(indice / 8);
    const pos = new THREE.Vector3(-5.6 + col * 1.6, 0, 4.2 + lin * 1.4);
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(21, 25));
    return { pos, quat };
  }

  /** Cria/remove agentes e atualiza animações conforme o estado da aplicação. */
  sincronizar(lista: AgenteCena[]) {
    const ids = new Set(lista.map((a) => a.id));
    for (const [id, ag] of this.agentes) {
      if (!ids.has(id)) {
        this.scene.remove(ag.raiz);
        ag.mixer.stopAllAction();
        this.agentes.delete(id);
      }
    }
    let extra = 0;
    for (const a of lista) {
      const base = a.id.split(':').pop()!;
      const proprio = MODELOS_AGENTES.includes(base) && !a.id.includes(':');
      const spawn = proprio ? this.spawns.get(base) : undefined;
      const vaga = spawn ?? this.vagaExtra(extra++);
      const vivo = this.agentes.get(a.id);
      if (vivo) {
        vivo.raiz.visible = a.visivel;
        vivo.raiz.position.copy(vaga.pos);
        this.trocarClipe(vivo, CLIPE_POR_ESTADO[a.estado]);
        continue;
      }
      if (this.pendentes.has(a.id)) continue;
      this.pendentes.add(a.id);
      const modelo = proprio ? base : MODELOS_AGENTES[hash(a.id) % MODELOS_AGENTES.length]!;
      this.carregarModelo(`${BASE}/agentes/${modelo}.glb`)
        .then((gltf) => {
          this.pendentes.delete(a.id);
          if (this.destruido || !ids.has(a.id)) return;
          const raiz = new THREE.Group();
          raiz.name = `agente:${a.id}`;
          const modeloCena = gltf.scene.clone(true);
          const malhas: THREE.Mesh[] = [];
          modeloCena.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            m.castShadow = true;
            m.userData.agenteId = a.id;
            malhas.push(m);
            // Agentes sem modelo próprio ganham a roupa na cor do setor.
            if (!proprio && /Outerwear|TorsoMesh|Sleeve/.test(m.name)) {
              m.material = (m.material as THREE.MeshStandardMaterial).clone();
              (m.material as THREE.MeshStandardMaterial).color.set(a.cor);
            }
          });
          raiz.add(modeloCena);
          // Os modelos vêm com ~2,9 de altura; reduz para a escala humana da sede e apoia os pés no chão.
          let caixa = new THREE.Box3().setFromObject(modeloCena);
          modeloCena.scale.setScalar(ALTURA_PESSOA / (caixa.max.y - caixa.min.y));
          caixa = new THREE.Box3().setFromObject(modeloCena);
          modeloCena.position.y -= caixa.min.y;
          raiz.position.copy(vaga.pos);
          raiz.quaternion.copy(vaga.quat);
          raiz.visible = a.visivel;
          this.scene.add(raiz);
          const mixer = new THREE.AnimationMixer(modeloCena);
          const acoes = new Map(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]));
          const vivo: AgenteVivo = { id: a.id, raiz, mixer, acoes, clipe: '', altura: caixa.max.y - caixa.min.y, malhas };
          // Dessincroniza agentes para não respirarem todos juntos.
          mixer.setTime((hash(a.id) % 1000) / 300);
          this.agentes.set(a.id, vivo);
          this.trocarClipe(vivo, CLIPE_POR_ESTADO[a.estado]);
        })
        .catch((e) => {
          this.pendentes.delete(a.id);
          console.error('Falha ao carregar modelo do agente', a.id, e);
        });
    }
  }

  private trocarClipe(ag: AgenteVivo, nome: string) {
    if (ag.clipe === nome) return;
    const nova = ag.acoes.get(nome) ?? ag.acoes.get('idle');
    if (!nova) return;
    const antiga = ag.acoes.get(ag.clipe);
    nova.reset().setEffectiveWeight(1).play();
    if (antiga && antiga !== nova) antiga.crossFadeTo(nova, 0.35, false);
    ag.clipe = nome;
  }

  selecionar(id: string | null) {
    this.selecionado = id;
  }

  /** Agente sob o ponteiro (coordenadas de tela), ou null. */
  escolher(clientX: number, clientY: number): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const malhas = [...this.agentes.values()].filter((a) => a.raiz.visible).flatMap((a) => a.malhas);
    const hit = this.raycaster.intersectObjects(malhas, false)[0];
    return (hit?.object.userData.agenteId as string) ?? null;
  }

  zoom(fator: number) {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * fator, this.controls.minZoom, this.controls.maxZoom);
    this.camera.updateProjectionMatrix();
    this.onZoom(this.camera.zoom);
  }

  focar(id: string) {
    const ag = this.agentes.get(id);
    if (!ag) return;
    const delta = ag.raiz.position.clone().add(new THREE.Vector3(0, ag.altura / 2, 0)).sub(this.controls.target);
    this.controls.target.add(delta);
    this.camera.position.add(delta);
  }

  private redimensionar() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    const a = w / h;
    Object.assign(this.camera, { left: -this.meiaAltura * a, right: this.meiaAltura * a, top: this.meiaAltura, bottom: -this.meiaAltura });
    this.camera.updateProjectionMatrix();
  }

  /** Se a máquina não sustentar ~24 fps, desliga sombras e reduz a resolução. */
  private economizar() {
    this.economico = true;
    this.renderer.shadowMap.enabled = false;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
    });
    this.renderer.setPixelRatio(1);
    this.redimensionar();
    this.onEconomico();
  }

  private quadro: (() => void) | null = null;
  private pausado = false;

  /** Para de renderizar enquanto o escritório não está visível (outra aba). */
  pausar(sim: boolean) {
    if (sim === this.pausado) return;
    this.pausado = sim;
    cancelAnimationFrame(this.raf);
    if (!sim && this.quadro) {
      this.relogio.getDelta(); // evita um salto grande nas animações
      this.redimensionar();
      this.raf = requestAnimationFrame(this.quadro);
    }
  }

  private iniciar() {
    let quadros = 0;
    let inicioMedida = performance.now() + 1500; // ignora o 1º segundo e meio (compilação de shaders)
    const quadro = () => {
      if (this.pausado) return;
      this.raf = requestAnimationFrame(quadro);
      const agora = performance.now();
      if (!this.economico && agora > inicioMedida) {
        quadros++;
        if (agora - inicioMedida > 2500) {
          if (quadros / ((agora - inicioMedida) / 1000) < 24) this.economizar();
          inicioMedida = Infinity;
        }
      }
      const dt = Math.min(this.relogio.getDelta(), 0.1);
      this.mixerAmbiente?.update(dt);
      for (const ag of this.agentes.values()) if (ag.raiz.visible) ag.mixer.update(dt);
      this.controls.update();

      const sel = this.selecionado && this.agentes.get(this.selecionado);
      this.anel.visible = !!sel && sel.raiz.visible;
      if (sel) {
        this.anel.position.copy(sel.raiz.position).add(new THREE.Vector3(0, 0.03, 0));
        const s = 1 + Math.sin(performance.now() / 250) * 0.06;
        this.anel.scale.set(s, s, s);
      }
      this.renderer.render(this.scene, this.camera);

      const w = this.renderer.domElement.clientWidth;
      const h = this.renderer.domElement.clientHeight;
      const posicoes = new Map<string, [number, number] | null>();
      const v = new THREE.Vector3();
      for (const ag of this.agentes.values()) {
        if (!ag.raiz.visible) {
          posicoes.set(ag.id, null);
          continue;
        }
        v.copy(ag.raiz.position).y += ag.altura + 0.12;
        v.project(this.camera);
        posicoes.set(ag.id, [(v.x + 1) * 0.5 * w, (1 - v.y) * 0.5 * h]);
      }
      this.onQuadro(posicoes);
    };
    this.quadro = quadro;
    if (!this.pausado) quadro();
  }

  destruir() {
    this.destruido = true;
    cancelAnimationFrame(this.raf);
    this.observador.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
