# OpenNext Starter

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Read the documentation at https://opennext.js.org/cloudflare.

## Develop

Run the Next.js development server:

```bash
npm run dev
# or similar package manager command
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Preview

Preview the application locally on the Cloudflare runtime:

```bash
npm run preview
# or similar package manager command
```

## Deploy

Deploy the application to Cloudflare:

```bash
npm run deploy
# or similar package manager command
```

## Authentication & Database

GitHub sign-in is now available out of the box. To enable it locally and in Cloudflare, complete these steps:

1. [Register a GitHub OAuth app](https://github.com/settings/developers) with the callback URL `https://<your-domain>/auth/github/callback` (or `http://localhost:3000/auth/github/callback` for local testing).
2. Store the following secrets so the Worker can read them at runtime:
	- `GITHUB_CLIENT_ID`
	- `GITHUB_CLIENT_SECRET`
	- `AUTH_JWT_SECRET` (any sufficiently long random string, used to sign access/refresh tokens)
	You can add them via `wrangler secret put <NAME>` or the dashboard. When running `npm run dev`, regular environment variables work as well.
3. Apply the latest D1 migrations so the new `users` table exists:

```bash
wrangler d1 migrations apply ai-gallery --remote
# or run the command without --remote against your local DB binding
```

### Auth API overview

The client now communicates with the API defined by `NEXT_PUBLIC_API_URL` via `buildApiUrl()`:

- `GET /auth/github` — redirects the popup window to GitHub using the provided `redirectTo` callback URL.
- `POST /auth/github/token` — exchanges the OAuth `code` for access/refresh tokens and the initial user payload.
- `GET /users/me` — returns the current user when a valid `Authorization: Bearer <accessToken>` header is supplied.
- `POST /auth/token` — refreshes the access/refresh token pair when a valid refresh token is still active.

The built-in UI now opens GitHub in a popup and writes the returned tokens to `localStorage`, so no first-party cookies are required.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
