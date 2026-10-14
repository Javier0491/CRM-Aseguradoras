"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Entrada de página: sube 6 px mientras aparece. Es corta (220 ms) para no estorbar al navegar y,
 * con "reducir movimiento", solo hay fundido.
 */
export function EntradaPagina({ children }: { children: React.ReactNode }) {
  const reducir = useReducedMotion();
  return (
    <motion.div
      className="flex flex-1 flex-col gap-6"
      initial={{ opacity: 0, y: reducir ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
