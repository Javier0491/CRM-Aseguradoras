"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { EstadoPersonaje } from "@/components/asistente/conversacion";

/*
 * Personaje provisional del asistente: un orbe con ojos, del color de la marca de la agencia. Flota
 * en reposo, parpadea y voltea un poco hacia el cursor; pensando, su anillo gira rápido con tres
 * chispas en órbita y mira hacia arriba; hablando, late y entrecierra los ojos. Cuando exista el
 * modelo .glb definitivo, se reemplaza este componente y sus animaciones se conectan a los mismos
 * estados. Se carga solo en el cliente (components/asistente/personaje.tsx).
 */

const OJO = "#14161c";

/** Suaviza un valor hacia su destino sin depender de los FPS. */
const acercar = (actual: number, destino: number, rapidez: number, dt: number) =>
  THREE.MathUtils.damp(actual, destino, rapidez, dt);

/** Un ojo: cápsula oscura apenas hundida en la esfera, con un brillo blanco arriba. */
function Ojo({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh scale={[1, 1, 0.5]}>
        <capsuleGeometry args={[0.085, 0.15, 8, 16]} />
        <meshPhysicalMaterial color={OJO} roughness={0.1} clearcoat={1} clearcoatRoughness={0.05} />
      </mesh>
      <mesh position={[0.025, 0.09, 0.05]}>
        <sphereGeometry args={[0.028, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
    </group>
  );
}

function Orbe({ color, estado }: { color: string; estado: EstadoPersonaje }) {
  const grupo = useRef<THREE.Group>(null);
  const cuerpo = useRef<THREE.Group>(null);
  const ojos = useRef<THREE.Group>(null);
  const anillo = useRef<THREE.Mesh>(null);
  const chispas = useRef<THREE.Group>(null);
  const material = useRef<THREE.MeshPhysicalMaterial>(null);
  // Próximo parpadeo (segundos del reloj de la escena).
  const parpadeo = useRef({ siguiente: 1.5, inicio: -1 });
  const base = useMemo(() => new THREE.Color(color), [color]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const g = grupo.current;
    if (!g || !cuerpo.current || !ojos.current || !anillo.current || !chispas.current || !material.current) return;

    // Flotar y voltear un poco hacia el cursor: es un gesto, no un giro.
    g.position.y = Math.sin(t * 1.6) * 0.07;
    const mirarArriba = estado === "pensando" ? 0.3 : 0;
    g.rotation.y = acercar(g.rotation.y, state.pointer.x * 0.22, 4, dt);
    g.rotation.x = acercar(g.rotation.x, -state.pointer.y * 0.15 - mirarArriba, 4, dt);

    // Hablando late; en los demás estados respira despacio. La cara late con el cuerpo.
    const latido = estado === "hablando" ? 1 + Math.abs(Math.sin(t * 9)) * 0.045 : 1 + Math.sin(t * 2) * 0.012;
    cuerpo.current.scale.setScalar(latido);

    // Parpadeo cada 2–5 s; hablando, los ojos se entrecierran (sonrisa).
    const p = parpadeo.current;
    if (t >= p.siguiente) {
      p.inicio = t;
      p.siguiente = t + 2 + Math.random() * 3;
    }
    const enParpadeo = t - p.inicio < 0.14;
    const apertura = enParpadeo ? 0.1 : estado === "hablando" ? 0.6 : 1;
    ojos.current.scale.y = acercar(ojos.current.scale.y, apertura, enParpadeo ? 40 : 10, dt);

    // Anillo: gira lento en reposo y rápido pensando; las chispas solo aparecen pensando.
    anillo.current.rotation.z += dt * (estado === "pensando" ? 3.2 : 0.5);
    chispas.current.rotation.y += dt * 2.6;
    chispas.current.scale.setScalar(acercar(chispas.current.scale.x, estado === "pensando" ? 1 : 0, 8, dt));

    // Brillo propio: sube un poco al pensar o hablar.
    const brillo = estado === "reposo" ? 0.18 : 0.4 + Math.sin(t * 6) * 0.08;
    material.current.emissiveIntensity = acercar(material.current.emissiveIntensity, brillo, 6, dt);
  });

  return (
    <group ref={grupo}>
      <group ref={cuerpo}>
        <mesh>
          <sphereGeometry args={[1, 64, 64]} />
          <meshPhysicalMaterial
            ref={material}
            color={base}
            emissive={base}
            emissiveIntensity={0.18}
            roughness={0.28}
            metalness={0.1}
            clearcoat={1}
            clearcoatRoughness={0.15}
          />
        </mesh>
        {/* Sobre la superficie al frente (la esfera mide 1: z ≈ 0.96 a esa altura y separación). */}
        <group ref={ojos} position={[0, 0.12, 0.965]}>
          <Ojo x={-0.25} />
          <Ojo x={0.25} />
        </group>
      </group>
      <mesh ref={anillo} rotation={[Math.PI / 2.3, 0, 0]}>
        <torusGeometry args={[1.32, 0.022, 16, 96]} />
        <meshBasicMaterial color={base} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <group ref={chispas} scale={0}>
        {[0, 1, 2].map((i) => {
          const angulo = (i / 3) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(angulo) * 1.5, Math.sin(angulo * 2) * 0.25, Math.sin(angulo) * 1.5]}>
              <sphereGeometry args={[0.07, 16, 16]} />
              <meshBasicMaterial color="#ffffff" toneMapped={false} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

export default function Personaje3D({ color, estado }: { color: string; estado: EstadoPersonaje }) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 4.4], fov: 38 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      // El cursor se sigue en toda la página (no solo encima del personaje), sin capturar clics.
      eventSource={document.body}
      eventPrefix="client"
      style={{ pointerEvents: "none" }}
      aria-hidden
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[2.5, 3, 4]} intensity={1.6} />
      <directionalLight position={[-3, -1, -2]} intensity={0.8} color={color} />
      {/* Reflejos del barniz sin descargar un mapa de entorno. */}
      <Environment resolution={64}>
        <Lightformer form="rect" intensity={2} position={[0, 3, 2]} scale={[4, 1, 1]} />
        <Lightformer form="ring" intensity={1.2} position={[-3, 0, 3]} scale={2} color={color} />
      </Environment>
      <Orbe color={color} estado={estado} />
    </Canvas>
  );
}
