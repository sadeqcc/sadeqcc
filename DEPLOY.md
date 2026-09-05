# Deploying GOLD ORDERS

The app needs a server and a database. This guide gets it onto a permanent URL you can open on
your phone and add to your home screen. Everything below can be done from a phone browser.

**Total time: about 10 minutes. Both services have a free tier that fits a single shop.**

---

## Step 1 — Create the database (Turso)

The app stores everything in SQLite. On a hosted server the local file cannot survive, so use
Turso, which is the same SQLite over the network.

1. Go to **https://turso.tech** and sign in with GitHub.
2. Create a database — any name, e.g. `gold-orders`. Pick the region closest to Dubai.
3. Open the database and copy two things:
   - the **database URL**, which looks like `libsql://gold-orders-yourname.turso.io`
   - a **token** (create one from the database's tokens screen)

Keep both. You paste them in the next step and never anywhere else.

## Step 2 — Create a session secret

This signs the login cookie. It must be long and random — do not reuse a password.

On a phone, tap and hold to copy this, then change a dozen characters at random:

```
change-me-9f3a7c21b4e8d05a6c19f2b7e4a83d1c
```

On a computer you can generate a proper one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 3 — Deploy (Vercel)

1. Go to **https://vercel.com/new** and sign in with GitHub.
2. Import the repository **`sadeqcc/sadeqcc`**.
3. Before deploying, open **Environment Variables** and add three:

   | Name | Value |
   |---|---|
   | `AUTH_SECRET` | the secret from step 2 |
   | `DATABASE_URL` | the `libsql://…` URL from step 1 |
   | `DATABASE_AUTH_TOKEN` | the token from step 1 |

4. Press **Deploy**, and wait for the build.

### Point Vercel at the right branch

The app lives on the branch `claude/gold-orders-app-mwqjk6`. If Vercel deployed a different
branch, open the project's **Settings → Git → Production Branch**, set it to
`claude/gold-orders-app-mwqjk6`, and redeploy from the **Deployments** tab.

Alternatively, merge that branch into the repository's default branch and Vercel will pick it up
on its own.

## Step 4 — Open it and create the owner account

Open the URL Vercel gives you. The first screen asks you to create the shop account — **the first
account created owns the shop**, so make it yours. Staff are added afterwards from
**Settings → Staff**.

## Step 5 — Put it on the home screen

- **iPhone (Safari):** Share → *Add to Home Screen*
- **Android (Chrome):** menu → *Install app*

It then opens full-screen like a normal app, keeps recent orders readable without a connection,
and queues anything you enter offline until the connection returns.

---

## After it is live

**Set a security PIN** — Settings → Security PIN. It is required to delete a payment or restore a
backup, so set it before anyone else uses the app.

**Fill in your shop details** — Settings → Shop: name, phone, address. They appear on printed
receipts and job sheets.

**Adjust the defaults** — Settings: order-number prefix, karats, styles, categories, payment
methods, destinations, default weight tolerance and VAT.

**Take a backup regularly** — Settings → Backup → *Download full backup*. It is a single JSON file
containing every order, payment, photo and audit entry. A restore validates the whole file before
it touches anything you already have.

---

## Running it on your own computer instead

No hosting, no accounts — the database is a file on that machine.

```bash
git clone -b claude/gold-orders-app-mwqjk6 https://github.com/sadeqcc/sadeqcc.git
cd sadeqcc
npm install
printf 'AUTH_SECRET=%s\n' "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" > .env.local
npm run dev
```

Open `http://localhost:3000`. The database is written to `data/gold-orders.db` — back that file up
and you have backed up everything.

---

## Troubleshooting

**The build fails on `better-sqlite3`.** It is an optional dependency and is only used for a local
file database, so a hosted deploy does not need it. Confirm `DATABASE_URL` starts with `libsql://`.

**"AUTH_SECRET is required in production".** The variable is missing or shorter than 16 characters.
Add it in Vercel's environment variables and redeploy.

**The login screen asks to create an account again after deploying.** The database is empty — that
is expected on a fresh database. If you already had data, check that `DATABASE_URL` points at the
right Turso database.

**Photos make the backup file large.** Use *Download backup without photos* for a quick copy; the
full backup is the one to keep for safety.
