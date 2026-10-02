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
   - `AUTH_SECRET` y `TEAM_PASSWORD` — acceso del equipo (obligatorias; sin ellas la app no muestra datos)
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
3. Crea `AUTH_SECRET`, `TEAM_PASSWORD`, `APOLLO_WEBHOOK_SECRET`, `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` para **Production** y **Preview**.
4. **Deployments → ⋯ del último deployment → Redeploy**. Sin este paso el sitio sigue en la versión anterior.
5. Abre `https://agente-ventas-three.vercel.app`. Debe ir a `/login`. Entra con `TEAM_PASSWORD`.
6. Meta → WhatsApp → Configuration → Webhook:
   - Callback URL: `https://agente-ventas-three.vercel.app/api/whatsapp/webhook`
   - Verify token: el mismo `WHATSAPP_VERIFY_TOKEN`
   - El App Secret de esa app debe ser el mismo `WHATSAPP_APP_SECRET`
7. No cambies una URL a mano en Apollo. En cada enriquecimiento la app envía `webhook_url` con `?token=`. Las entregas que Apollo ya haya encolado hacia la URL antigua (sin token) serán rechazadas.

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
