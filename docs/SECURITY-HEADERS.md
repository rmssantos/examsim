# Production security headers

The HTML pages include a meta CSP so local and static use gets a baseline policy.
The current GitHub Pages deployment does not configure HTTP response headers, so
the production edge should add the headers below before account, sync, or paid
content APIs are introduced.

## Recommended baseline

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.applicationinsights.azure.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

Add `Strict-Transport-Security` only at an HTTPS-only edge that controls every
subdomain in scope. Do not add `includeSubDomains` or `preload` without a
separate domain review.

## Rollout

1. Put the existing static site behind an edge that supports response headers.
2. Deploy the baseline to a preview environment.
3. Run `npm run test:browser` and inspect browser CSP errors.
4. Verify headers with `curl -I https://preview.example/`.
5. Promote to production and monitor CSP violations before tightening
   `style-src`.

The next CSP improvement is removing runtime inline style assignments so
`style-src 'unsafe-inline'` can also be removed. Script policies on the three
primary application pages already reject arbitrary inline JavaScript.
