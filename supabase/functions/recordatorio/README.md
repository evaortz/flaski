# Avisos con notificaciones

Dos avisos, que cada persona activa en **Ajustes → Avisos**:

- **Recordatorio diario**: una vez al día, a la hora que elige, si le tocan repasos o va a perder la racha.
- **Cuando alguien te anime**: al momento, cuando un amigo le manda ánimos.

Los dos llegan aunque la app esté cerrada (Web Push). En iPhone y iPad, solo si Flaski
está añadida a la pantalla de inicio (iOS 16.4 o posterior).

Se configura una sola vez:

## 1. La tabla

Ejecuta `supabase/schema.sql` en el **SQL Editor** de Supabase (es seguro repetirlo): crea `push_subs`.

## 2. Las claves VAPID

Son el par de claves con el que el servidor firma los avisos. Genéralas en tu ordenador:

```bash
npx web-push generate-vapid-keys
```

- La **pública** va en `js/config.js`: `export const VAPID_PUBLIC_KEY = '…';`
- La **privada** solo en Supabase (nunca en el repositorio).

## 3. La función

Con la [CLI de Supabase](https://supabase.com/docs/guides/cli) (`npx supabase login` y `npx supabase link`):

```bash
npx supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:tu@correo.com CRON_SECRET=una-clave-larga-al-azar
npx supabase functions deploy recordatorio
```

## 4. Que se lance cada 15 minutos

En **Database → Extensions**, activa `pg_cron` y `pg_net`. Después, en el SQL Editor (cambia `TU-PROYECTO`,
la clave anónima, que es la misma de `js/config.js`, y el `CRON_SECRET` del paso anterior):

```sql
select cron.schedule('flaski-recordatorio', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://TU-PROYECTO.supabase.co/functions/v1/recordatorio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer TU-CLAVE-ANONIMA',
      'x-cron-secret', 'TU-CRON-SECRET'),
    body := '{}'::jsonb)
$$);
```

Para comprobarlo: activa el recordatorio en Ajustes con una hora que esté a punto de llegar y mira
**Edge Functions → recordatorio → Logs** (cada llamada responde `{ sent, gone }`).
Para quitarlo: `select cron.unschedule('flaski-recordatorio');`

## 5. Avisar cuando alguien te anima

En **Database → Webhooks → Create a new hook**:

- Tabla `cheers`, evento **Insert**.
- Tipo **Supabase Edge Functions**, función `recordatorio`, método POST.
- Cabeceras: `Authorization: Bearer TU-CLAVE-ANONIMA` y `x-cron-secret: TU-CRON-SECRET`.

La función reconoce el ánimo por el cuerpo que manda el webhook (`{ type: "INSERT", table: "cheers", record }`)
y avisa en los dispositivos de quien lo recibe que lo tengan activado.
