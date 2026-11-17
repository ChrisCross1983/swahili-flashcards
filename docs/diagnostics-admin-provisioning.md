# Ersten Health-Center-Admin provisionieren

Die Admin-Mitgliedschaft liegt ausschließlich in `public.app_admin_members`. Der Browser hat auf diese Tabelle keine Rechte. Es gibt keine Selbstverwaltung in der App.

Nach Deployment der Diagnostics-Security-Migration und einem erfolgreichen Datenbank-Sicherheitstest:

1. Auth-User-ID des vorgesehenen Administrators über die vertrauenswürdige Supabase-Admin-Oberfläche ermitteln und unabhängig verifizieren.
2. Mit einem privilegierten, kontrollierten Datenbankzugang zunächst lesend prüfen:

```sql
select id, email from auth.users where id = :admin_user_id::uuid;
select user_id, enabled, granted_at, revoked_at from public.app_admin_members
where user_id = :admin_user_id::uuid;
```

3. Nach separater Freigabe diesen User gezielt provisionieren (kein automatischer Deploy-Schritt):

```sql
insert into public.app_admin_members (user_id, enabled, granted_by)
values (:admin_user_id::uuid, true, :admin_user_id::uuid)
on conflict (user_id) do update
set enabled = true, revoked_at = null;
```

`granted_by` kann beim ersten Admin auf dieselbe verifizierte User-ID zeigen. Spätere Änderungen sollten von einem bestehenden Admin oder einem kontrollierten Betriebszugang vorgenommen und außerhalb der App protokolliert werden. Keine E-Mail-Allowlist oder Client-Claims ersetzen die Tabellenprüfung.

## Zugriff entziehen

Auch das erfolgt ausschließlich über einen kontrollierten, privilegierten Datenbankzugang und erst nach Prüfung der betroffenen Auth-UUID. Die App bietet keine Admin-Selbstverwaltung.

```sql
update public.app_admin_members
set enabled = false, revoked_at = now()
where user_id = :admin_user_id::uuid and enabled = true;
```

Danach lesend kontrollieren, dass `enabled = false` und `revoked_at` gesetzt ist. Ein deaktivierter Admin erhält bei jeder neuen Admin-API-Anfrage 403. Eine bereits offene Health-Center-Seite kann noch zuvor geladene Daten im Browser anzeigen; deshalb bei einem dringenden Entzug zusätzlich die Auth-Session des Users über den vertrauenswürdigen Auth-Admin-Weg widerrufen. Diese SQL-Beispiele sind Dokumentation und werden nicht automatisch ausgeführt.
