# Agente Ventas IAC — Web (Fase 1)

Plataforma B2B de prospección con Apollo.io y gestión de leads en Neon PostgreSQL.

**Producción:** https://agente-ventas-three.vercel.app

## Módulos (Fase 1)

| Módulo | Ruta | Funcionalidad |
|--------|------|---------------|
| Prospección | `/prospeccion` | Búsqueda Apollo, enriquecimiento email/teléfono, guardado en portafolio |
| Portafolio | `/portafolio` | Filtros, estados, notas, export CSV, eliminación individual/masiva |
| Resumen | `/resumen` | KPIs Apollo y pipeline de leads |
| **Conversaciones** | `/conversaciones` | Bandeja WhatsApp en tiempo casi real (inbox + hilo + detalle lead) |

## Variables de entorno

```env
DATABASE_URL=postgresql://...
APOLLO_API_KEY=...
APOLLO_WEBHOOK_BASE_URL=https://tu-dominio.vercel.app   # opcional; en Vercel usa VERCEL_URL
AUTH_SECRET=                # openssl rand -base64 32   (mínimo 32)
TEAM_PASSWORD=              # openssl rand -base64 24   (mínimo 12)
APOLLO_WEBHOOK_SECRET=      # openssl rand -hex 32      (mínimo 16)
WHATSAPP_APP_SECRET=        # App Secret de Meta        (mínimo 16)
WHATSAPP_VERIFY_TOKEN=      # token que eliges tú       (mínimo 8)
```

Copia desde la raíz del repo: `cp ../.env.example .env.local`.

Apollo requiere **créditos activos** para `people/bulk_match` (email y teléfono).

### Acceso y webhooks (Vercel, después de merge)

Sin `AUTH_SECRET` y `TEAM_PASSWORD` la app no abre datos: las páginas van a `/login` y las APIs de leads responden 401 o 503. No hace falta tocar la base de datos.

1. Genera los valores (no los subas a git):

   ```bash
   openssl rand -base64 32   # AUTH_SECRET
   openssl rand -base64 24   # TEAM_PASSWORD
   openssl rand -hex 32      # APOLLO_WEBHOOK_SECRET
   openssl rand -hex 16      # WHATSAPP_VERIFY_TOKEN
   ```

   `WHATSAPP_APP_SECRET` se copia de Meta → App Dashboard → Settings → Basic → App Secret.

2. Vercel → proyecto → **Settings → Environment Variables**. Añade las cinco variables en **Production** y **Preview**.
3. **Deployments → Redeploy** del deployment que quieras actualizar. Guardar la variable no redespliega solo.
4. Entra en `/login` con `TEAM_PASSWORD`. La sesión dura 7 días (cookie `av_session`, HttpOnly).
5. En Meta, webhook Callback URL `https://agente-ventas-three.vercel.app/api/whatsapp/webhook` y el mismo verify token. Los `POST` sin `X-Hub-Signature-256` válido se rechazan.
6. El webhook de teléfonos de Apollo lleva `?token=` armado por el servidor. No lo construyas en el navegador. Llamadas ya encoladas sin ese token fallan con 401.

Los scripts `test:platform`, `test:mistral` y `test:apollo` siguen apuntando a producción. Si defines `TEAM_PASSWORD` en el entorno, envían la cookie de sesión. No los ejecutes contra producción si no quieres modificar datos reales.

## Desarrollo

```bash
cd web
npm install
npm run dev
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor local |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run test:apollo` | Prueba manual de integración Apollo |
| `npm run test:auth` | Sesión del equipo, firma de WhatsApp y cobertura de rutas |

## Criterios de cierre Fase 1

- [x] Prospección Apollo con filtros validados y solo contactos con email + teléfono
- [x] Portafolio CRUD, estados, notas, filtros, export CSV
- [x] Resumen con métricas
- [x] Panel de conversaciones WhatsApp (bandeja unificada, polling 4 s)
- [x] Persistencia Neon + despliegue Vercel
- [ ] Créditos Apollo operativos en producción (dependencia externa)
- [ ] Logos IAC en `public/logos/` (opcional visual)

Fase 3 (envío automático WhatsApp + Mistral) requiere conectar Meta/Twilio y activar el worker. Los mensajes entrantes ya se registran en `POST /api/whatsapp/webhook`.
