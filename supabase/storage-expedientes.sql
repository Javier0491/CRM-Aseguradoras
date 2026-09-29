-- Bucket privado para los archivos de cada póliza: carátula (PDF) y expediente completo (ZIP).
-- Ejecutar en Supabase → SQL Editor. Es idempotente: volver a ejecutarlo actualiza
-- la configuración del bucket sin tocar los archivos.
--
-- No va en las migraciones de Prisma: el esquema `storage` lo administra Supabase
-- y no existe en la base sombra que usa `prisma migrate dev`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expedientes', 'expedientes', false, 52428800, array['application/zip', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Acceso por agencia: la carpeta de cada archivo es el id de su póliza ({polizaId}/{uuid}.ext) y
-- solo se permite si esa póliza es de la agencia del JWT (app_metadata.agencia_id). La app
-- opera con la sesión del usuario; no se usa la secret key.
-- Requiere las funciones de la migración 20260929300000_rls_por_agencia.
drop policy if exists "expedientes: leer" on storage.objects;
create policy "expedientes: leer" on storage.objects
  for select to authenticated
  using (bucket_id = 'expedientes' and public.poliza_de_mi_agencia((storage.foldername(name))[1]));

drop policy if exists "expedientes: subir" on storage.objects;
create policy "expedientes: subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'expedientes' and public.poliza_de_mi_agencia((storage.foldername(name))[1]));

-- Borrar: también los archivos de una póliza que ya se eliminó (eliminarPoliza borra primero la
-- póliza y después sus archivos, por clave exacta, que se listaron antes).
drop policy if exists "expedientes: borrar" on storage.objects;
create policy "expedientes: borrar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'expedientes'
    and (
      public.poliza_de_mi_agencia((storage.foldername(name))[1])
      or public.poliza_eliminada((storage.foldername(name))[1])
    )
  );
