# ROTHSHILD — Order of Light Community Platform

Responsive website + installable Progressive Web App (PWA) starter, with:
- Registration requests and login
- Pending/approved/rejected/suspended account states
- Roles: applicant, member, mentor, moderator, admin
- Separate onboarding and approved-member forum categories
- Forum post API with server-side access checks
- Admin member list and approval/role endpoint
- Admin mentor assignment endpoint; private messaging is currently disabled pending vetted end-to-end encryption
- Knowledge library API
- PostgreSQL schema
- PWA manifest and service worker

## Run locally
1. Install Node.js 20+ and PostgreSQL.
2. Create a database, then apply `server/schema.sql`.
3. `cp .env.example .env` and set `DATABASE_URL`, `JWT_SECRET` (32+ random bytes) and `APP_ORIGIN`.
4. `npm install`
5. `npm start`
6. Open `http://localhost:3000`.

## First administrator
For safety, no default admin password or public admin bootstrap route is included. Create the first account through registration, then promote it directly in PostgreSQL from a trusted admin shell:
```sql
UPDATE users SET role='admin', status='approved' WHERE email='your-controlled-admin@email.example';
```
Never expose database credentials.

## Production security — mandatory before real member data
This is a deployable starter, not a completed security certification:
- Deploy only behind HTTPS; set `NODE_ENV=production`, `COOKIE_SECURE=true`, a unique random `JWT_SECRET`, strict `APP_ORIGIN`, and PostgreSQL TLS.
- Email verification, MFA/passkeys, password reset, and secure account recovery are not implemented yet. Do not enable real member accounts until these flows are integrated with a verified email provider and tested.
- A minimal admin account-change audit log is now present. Add retention controls, alerting, and broader event coverage before production use.
- Configure automated encrypted PostgreSQL backups and perform restore drills; verify monitoring, abuse reporting, and retention/deletion workflows.
- Review rate limits, input validation, authorization tests, dependency scanning, penetration testing and privacy/legal requirements.
- Private chat API endpoints now fail closed with HTTP 503. There is no deployed end-to-end encryption or key verification. Do not advertise private messaging as available until a vetted E2EE protocol, device/key verification, and independent audit are completed.
- PWA shell may work offline; private data and API responses are not cached.
- No official relationship with the Rothschild family or any historical organization is claimed. Historical content should be sourced and reviewed.
