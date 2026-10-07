-- Archivos e imágenes en el chat del equipo: uno por mensaje, guardado en el almacenamiento de
-- archivos (chat/{agenciaId}/{uuid}.{ext}). La clave es única: un archivo subido no se puede
-- ligar a otro mensaje.
ALTER TABLE "mensajes" ADD COLUMN "adjunto_clave" TEXT;
ALTER TABLE "mensajes" ADD COLUMN "adjunto_nombre" TEXT;
ALTER TABLE "mensajes" ADD COLUMN "adjunto_tipo" TEXT;
ALTER TABLE "mensajes" ADD COLUMN "adjunto_bytes" INTEGER;
ALTER TABLE "mensajes" ADD COLUMN "adjunto_ancho" INTEGER;
ALTER TABLE "mensajes" ADD COLUMN "adjunto_alto" INTEGER;

CREATE UNIQUE INDEX "mensajes_adjunto_clave_key" ON "mensajes"("adjunto_clave");

-- Mensajes instantáneos (Supabase Realtime): el servidor avisa en el tema privado "chat:<id del
-- usuario>" de cada participante que una conversación cambió (solo el id, nunca el contenido) y
-- el navegador vuelve a consultar. Cada quien solo puede escuchar su propio tema; nadie puede
-- publicar desde el navegador (no hay política de INSERT). Solo existe en Supabase; si el rol de
-- las migraciones no pudiera crearla, el chat sigue funcionando consultando cada pocos segundos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'realtime' AND table_name = 'messages') THEN
    DROP POLICY IF EXISTS "chat: cada quien escucha su tema" ON "realtime"."messages";
    CREATE POLICY "chat: cada quien escucha su tema" ON "realtime"."messages" FOR SELECT TO authenticated
      USING (
        "realtime"."messages"."extension" = 'broadcast'
        AND (SELECT "realtime"."topic"()) = 'chat:' || (SELECT "auth"."uid"())::text
      );
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'No se pudo crear la política del chat en realtime.messages: %', SQLERRM;
END $$;
