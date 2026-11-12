-- Rol Auxiliar comercial: ve y hace lo mismo que el Ejecutivo comercial (permisos en
-- lib/usuarios/reglas.ts y lib/auth/dal.ts). Solo agrega el valor al enum: no toca datos.
ALTER TYPE "Rol" ADD VALUE IF NOT EXISTS 'AUXILIAR_COMERCIAL';
