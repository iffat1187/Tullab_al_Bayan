# Tullab-al-Bayan

Ṭullāb al-Bayān is the Arabic language learning portal for Al Bayan Institute, built by Team Helium.

**Live portal** [Open Ṭullāb al-Bayān on Vercel](https://tullab-al-bayan.vercel.app/)

Sign in with an approved Google account to open your Student, Teacher, or Admin workspace.

## Workspaces

- **Student** — View your batch calendar, homework, attendance, tuition records, and bank or bKash payment instructions.
- **Teacher** — Record attendance, manage batch homework, and view class calendars.
- **Admin** — Manage the student roster, teacher access, class details, tuition, scholarships, and curriculum skill descriptions. Export institute records as a ZIP archive.

## Run locally

The frontend uses React, Vite, and Tailwind CSS. Supabase provides authentication and stores portal records. Follow the [Supabase and Google sign-in setup guide](frontend/AUTH_SETUP.md) to configure local access.

```sh
cd frontend
npm ci
npm run dev
```

Run `npm run build` from `frontend` to create a production build.

## Documentation

- [Database design](docs/DATABASE_DESIGN.md)
- [Technology stack](docs/TECH_STACK.md)
