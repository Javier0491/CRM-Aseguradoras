"use client";

import { Environment, Lightformer, MeshTransmissionMaterial, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";

/*
 * Atmósfera 3D de la landing: una red de nodos (el procesamiento de datos) que rodea un núcleo de
 * cristal con dos órbitas de platino (el escudo). La red se ilumina cerca del cursor y por sus
 * aristas viajan pulsos de datos. Se carga solo en el cliente (components/landing/Atmosfera.tsx).
 */

const FONDO = "#030303";
const COBALTO = "#3d6bff";
const COBALTO_CLARO = "#8ea8ff";
const PLATINO = "#e6e9f0";

type Puntero = { x: number; y: number; activo: boolean };
/** avance: 0–1 en toda la página; salida: 0–1 en la primera pantalla (el hero). */
type Desplazamiento = { avance: number; salida: number };
type Calidad = "alta" | "media";

/** Pseudoaleatorio con semilla (mulberry32): la red sale igual en cada visita y en cada render. */
function aleatorio(semilla: number) {
  let s = semilla;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Red = {
  posiciones: Float32Array;
  tamanos: Float32Array;
  fases: Float32Array;
  segmentos: Float32Array;
  intensidades: Float32Array;
  aristas: [number, number][];
  vecinos: number[][];
};

/** Nodos en una cáscara elipsoidal alrededor del núcleo, unidos con sus vecinos más cercanos. */
function crearRed(nodos: number, semilla: number): Red {
  const azar = aleatorio(semilla);
  const posiciones = new Float32Array(nodos * 3);
  const tamanos = new Float32Array(nodos);
  const fases = new Float32Array(nodos);

  for (let i = 0; i < nodos; i++) {
    const u = azar() * 2 - 1;
    const angulo = azar() * Math.PI * 2;
    const anillo = Math.sqrt(1 - u * u);
    const radio = 2.15 + Math.pow(azar(), 0.75) * 2.7;
    posiciones[i * 3] = anillo * Math.cos(angulo) * radio * 1.5;
    posiciones[i * 3 + 1] = u * radio * 0.92;
    posiciones[i * 3 + 2] = anillo * Math.sin(angulo) * radio * 0.78;
    // Pocos nodos grandes y muchos pequeños.
    tamanos[i] = 0.55 + azar() * azar() * 2.4;
    fases[i] = azar() * Math.PI * 2;
  }

  // Con menos nodos la distancia entre ellos crece: el umbral crece con ella.
  const maxDistancia = 1.62 * Math.cbrt(170 / nodos);
  const vecinos: number[][] = Array.from({ length: nodos }, () => []);
  const aristas: [number, number][] = [];
  const existentes = new Set<number>();
  for (let i = 0; i < nodos; i++) {
    const cercanos: { j: number; d: number }[] = [];
    for (let j = 0; j < nodos; j++) {
      if (j === i) continue;
      const dx = posiciones[i * 3] - posiciones[j * 3];
      const dy = posiciones[i * 3 + 1] - posiciones[j * 3 + 1];
      const dz = posiciones[i * 3 + 2] - posiciones[j * 3 + 2];
      const d = Math.hypot(dx, dy, dz);
      if (d < maxDistancia) cercanos.push({ j, d });
    }
    cercanos.sort((a, b) => a.d - b.d);
    for (const { j } of cercanos.slice(0, 3)) {
      const clave = Math.min(i, j) * nodos + Math.max(i, j);
      if (existentes.has(clave)) continue;
      existentes.add(clave);
      aristas.push([i, j]);
      vecinos[i].push(j);
      vecinos[j].push(i);
    }
  }

  const segmentos = new Float32Array(aristas.length * 6);
  const intensidades = new Float32Array(aristas.length * 2);
  aristas.forEach(([a, b], k) => {
    segmentos.set(posiciones.subarray(a * 3, a * 3 + 3), k * 6);
    segmentos.set(posiciones.subarray(b * 3, b * 3 + 3), k * 6 + 3);
    const d = Math.hypot(
      posiciones[a * 3] - posiciones[b * 3],
      posiciones[a * 3 + 1] - posiciones[b * 3 + 1],
      posiciones[a * 3 + 2] - posiciones[b * 3 + 2]
    );
    // Las aristas cortas se ven más que las largas.
    const intensidad = 1 - (d / maxDistancia) * 0.75;
    intensidades[k * 2] = intensidad;
    intensidades[k * 2 + 1] = intensidad;
  });

  return { posiciones, tamanos, fases, segmentos, intensidades, aristas, vecinos };
}

/* Brillo por profundidad (los nodos del fondo se apagan) y por cercanía al cursor. */
const GLSL_COMUN = /* glsl */ `
  uniform vec3 uPuntero;
  uniform float uDistancia;
  float cercania(vec3 mundo) {
    return 1.0 - smoothstep(0.0, 2.5, distance(mundo, uPuntero));
  }
  float profundidad(vec4 vista) {
    return mix(0.22, 1.0, smoothstep(5.0, -4.0, -vista.z - uDistancia));
  }
`;

const VERTICE_PUNTOS = /* glsl */ `
  ${GLSL_COMUN}
  uniform float uTiempo;
  uniform float uPixeles;
  uniform float uEscala;
  attribute float aTamano;
  attribute float aFase;
  varying float vBrillo;
  varying float vCerca;
  void main() {
    vec4 mundo = modelMatrix * vec4(position, 1.0);
    vec4 vista = viewMatrix * mundo;
    float cerca = cercania(mundo.xyz);
    float latido = 0.62 + 0.38 * sin(uTiempo * 0.9 + aFase);
    vBrillo = (latido * 0.8 + cerca * 1.1) * profundidad(vista);
    vCerca = cerca;
    gl_Position = projectionMatrix * vista;
    gl_PointSize = aTamano * uEscala * uPixeles * (1.0 + cerca * 0.9) / -vista.z;
  }
`;

const FRAGMENTO_PUNTOS = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColorCerca;
  varying float vBrillo;
  varying float vCerca;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    float nucleo = smoothstep(0.22, 0.0, r);
    float halo = smoothstep(0.5, 0.0, r);
    gl_FragColor = vec4(mix(uColor, uColorCerca, vCerca), (nucleo + halo * halo * 0.5) * vBrillo);
    #include <colorspace_fragment>
  }
`;

const VERTICE_LINEAS = /* glsl */ `
  ${GLSL_COMUN}
  attribute float aIntensidad;
  varying float vAlfa;
  void main() {
    vec4 mundo = modelMatrix * vec4(position, 1.0);
    vec4 vista = viewMatrix * mundo;
    vAlfa = aIntensidad * (0.3 + cercania(mundo.xyz) * 0.7) * profundidad(vista);
    gl_Position = projectionMatrix * vista;
  }
`;

const FRAGMENTO_LINEAS = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlfa;
  void main() {
    gl_FragColor = vec4(uColor, vAlfa);
    #include <colorspace_fragment>
  }
`;

const LEJOS = new THREE.Vector3(999, 999, 999);
// Vectores de trabajo para el rayo del cursor (se reutilizan cada cuadro).
const ORIGEN = new THREE.Vector3();
const DIRECCION = new THREE.Vector3();

type Pulso = { desde: number; hasta: number; t: number; velocidad: number };

function crearPulsos(red: Red, total: number): Pulso[] {
  const azar = aleatorio(99);
  return Array.from({ length: total }, () => {
    const [desde, hasta] = red.aristas[Math.floor(azar() * red.aristas.length)];
    return { desde, hasta, t: azar(), velocidad: 0.5 + azar() * 0.7 };
  });
}

/** Avanza cada pulso por su arista; al llegar sigue por una vecina (o regresa si no hay otra). */
function avanzarPulsos(red: Red, pulsos: Pulso[], dt: number, posiciones: THREE.BufferAttribute) {
  const p = red.posiciones;
  pulsos.forEach((pulso, k) => {
    const a = pulso.desde * 3;
    const b = pulso.hasta * 3;
    const largo = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
    pulso.t += (dt * pulso.velocidad) / Math.max(largo, 0.2);
    if (pulso.t >= 1) {
      const opciones = red.vecinos[pulso.hasta].filter((v) => v !== pulso.desde);
      const regreso = pulso.desde;
      pulso.desde = pulso.hasta;
      pulso.hasta = opciones.length ? opciones[Math.floor(Math.random() * opciones.length)] : regreso;
      pulso.t = 0;
    }
    const i = pulso.desde * 3;
    const j = pulso.hasta * 3;
    const t = pulso.t;
    posiciones.setXYZ(k, p[i] + (p[j] - p[i]) * t, p[i + 1] + (p[j + 1] - p[i + 1]) * t, p[i + 2] + (p[j + 2] - p[i + 2]) * t);
  });
  posiciones.needsUpdate = true;
}

function RedNeuronal({
  red,
  puntero,
  quieto,
}: {
  red: Red;
  puntero: RefObject<Puntero>;
  quieto: boolean;
}) {
  // Tiempo, cursor, distancia de la cámara y densidad de píxeles son los mismos objetos en los
  // tres materiales: basta actualizarlos en uno (el de los nodos, que siempre está montado).
  const uniformes = useMemo(() => {
    const compartidos = {
      uTiempo: { value: 0 },
      uPuntero: { value: LEJOS.clone() },
      uDistancia: { value: 9 },
      uPixeles: { value: 1 },
    };
    return {
      nodos: {
        ...compartidos,
        uEscala: { value: 54 },
        uColor: { value: new THREE.Color(COBALTO_CLARO) },
        uColorCerca: { value: new THREE.Color(PLATINO) },
      },
      pulsos: {
        ...compartidos,
        uEscala: { value: 74 },
        uColor: { value: new THREE.Color(PLATINO) },
        uColorCerca: { value: new THREE.Color("#ffffff") },
      },
      lineas: { ...compartidos, uColor: { value: new THREE.Color(COBALTO) } },
    };
  }, []);

  // Pulsos de datos: el estado de la simulación vive en una ref y sus posiciones en el atributo.
  const totalPulsos = Math.min(42, red.aristas.length);
  const atributosPulsos = useMemo(() => {
    const azar = aleatorio(42);
    return {
      posiciones: new Float32Array(totalPulsos * 3),
      tamanos: Float32Array.from({ length: totalPulsos }, () => 0.9 + azar() * 0.8),
      fases: Float32Array.from({ length: totalPulsos }, () => azar() * Math.PI * 2),
    };
  }, [totalPulsos]);
  const simulacion = useRef<{ red: Red; pulsos: Pulso[] } | null>(null);
  const materialNodos = useRef<THREE.ShaderMaterial>(null);
  const geometriaPulsos = useRef<THREE.BufferGeometry>(null);

  useFrame((state, delta) => {
    const u = materialNodos.current?.uniforms;
    if (!u) return;
    const dt = Math.min(delta, 0.1);
    u.uPixeles.value = state.viewport.dpr;
    u.uDistancia.value = state.camera.position.length();
    if (quieto) return;
    u.uTiempo.value += dt;

    // Punto del cursor sobre el plano z = 0 (el centro de la red); la primera vez llega de golpe.
    const p = puntero.current;
    ORIGEN.copy(state.camera.position);
    DIRECCION.set(p.x, p.y, 0.5).unproject(state.camera).sub(ORIGEN).normalize();
    if (p.activo && Math.abs(DIRECCION.z) > 1e-4) {
      const objetivo = ORIGEN.addScaledVector(DIRECCION, -ORIGEN.z / DIRECCION.z);
      const actual: THREE.Vector3 = u.uPuntero.value;
      if (actual.equals(LEJOS)) actual.copy(objetivo);
      else actual.lerp(objetivo, 1 - Math.exp(-dt * 7));
    }

    const posiciones = geometriaPulsos.current?.getAttribute("position");
    if (!(posiciones instanceof THREE.BufferAttribute)) return;
    if (simulacion.current?.red !== red) simulacion.current = { red, pulsos: crearPulsos(red, totalPulsos) };
    avanzarPulsos(red, simulacion.current.pulsos, dt, posiciones);
  });

  return (
    <group>
      <lineSegments frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[red.segmentos, 3]} />
          <bufferAttribute attach="attributes-aIntensidad" args={[red.intensidades, 1]} />
        </bufferGeometry>
        <shaderMaterial
          uniforms={uniformes.lineas}
          vertexShader={VERTICE_LINEAS}
          fragmentShader={FRAGMENTO_LINEAS}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[red.posiciones, 3]} />
          <bufferAttribute attach="attributes-aTamano" args={[red.tamanos, 1]} />
          <bufferAttribute attach="attributes-aFase" args={[red.fases, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialNodos}
          uniforms={uniformes.nodos}
          vertexShader={VERTICE_PUNTOS}
          fragmentShader={FRAGMENTO_PUNTOS}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {!quieto && totalPulsos > 0 && (
        <points frustumCulled={false}>
          <bufferGeometry ref={geometriaPulsos}>
            <bufferAttribute
              attach="attributes-position"
              args={[atributosPulsos.posiciones, 3]}
              usage={THREE.DynamicDrawUsage}
            />
            <bufferAttribute attach="attributes-aTamano" args={[atributosPulsos.tamanos, 1]} />
            <bufferAttribute attach="attributes-aFase" args={[atributosPulsos.fases, 1]} />
          </bufferGeometry>
          <shaderMaterial
            uniforms={uniformes.pulsos}
            vertexShader={VERTICE_PUNTOS}
            fragmentShader={FRAGMENTO_PUNTOS}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}
    </group>
  );
}

/** Textura de halo radial para el resplandor del núcleo. */
function crearHalo() {
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = 128;
  const ctx = lienzo.getContext("2d");
  if (ctx) {
    const degradado = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    degradado.addColorStop(0, "rgba(255,255,255,1)");
    degradado.addColorStop(0.22, "rgba(255,255,255,0.32)");
    degradado.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = degradado;
    ctx.fillRect(0, 0, 128, 128);
  }
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

function Orbita({
  radio,
  inclinacion,
  velocidad,
  cuentas,
  quieto,
}: {
  radio: number;
  inclinacion: [number, number, number];
  velocidad: number;
  cuentas: number[];
  quieto: boolean;
}) {
  const giro = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!quieto && giro.current) giro.current.rotation.z += Math.min(delta, 0.1) * velocidad;
  });
  return (
    <group rotation={inclinacion}>
      <group ref={giro}>
        <mesh>
          <torusGeometry args={[radio, 0.0055, 12, 240]} />
          <meshStandardMaterial color={PLATINO} metalness={1} roughness={0.2} envMapIntensity={1.6} />
        </mesh>
        {cuentas.map((angulo) => (
          <mesh key={angulo} position={[Math.cos(angulo) * radio, Math.sin(angulo) * radio, 0]}>
            <sphereGeometry args={[0.034, 16, 16]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function NucleoCristal({ calidad, quieto }: { calidad: Calidad; quieto: boolean }) {
  const ia = useRef<THREE.Mesh>(null);
  const halo = useMemo(() => crearHalo(), []);
  useEffect(() => () => halo.dispose(), [halo]);

  useFrame((_, delta) => {
    if (quieto || !ia.current) return;
    const dt = Math.min(delta, 0.1);
    ia.current.rotation.x += dt * 0.22;
    ia.current.rotation.y += dt * 0.31;
  });

  return (
    <group>
      {/* El "cerebro" de IA que se ve a través del cristal. */}
      <mesh ref={ia}>
        <icosahedronGeometry args={[0.46, 1]} />
        <meshBasicMaterial color={COBALTO_CLARO} wireframe transparent opacity={0.6} toneMapped={false} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.16, 0]} />
        <meshBasicMaterial color="#dfe6ff" toneMapped={false} />
      </mesh>
      <sprite scale={[1.5, 1.5, 1]}>
        <spriteMaterial map={halo} color={COBALTO} opacity={0.7} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>

      <mesh>
        <sphereGeometry args={[1.18, 96, 96]} />
        <MeshTransmissionMaterial
          samples={calidad === "alta" ? 6 : 3}
          resolution={calidad === "alta" ? 512 : 256}
          transmission={1}
          thickness={1.25}
          roughness={0.05}
          ior={1.24}
          chromaticAberration={0.07}
          anisotropy={0.25}
          distortion={0.22}
          distortionScale={0.35}
          temporalDistortion={quieto ? 0 : 0.06}
          clearcoat={1}
          clearcoatRoughness={0.1}
          attenuationDistance={6}
          attenuationColor="#ffffff"
          color="#ffffff"
          envMapIntensity={1.5}
        />
      </mesh>

      <Orbita radio={1.62} inclinacion={[1.15, 0.35, 0]} velocidad={0.32} cuentas={[0.4, 2.6]} quieto={quieto} />
      <Orbita radio={1.95} inclinacion={[-0.9, -0.55, 0.3]} velocidad={-0.2} cuentas={[1.2, 4.1, 5.3]} quieto={quieto} />
    </group>
  );
}

const damp = THREE.MathUtils.damp;

function Sistema({
  red,
  calidad,
  puntero,
  desplazamiento,
  quieto,
}: {
  red: Red;
  calidad: Calidad;
  puntero: RefObject<Puntero>;
  desplazamiento: RefObject<Desplazamiento>;
  quieto: boolean;
}) {
  const inclinacion = useRef<THREE.Group>(null);
  const giro = useRef<THREE.Group>(null);
  const nucleo = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const aspecto = state.size.width / Math.max(state.size.height, 1);
    // En vertical la cámara se aleja para que la red quepa a lo ancho.
    const distancia = aspecto < 0.8 ? 13.5 : aspecto < 1.25 ? 11 : 9;
    const cam = state.camera;

    if (quieto) {
      cam.position.set(0, 0, distancia);
      cam.lookAt(0, 0, 0);
      return;
    }

    const p = puntero.current;
    const { avance: s, salida } = desplazamiento.current;
    if (giro.current) giro.current.rotation.y += dt * 0.04;
    const g = inclinacion.current;
    if (g) {
      g.rotation.x = damp(g.rotation.x, -p.y * 0.16 + s * 0.45, 2.4, dt);
      g.rotation.y = damp(g.rotation.y, p.x * 0.28 + s * 0.9, 2.4, dt);
    }
    // Al dejar el hero, el núcleo se aparta de los títulos centrados: a la derecha en pantallas
    // anchas, hacia arriba y al fondo en vertical.
    const n = nucleo.current;
    if (n) {
      const f = THREE.MathUtils.smoothstep(salida, 0.1, 0.9);
      const ancho = aspecto >= 1.25;
      n.position.x = damp(n.position.x, ancho ? f * 3.6 : 0, 2.2, dt);
      n.position.y = damp(n.position.y, ancho ? f * -0.3 : f * 2.4, 2.2, dt);
      n.position.z = damp(n.position.z, ancho ? f * -1.2 : f * -3, 2.2, dt);
      n.rotation.x = damp(n.rotation.x, -p.y * 0.2, 2.4, dt);
      n.rotation.y = damp(n.rotation.y, p.x * 0.3, 2.4, dt);
    }
    // Paralaje: la cámara se desplaza poco hacia el cursor (los nodos cercanos se mueven más).
    cam.position.x = damp(cam.position.x, p.x * 0.55, 1.8, dt);
    cam.position.y = damp(cam.position.y, p.y * 0.35, 1.8, dt);
    cam.position.z = damp(cam.position.z, distancia, 1.6, dt);
    cam.lookAt(0, 0, 0);
  });

  return (
    <>
      <group ref={inclinacion}>
        <group ref={giro}>
          <RedNeuronal red={red} puntero={puntero} quieto={quieto} />
        </group>
      </group>
      <group ref={nucleo}>
        <NucleoCristal calidad={calidad} quieto={quieto} />
      </group>
    </>
  );
}

export default function Scene3D_SaaS() {
  const reducir = useReducedMotion() ?? false;
  const [listo, setListo] = useState(false);
  // Equipos táctiles o pantallas angostas: menos nodos y menos resolución desde el inicio.
  const [ligero] = useState(() => window.matchMedia("(pointer: coarse), (max-width: 767px)").matches);
  const [calidad, setCalidad] = useState<Calidad>(ligero ? "media" : "alta");
  const red = useMemo(() => crearRed(ligero ? 96 : 170, 7), [ligero]);

  const puntero = useRef<Puntero>({ x: 0, y: 0, activo: false });
  const desplazamiento = useRef<Desplazamiento>({ avance: 0, salida: 0 });

  useEffect(() => {
    if (reducir) return;
    const mover = (e: PointerEvent) => {
      puntero.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      puntero.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
      puntero.current.activo = true;
    };
    const desplazar = () => {
      const recorrido = document.documentElement.scrollHeight - window.innerHeight;
      desplazamiento.current.avance = recorrido > 0 ? Math.min(window.scrollY / recorrido, 1) : 0;
      desplazamiento.current.salida = Math.min(window.scrollY / window.innerHeight, 1);
    };
    desplazar();
    window.addEventListener("pointermove", mover, { passive: true });
    window.addEventListener("scroll", desplazar, { passive: true });
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("scroll", desplazar);
    };
  }, [reducir]);

  return (
    <div className="absolute inset-0 transition-opacity duration-[1400ms] ease-out" style={{ opacity: listo ? 1 : 0 }}>
      <Canvas
        dpr={calidad === "alta" ? [1, 1.75] : [1, 1.25]}
        frameloop={reducir ? "demand" : "always"}
        camera={{ position: [0, 0, reducir ? 9 : 15], fov: 40, near: 0.1, far: 60 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        fallback={null}
        onCreated={({ invalidate }) => {
          setListo(true);
          // Con "reducir movimiento" solo se pinta bajo demanda: unos cuadros para el entorno y el cristal.
          if (reducir) invalidate(4);
        }}
      >
        <color attach="background" args={[FONDO]} />
        <ambientLight intensity={0.2} />
        <pointLight position={[-4, 3, 4]} color={COBALTO} intensity={38} />
        <pointLight position={[5, -2, 3]} color={PLATINO} intensity={16} />

        {/* Entorno propio (sin descargar HDR): reflejos platino arriba y cobalto a los lados. */}
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={2.4} color={PLATINO} position={[0, 5, -2]} scale={[12, 2.5, 1]} target={[0, 0, 0]} />
          <Lightformer form="ring" intensity={3.2} color={COBALTO} position={[-5, 0.5, 3]} scale={3.2} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[5, 1, 4]} scale={[2.5, 7, 1]} target={[0, 0, 0]} />
          <Lightformer form="circle" intensity={1.4} color={COBALTO_CLARO} position={[0, -5, -3]} scale={5} target={[0, 0, 0]} />
        </Environment>

        {/* Si el equipo no sostiene los cuadros por segundo, baja la resolución del cristal y del lienzo. */}
        {!reducir && <PerformanceMonitor onDecline={() => setCalidad("media")} />}
        <Sistema red={red} calidad={calidad} puntero={puntero} desplazamiento={desplazamiento} quieto={reducir} />
      </Canvas>
    </div>
  );
}
