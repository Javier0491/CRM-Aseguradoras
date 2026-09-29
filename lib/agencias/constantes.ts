// Agencia inicial del SaaS: la migración 20260929100000_multi_agencia la crea con este id fijo
// y le asigna todos los datos que existían antes del multi-tenant.
export const AGENCIA_INICIAL_ID = "00000000-0000-4000-8000-000000000001";

/** Claim de `app_metadata` (JWT de Supabase) con la agencia del usuario, para las políticas RLS. */
export const CLAIM_AGENCIA = "agencia_id";
