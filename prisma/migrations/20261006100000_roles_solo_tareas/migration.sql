-- Roles del equipo. ADMIN (Administrador) y EJECUTIVO (Ejecutivo comercial) siguen igual; los
-- tres nuevos solo usan Tareas: Ejecutiva de operación, Líder de oficina y Auxiliar.
ALTER TYPE "Rol" ADD VALUE IF NOT EXISTS 'OPERACION';
ALTER TYPE "Rol" ADD VALUE IF NOT EXISTS 'LIDER_OFICINA';
ALTER TYPE "Rol" ADD VALUE IF NOT EXISTS 'AUXILIAR';
