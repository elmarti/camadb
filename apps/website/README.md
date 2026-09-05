# CamaDB public website

The Next.js App Router site for the open-source CamaDB database. It is a static
export, so GitHub Pages hosts it without a production Node.js process. The
separately built local knowledge demo is copied to `/demo/index.html` during production
builds.

```sh
yarn workspace @camadb/knowledge-demo build
yarn workspace @camadb/website dev
```

Use `CAMADB_BASE_PATH=/camadb yarn build` to reproduce the GitHub Pages build.
The public site intentionally covers the database project only. Paid services
and their account or network features belong to a separate product and site.
