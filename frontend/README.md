# Frontend – AI-API Store Hub

The original login page React artifact lives here.

## Current

- Clean mobile-first login / branding for **AI-API STORE HUB**
- Email + password form with validation
- Show/hide password
- Success / error states

## Next steps

1. Connect the form to `POST /auth/login` and `POST /auth/register` on the Worker.
2. Store the returned JWT + API key securely.
3. Build dashboard pages: keys, usage, billing, model playground, GitHub connect.

You can drop the provided `Login Page .html` (or convert it to a Vite + React project) into this folder and wire the API base URL to your deployed Worker.
