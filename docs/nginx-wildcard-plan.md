# Nginx Wildcard Hosting Plan

Inspection only — the live config below was read from the EC2 instance (`/etc/nginx/conf.d/*.conf`) on 2026-06-27. **Not yet modified.**

## Current configuration (verbatim, as found)

```nginx
server {
    server_name tradeshow-agent.gtmtechsol.ai;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/tradeshow-agent.gtmtechsol.ai/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/tradeshow-agent.gtmtechsol.ai/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}
server {
    if ($host = tradeshow-agent.gtmtechsol.ai) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    server_name tradeshow-agent.gtmtechsol.ai;
    return 404; # managed by Certbot
}
```

There is exactly one active site config (plus the distro-default `_` catch-all in `sites-enabled`, unrelated and already disabled/commented for SSL).

## Required changes

### 1. `server_name` directive — both blocks

Change in **both** the `:443` and `:80` server blocks:

```nginx
# from
server_name tradeshow-agent.gtmtechsol.ai;

# to
server_name tradeshow-agent.gtmtechsol.ai *.tradeshow-agent.gtmtechsol.ai;
```

`proxy_set_header Host $host;` is already present — this is what allows `src/proxy.ts` (the app-level tenant resolver) to see the actual subdomain via the `Host` header rather than always seeing the proxy's own hostname. No change needed there; it was already written correctly for this.

### 2. The redirect block's `if ($host = ...)` check

```nginx
# from
if ($host = tradeshow-agent.gtmtechsol.ai) {
    return 301 https://$host$request_uri;
}

# to
if ($host ~ ^(.+\.)?tradeshow-agent\.gtmtechsol\.ai$) {
    return 301 https://$host$request_uri;
}
```

The current exact-string match would only force-HTTPS-redirect the apex domain; any subdomain hitting port 80 would fall through to the `return 404;` below it instead of being redirected to HTTPS. This needs to change from an exact match to a regex match covering the wildcard, or subdomains visited via plain `http://` will 404 instead of upgrading to HTTPS.

### 3. SSL certificate paths

Once the wildcard cert is issued (see `docs/wildcard-domain-review.md`), update:

```nginx
ssl_certificate /etc/letsencrypt/live/<new-cert-name>/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/<new-cert-name>/privkey.pem;
```

`<new-cert-name>` depends on how Certbot is invoked — if `--cert-name tradeshow-agent.gtmtechsol.ai` is passed explicitly during the wildcard cert request, it can overwrite the existing cert in place (recommended, avoids needing this path change at all). If invoked without `--cert-name`, Certbot will create a new directory (typically suffixed `-0001`) and this path must be updated manually.

### 4. No other changes needed

- `proxy_pass http://127.0.0.1:3000;` stays the same — all tenants are served by the same single app instance/container, distinguished entirely at the application layer (see `docs/tenant-auth-review.md`). This is correct for the current single-tenant-process architecture and requires no Nginx-level per-tenant routing.
- No new `location` blocks, no per-subdomain config needed — this is a single wildcard match feeding one backend, which is the simplest possible Nginx topology for this requirement.

## Validation after change

```sh
sudo nginx -t                    # syntax check before reload
sudo systemctl reload nginx      # reload, not restart — avoids dropping active connections
curl -s -o /dev/null -w "%{http_code}\n" https://demo.tradeshow-agent.gtmtechsol.ai/login
curl -s -o /dev/null -w "%{http_code}\n" http://demo.tradeshow-agent.gtmtechsol.ai/login   # should 301 to https
```

## Risk notes

- `nginx -t` before `reload` is mandatory — a typo in the regex or a missing semicolon takes down the **entire** site (apex included), not just the new wildcard behavior. Low risk if tested, but blast radius is total if skipped.
- Use `reload`, not `restart` — reload re-reads config without dropping the listening socket, avoiding a multi-second outage window that `restart` would cause.
- No changes to the `proxy_pass` target or upstream app are needed for this Nginx-layer work — this step is purely about which hostnames Nginx will accept and route to the existing backend.
