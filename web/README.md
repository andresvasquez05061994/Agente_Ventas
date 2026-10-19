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
APOLLO_WEBHOOK_BASE_URL=https://tu-dominio.vercel.app
ADMIN_EMAIL=...           # administrador global; obligatorio en Vercel
ADMIN_PASSWORD=...        # mínimo 8; si está, se actualiza en cada arranque
APP_PASSWORD=...          # contraseña inicial del admin solo si ADMIN_PASSWORD no está
AUTH_SECRET=...           # firma de sesión; genera una cadena larga
# Tope Apollo de la app: 2500 créditos, se reinicia cada mes (UTC).
# Configuración puede cambiarlo solo para el mes en curso.
```

En producción cada persona entra con su correo y contraseña. Una cuenta nueva queda pendiente hasta que el administrador la apruebe en Usuarios. Los webhooks de Apollo y WhatsApp no usan esa sesión: van con `?token=` (Apollo lo añade solo) o header `x-webhook-secret`.

Apollo requiere **créditos activos** para `people/bulk_match` (email y teléfono).

El esquema se aplica con migraciones versionadas (`schema_migrations`) en el primer request. Los teléfonos se guardan en E.164 para emparejar WhatsApp.

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

## Criterios de cierre Fase 1

- [x] Prospección Apollo con filtros validados y solo contactos con email + teléfono
- [x] Portafolio CRUD, estados, notas, filtros, export CSV
- [x] Resumen con métricas
- [x] Panel de conversaciones WhatsApp (bandeja unificada, polling 4 s)
- [x] Persistencia Neon + despliegue Vercel
- [ ] Créditos Apollo operativos en producción (dependencia externa)
- [ ] Logos IAC en `public/logos/` (opcional visual)

Fase 3 (envío automático WhatsApp + Mistral) requiere conectar Meta/Twilio y activar el worker. Los mensajes entrantes ya se registran en `POST /api/whatsapp/webhook`.
