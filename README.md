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
4. **Variables de entorno:**
   - `APOLLO_API_KEY` — tu key de Apollo.io
   - `DATABASE_URL` — conexión [Neon](https://neon.tech) (gratis, integración nativa con Vercel)
5. Deploy. La tabla `leads` se crea automáticamente en el primer request.
6. Verifica: `https://agente-ventas-three.vercel.app/api/health` debe responder `{"status":"ok",...}`.

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
cp .env.example .env.local
# Edita APOLLO_API_KEY y DATABASE_URL
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
