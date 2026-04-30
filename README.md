# הסטקייה בסומסום — full source backup

This is a 1:1 mirror of the working `sumsum/` development project: HTML/CSS/JS frontend at the root and an Express backend in `server/`.

It is **not** structured for cloud deployment — for Railway, see the sister repo `sumsum-railway`.

## Layout

```
.
├── index.html              # public site
├── styles.css
├── script.js
├── manage-grill.html       # hidden admin panel
├── manage-grill.css
├── manage-grill.js
└── server/
    ├── server.js           # Express API + static server
    ├── package.json
    ├── data/
    │   ├── site.json       # editable site content
    │   └── admin.json      # admin username + bcrypt hash
    └── uploads/            # gallery uploads
```

## Run locally

```bash
cd server
npm install
npm start
# open http://localhost:3000
# admin → http://localhost:3000/manage-grill
```

## Default credentials

`admin` / `sumsum2025` — change immediately by logging in and using the "אבטחה" panel.

## Security features

- JWT auth + bcrypt-hashed admin password (12 h tokens)
- `helmet` security headers
- Rate limiting on login (8 / 15 min) and password change (5 / hr)
- HTTPS redirect when NODE_ENV=production
- File upload extension + MIME allowlist, 8 MB cap
