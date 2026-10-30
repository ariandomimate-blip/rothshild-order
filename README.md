# ROTHSHILD — Order of Light Community Platform

Responsive website + installable Progressive Web App (PWA) starter, with:
- Registration requests and login
- Pending/approved/rejected/suspended account states
- Roles: applicant, member, mentor, moderator, admin
- Separate onboarding and approved-member forum categories
- Forum post API with server-side access checks
- Admin member list and approval/role endpoint
- Admin mentor assignment endpoint; chat only after both parties accept
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
- Add verified-email flow, MFA/passkeys, password reset, account recovery, CSRF protection for cookie-authenticated state-changing routes, audit trails, backup/restore tests, monitoring, abuse reporting and retention/deletion workflows.
- Review rate limits, input validation, authorization tests, dependency scanning, penetration testing and privacy/legal requirements.
- Current chat API stores ciphertext only, but **does not implement end-to-end encryption or key exchange**. Do not use it for confidential messages until a vetted E2EE protocol (for example, a reviewed Signal-protocol implementation) and device/key verification are integrated and independently audited.
- PWA shell may work offline; private data and API responses are not cached.
- No official relationship with the Rothschild family or any historical organization is claimed. Historical content should be sourced and reviewed.
