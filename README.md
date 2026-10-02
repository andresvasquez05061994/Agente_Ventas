# Agente Ventas B2B — IAC

Plataforma de prospección y gestión de leads (Fase 1).

## Estructura

| Carpeta | Descripción |
|---------|-------------|
| `web/` | **App Next.js** — desplegar en Vercel |
| `assets/logos/` | Logos fuente (copiados a `web/public/logos/`) |
| `app.py`, `ui/` | Versión Streamlit legacy (local) |

## Despliegue en Vercel (recomendado)

1. **Sube el repo a GitHub** (ver abajo).
2. En [vercel.com](https://vercel.com) → **Add New Project** → importa el repo.
3. **Root Directory:** `web`
4. **Variables de entorno** (Production y Preview). Los valores no van al repositorio.
   - `APOLLO_API_KEY` — tu key de Apollo.io
   - `DATABASE_URL` — conexión [Neon](https://neon.tech) (gratis, integración nativa con Vercel)
   - `AUTH_SECRET` — firma la sesión (obligatoria)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS` y/o `ALLOWED_EMAIL_DOMAINS` — acceso con Google
   - `TEAM_PASSWORD` — contraseña de respaldo (opcional; el formulario solo aparece si está definida)
   - `APOLLO_WEBHOOK_SECRET` — para recibir teléfonos de Apollo
   - `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` — para el webhook de Meta
5. **Redeploy** después de guardar las variables. Un deployment ya activo no las toma solo.
6. La tabla `leads` se crea automáticamente en el primer request autenticado.
7. Verifica la sonda pública: `https://agente-ventas-three.vercel.app/api/health` debe responder `{"status":"ok",...}`. El resto de `/api/*` de datos responde 401 hasta iniciar sesión en `/login`.

### Acceso del equipo (después de merge)

La app es privada. Cada página y cada ruta que lee o modifica leads exige una sesión. Pasos en Vercel, en este orden:

1. En tu máquina, genera secretos y **no** los pegues en git:

   ```bash
   openssl rand -base64 32   # AUTH_SECRET (mínimo 32 caracteres)
   openssl rand -base64 24   # TEAM_PASSWORD (mínimo 12; puede ser una frase)
   openssl rand -hex 32      # APOLLO_WEBHOOK_SECRET (mínimo 16)
   openssl rand -hex 16      # WHATSAPP_VERIFY_TOKEN (lo eliges tú; mínimo 8)
   ```

   `WHATSAPP_APP_SECRET` no se genera: es el **App Secret** de Meta (App Dashboard → Settings → Basic).

2. Vercel → proyecto **agente-ventas** → **Settings → Environment Variables**.
3. Crea `AUTH_SECRET`, `APOLLO_WEBHOOK_SECRET`, `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` para **Production** y **Preview**. `TEAM_PASSWORD` es el respaldo opcional. Las de Google están en la sección siguiente.
4. **Deployments → ⋯ del último deployment → Redeploy**. Sin este paso el sitio sigue en la versión anterior.
5. Abre `https://agente-ventas-three.vercel.app`. Debe ir a `/login`. Si dejaste `TEAM_PASSWORD`, puedes entrar con ella mientras configuras Google.
6. Meta → WhatsApp → Configuration → Webhook:
   - Callback URL: `https://agente-ventas-three.vercel.app/api/whatsapp/webhook`
   - Verify token: el mismo `WHATSAPP_VERIFY_TOKEN`
   - El App Secret de esa app debe ser el mismo `WHATSAPP_APP_SECRET`
7. No cambies una URL a mano en Apollo. En cada enriquecimiento la app envía `webhook_url` con `?token=`. Las entregas que Apollo ya haya encolado hacia la URL antigua (sin token) serán rechazadas.

### Acceso con Google

El botón **Continuar con Google** aparece si hay `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`. La app comprueba en el servidor que el correo esté en `ALLOWED_EMAILS` o que su dominio esté en `ALLOWED_EMAIL_DOMAINS`, y que Google lo tenga verificado. Una cuenta fuera de la lista vuelve a `/login` con un mensaje claro y no recibe sesión. Quitar un correo de la lista invalida su sesión en la siguiente petición. Los webhooks de WhatsApp y Apollo no piden login de Google.

`TEAM_PASSWORD` sigue siendo un acceso de respaldo: el formulario solo se muestra si esa variable tiene al menos 12 caracteres. Quien conozca la contraseña entra aunque su correo no esté en la lista. Cuando el equipo ya entre con Google, puedes borrar `TEAM_PASSWORD` y redesplegar.

1. Entra en [Google Cloud Console](https://console.cloud.google.com/) y crea o elige un proyecto.
2. **APIs y servicios → Pantalla de consentimiento de OAuth**.
   - Si el equipo usa Google Workspace, elige **Interno**. Solo podrán intentar el login las cuentas de esa organización; la lista blanca de la app sigue aplicando.
   - Si eliges **Externo**, deja la app en **Pruebas** y añade en **Usuarios de prueba** cada correo que vaya a entrar. En Pruebas, Google rechaza a quien no esté en esa lista aunque tu `ALLOWED_EMAILS` lo permita.
   - Nombre de la app: `Agente Ventas IAC`. Correo de asistencia: el tuyo.
   - Alcances: `openid`, `email` y `profile` (vienen con el inicio de sesión; no son alcances sensibles).
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**. Nombre: `Agente Ventas`.
4. **Orígenes autorizados de JavaScript** (sin ruta, sin barra final):
   - `https://agente-ventas-three.vercel.app`
   - `http://localhost:3000`
   - cada preview que uses, por ejemplo `https://agente-ventas-git-tu-rama-tu-equipo.vercel.app`
5. **URI de redirección autorizados** (exactos; Google no admite comodines):
   - `https://agente-ventas-three.vercel.app/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback`
   - `https://<host-del-preview>.vercel.app/api/auth/google/callback` para cada deployment de preview
   - Si más adelante usas un dominio propio: `https://<tu-dominio>/api/auth/google/callback` y el origen `https://<tu-dominio>`
6. Copia el **ID de cliente** y el **secreto** a Vercel como `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (Production y Preview). No los subas a git.
7. En las mismas pantallas de Vercel define al menos una lista:
   - `ALLOWED_EMAILS` = `ana@empresa.com,luis@empresa.com`
   - `ALLOWED_EMAIL_DOMAINS` = `empresa.com` (sin `@`; entra cualquiera de ese dominio con correo verificado)
8. **Deployments → Redeploy.** Guardar la variable no actualiza el deployment que ya está publicado.
9. Abre `/login`, pulsa **Continuar con Google** y elige la cuenta del equipo. Una cuenta de Gmail que no esté en la lista debe ver el aviso de que no está autorizada.

### Neon (base de datos)

1. Crea un proyecto en [neon.tech](https://neon.tech).
2. Copia la **connection string** (modo *pooled* recomendado para serverless).
3. Pégala en Vercel como `DATABASE_URL` (Production + Preview si aplica).

## Uso de Apollo API (cumplimiento)

Esta plataforma usa Apollo **solo para prospección interna** del equipo IAC, conforme a los Términos de la API (ago. 2024):

| Requisito | Cómo lo cumplimos |
|-----------|-------------------|
| Uso comercial interno (§2) | App privada del equipo, no producto público |
| Credenciales confidenciales (§7) | `APOLLO_API_KEY` solo en variables de entorno (Vercel / `.env.local`) |
| No exceder límites (§4) | Máx. 25 resultados por búsqueda; manejo de error 429 |
| No sublicenciar ni redistribuir API (§2–3) | La key no se expone al navegador; llamadas solo desde rutas `/api/*` del servidor |
| No competir con Apollo (§5) | Herramienta de gestión de leads propia, no réplica de Apollo |

## Desarrollo local (Next.js)

```bash
cd web
cp ../.env.example .env.local
# Edita APOLLO_API_KEY, DATABASE_URL, AUTH_SECRET y TEAM_PASSWORD
npm install
npm run dev
```

Abre http://localhost:3000

## GitHub — crear repositorio

```bash
git add .
git commit -m "feat: plataforma Next.js Fase 1 + legacy Streamlit"
git branch -M main
git remote add origin https://github.com/andresvasquez05061994/Agente_Ventas.git
git push -u origin main
```

## Logos

Coloca en `assets/logos/` y copia a `web/public/logos/`:

- `logo-iac.png` — modo claro
- `logo-iac-white.png` — modo oscuro

## Fases

1. ✅ Plataforma de Leads (Next.js + Apollo + Neon)
2. ⬜ Configuración avanzada BD
3. ⬜ Agente WhatsApp + Mistral
