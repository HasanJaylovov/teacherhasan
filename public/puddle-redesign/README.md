# Teacher Hasan AI Puddle-style PWA preview

This is a responsive progressive web app preview, isolated from the production homepage.

- Main app: `index.html`
- Responsive styles: `styles.css`
- Existing backend chat API: `https://teacherhasan.uz/api/chat`
- Voice AI shortcut opens the existing live voice assistant at the site root.
- Reading and Listening practice pages include simple client-side checks.
- Installable PWA manifest and service-worker caching.

Preview URL after the branch is deployed/merged into the existing hosting service:
`https://teacherhasan.uz/puddle-redesign/`

GitHub Actions workflow validates JavaScript/manifest and packages the static app into a ZIP artifact.
