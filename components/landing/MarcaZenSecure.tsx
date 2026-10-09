import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Marca de ZenSecure con la firma de Atelier Zenith. El monograma es el de public/marca/plataforma.png
 * pasado a platino y sin fondo (public/marca/zensecure.png) para que viva en la paleta de la landing.
 */
export function MarcaZenSecure({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image src="/marca/zensecure.png" alt="" width={235} height={192} className="h-7 w-auto" />
      <span className="flex flex-col">
        <span className="text-[15px] leading-none font-semibold tracking-[-0.01em] text-white">
          Zen<span className="font-normal text-white/55">Secure</span>
        </span>
        <span className="mt-1 text-[9px] leading-none font-medium tracking-[0.2em] text-white/40 uppercase">
          by Atelier Zenith
        </span>
      </span>
    </span>
  );
}
