# Render-Deployment — ROTHSHILD Order of Light

## Vor dem Deploy
1. ZIP entpacken.
2. Den gesamten Projektinhalt in ein neues, privates GitHub-Repository hochladen (nicht in ein öffentliches Repository, da die Plattform Benutzer-/Sicherheitslogik enthält).
3. In Render das richtige Team/Workspace auswählen und GitHub verbinden.
4. Im Render-Dashboard **New + → Blueprint** wählen und das Repository verbinden.
5. Render liest `render.yaml`: Web-Service in Frankfurt + PostgreSQL-Datenbank werden als Blueprint vorgeschlagen.
6. Blueprint prüfen und erstellen. Kostenpflichtige Ressourcen erst nach Prüfung bestätigen.

## Render-Variablen
`render.yaml` setzt:
- `NODE_ENV=production`
- `COOKIE_SECURE=true`
- `JWT_SECRET` wird von Render generiert
- `DATABASE_URL` wird aus der Render-Postgres-Instanz verbunden
- `APP_ORIGIN` wird als manuell zu setzende Variable offengelassen

Nach Bereitstellung zuerst die Render-URL testen. Danach `APP_ORIGIN` exakt auf die öffentliche Origin setzen, z. B. `https://DEIN-SERVICE.onrender.com` (ohne abschließenden Slash), speichern und neu deployen.

## Datenbankschema anwenden
Das Schema aus `server/schema.sql` muss einmal auf der Render-Datenbank ausgeführt werden:
1. Render → PostgreSQL → Connect → External/PSQL URL bzw. Dashboard Query Tool.
2. Inhalt von `server/schema.sql` ausführen.
3. Prüfen, dass Tabellen `users`, `forum_categories`, `forum_posts`, `mentor_assignments`, `conversations`, `conversation_members`, `messages` und `library_items` angelegt wurden.

## Erstes Administratorkonto
1. Über die Website registrieren.
2. Im Render-Dashboard die PostgreSQL-Verbindung öffnen und im SQL-Editor nur für die eigene, kontrollierte Admin-E-Mail ausführen:
   `UPDATE users SET role='admin', status='approved' WHERE email='DEINE-ADMIN-EMAIL';`
3. Anschließend neu anmelden. Keine Standard-Admin-Passwörter oder öffentliche Admin-Registrierung verwenden.

## Neue Domain
1. Zuerst einen freien Domainnamen bei einem Registrar auswählen und registrieren.
2. Render Web Service → Settings → Custom Domains → Add Custom Domain.
3. Gewünschten Hostnamen eintragen, z. B. `community.DEINE-DOMAIN.de`.
4. Die von Render angezeigten DNS-Einträge beim Registrar exakt eintragen (für Subdomain normalerweise CNAME; für Apex-Domain je nach Anbieter ALIAS/ANAME oder A/AAAA gemäß Render-Anzeige).
5. DNS-Propagation abwarten; Render stellt TLS-Zertifikat bereit.
6. Danach `APP_ORIGIN` auf `https://community.DEINE-DOMAIN.de` setzen und redeployen.
7. Domain mit HTTPS, `/api/health`, Registrierung, Login, Freigabe und Foren-Zugriff testen.

## Vor öffentlichem Start zwingend
- E-Mail-Verifikation und Passwort-Reset ergänzen.
- MFA/Passkeys und CSRF-Schutz für Cookie-authentifizierte Schreibaktionen ergänzen.
- Ende-zu-Ende-Verschlüsselung ist noch NICHT implementiert. Die Nachrichten-API speichert nur ein vom Client geliefertes `ciphertext`-Feld. Vor vertraulicher Nutzung muss ein geprüftes E2EE-Protokoll inklusive Schlüsselverwaltung und Geräteverifikation integriert und unabhängig auditiert werden.
- Datenschutz-/Impressumsangaben, Datenlöschung, Aufbewahrungsfristen, Backups, Monitoring, Missbrauchsmeldungen, Penetrationstest und Abhängigkeitsscans umsetzen.
- Erst nach Sicherheitsprüfung echte Mitglieder einladen.

## Workspace-Klärung
In den verbundenen Konten sind zwei Render-Workspaces verfügbar: `Workspace One` und `My Workspace`. Vor dem Anlegen von Diensten muss der gewünschte Workspace ausgewählt werden. Auch bei GitHub sind zwei verbundene Konten vorhanden; das Zielkonto/Repository muss vor dem Push festgelegt werden.
