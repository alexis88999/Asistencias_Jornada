# Asistencias

Registro de asistencia para conferencias y talleres de la Jornada de Sistemas Computacionales.

## Publicar

1. Sube el proyecto a un repositorio privado de GitHub y conéctalo a Render o Railway.
2. En las variables del servicio configura `SUPABASE_URL`, `SUPABASE_SECRET_KEY` y `ADMIN_PASSWORD`. Usa una contraseña larga y única para administración. No publiques los secretos.
3. Espera a que termine el despliegue y abre la URL pública HTTPS del servicio. En Railway se usa `RAILWAY_PUBLIC_DOMAIN` para construir el enlace público y el QR; Render detecta su dominio automáticamente.
4. Abre `https://<dominio>/admin` para gestionar registros. El usuario es `admin`; usa el valor de `ADMIN_PASSWORD`.
5. Desde la administración, abre **Imprimir código QR** o visita `https://<dominio>/qr`.

El formulario público está en la raíz del dominio. La consulta de registros, la exportación CSV y la eliminación requieren autenticación de administrador. Los datos se guardan únicamente en Supabase; no se necesita configurar un volumen, `DATA_FILE` ni almacenamiento local.

## Usar Supabase

La aplicación requiere la tabla `public.asistencias` creada en Supabase. Configura estas variables en el servicio (en Render: **Environment**):

- `SUPABASE_URL`: URL del proyecto Supabase (Project Settings → API).
- `SUPABASE_SECRET_KEY`: clave secreta de servidor del proyecto (Settings → API Keys). No la pongas en `index.html`, no la compartas ni la subas a GitHub.
- `ADMIN_PASSWORD`: contraseña de la administración.

Guarda los cambios y espera a que termine el despliegue. Si falta `SUPABASE_URL` o `SUPABASE_SECRET_KEY`, el servidor no inicia. Las operaciones de registrar, listar, exportar y eliminar usan exclusivamente Supabase. Los registros que estén en archivos JSON locales no se migran automáticamente; impórtalos y confirma que estén en la tabla antes de dejar de respaldarlos.

Para ejecutar localmente, instala dependencias con `npm install`, configura las mismas variables de entorno y ejecuta `npm start`. El QR imprimible requiere una URL pública HTTPS.
