# Almacenamiento de archivos en Cloudflare R2

Supabase queda solo como base de datos (PostgreSQL). Los archivos de las pólizas se guardan
en un bucket **privado** de R2 y la base de datos guarda únicamente la clave del objeto
(`{polizaId}/{uuid}.pdf`) en `caratula_path`, `negociacion_path` y `expediente_path`.
Nadie abre un archivo sin sesión: el CRM genera una URL firmada de 60 segundos al consultarlo.

## 1. Crear el bucket
Cloudflare → R2 → **Create bucket** (p. ej. `pjmagnus-polizas`). No actives el acceso
público ni un dominio público.

## 2. Token de API
R2 → **Manage R2 API Tokens** → **Create API token**
- Permisos: **Object Read & Write**, limitado a ese bucket.
- Copia *Access Key ID* y *Secret Access Key* (el secreto solo se muestra una vez).

## 3. CORS del bucket
El navegador sube los archivos directo a R2, así que el bucket debe aceptar `PUT` desde el
dominio del CRM. Bucket → **Settings** → **CORS policy**:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://TU-DOMINIO-DEL-CRM"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Las descargas no necesitan CORS: el CRM redirige a la URL firmada.

## 4. Variables de entorno (`.env`)
```
ALMACEN_ARCHIVOS="r2"
R2_ACCOUNT_ID="…"
R2_ACCESS_KEY_ID="…"
R2_SECRET_ACCESS_KEY="…"
R2_BUCKET_NAME="pjmagnus-polizas"
```
Reinicia el servidor después de cambiarlas.

## Notas
- Cada subida usa una clave nueva; reemplazar un archivo borra el anterior.
- La URL de subida firma el tipo y el tamaño exactos del archivo, y al vincularlo el servidor
  comprueba su tamaño y sus primeros bytes (firma PDF/ZIP) antes de aceptarlo.
- Los archivos que ya estuvieran en Supabase Storage no se mueven solos: si los hay, se
  copian a R2 con la misma clave y la base de datos no cambia.
