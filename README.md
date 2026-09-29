# Achkif Ceramica

Inventory and sales management for ceramic tile and zellij stock.

## Requirements

- Python 3.9 or newer
- Node.js 24 or newer with npm
- PostgreSQL for production (SQLite is used when `DATABASE_URL` is not set)

## Run locally

From the repository root:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

In another terminal:

```sh
export PATH="$HOME/.local/node-v24.21.0-darwin-x64/bin:$PATH"
cd frontend
npm install
npm run dev
```

Open the Vite URL shown by npm (normally `http://localhost:5173`). The frontend proxies `/api` and `/media` to Django on port 8000. Sign in with the superuser created by `createsuperuser`; it has the owner role. Additional role profiles can be assigned in Django admin.

## Install on devices

On a Mac, open the local app in Chrome and choose **Install Achkif Ceramica** from the address-bar install icon or browser menu. Safari can add the hosted site to the Dock.

For iPhone, the app must be deployed at an HTTPS address reachable by the phone. Open that address in Safari, tap **Share**, then **Add to Home Screen**. A `127.0.0.1` development address only refers to the device running the server, so it will not work from the iPhone. The service worker caches only the static app shell; inventory and account data remain online and are not cached offline.

## Database and environment

Copy `backend/.env.example` to `backend/.env` for local overrides. Keep real secrets out of source control. Set `DATABASE_URL` to a PostgreSQL URL in production, for example `postgresql://user:password@localhost:5432/achkif`. When `DJANGO_DEBUG=0`, provide a unique `DJANGO_SECRET_KEY`, production `DJANGO_ALLOWED_HOSTS`, and HTTPS origins for `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`.

Migrations seed the starter categories (Zellij, Ceramic, Porcelain, Decorative, Borders, Special pieces), sections (Wall, Floor / Taille, Decoration), and a Shop location. These can be extended in Settings.

## Verify

```sh
cd backend
python manage.py check
python manage.py test inventory
```

The frontend build can be checked with `cd frontend && npm run build`.