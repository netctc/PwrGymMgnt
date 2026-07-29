# PowerGym online installation

The installer supports Windows and Linux from the same Node.js entry point.

## Prerequisites

- Node.js 22 and npm 10 or later.
- MySQL 8 or a compatible managed MySQL service.
- Database variables configured in `.env` or the process environment.
- Administrator/root privileges when automatic startup services are required.
- A domain, public IP address, or complete public base URL.

Required database variables:

```env
DATABASE_HOSTNAME=db-host
DATABASE_PORT=3306
DATABASE_USER_NAME=powergym
DATABASE_PASSWORD=strong-password
DATABASE_NAME=powergym
```

## Linux

Domain with HTTPS:

```bash
sudo npm run install:online -- -l --domain gym.example.com
```

Complete URL:

```bash
sudo npm run install:online -- -l --base-url https://gym.example.com
```

The installer creates:

- `powergym.service`
- `powergym-health.service`
- `powergym-health.timer`

## Windows

Run Command Prompt or PowerShell as Administrator:

```bat
npm run install:online -- -w --domain gym.example.com
```

IP-only internal installation:

```bat
npm run install:online -- -w --ip 10.0.0.8 --port 3000
```

The installer creates a startup task named `PowerGym` and a health task named
`PowerGym-Health`. The service runner restarts the Node process if it stops.

## Safe preview

The dry run validates arguments and shows every installation action without
modifying `.env`, the database, services, or scheduled tasks:

```bash
npm run install:online -- -l --domain gym.example.com --dry-run
```

```bat
npm run install:online -- -w --ip 10.0.0.8 --port 3000 --dry-run
```

## Installation sequence

1. Configure public URLs and security settings.
2. Install locked dependencies with `npm ci`.
3. Apply all numbered SQL migrations.
4. Verify or create the two required administrator accounts.
5. Build the client and server.
6. Validate deployment environment variables.
7. Install automatic startup and health monitoring.

Required accounts:

- `admin@powergym.local`
- `super_admin@powergym.local`

Both are created only when absent. Their initial password is `Ab.654321` and is
stored as a scrypt hash. Change both passwords immediately after first login.

## Monitoring

The monitor calls `/api/health` every five minutes. Failures are written to the
service/task log. To forward alerts to an external system, configure:

```env
INSTALL_ALERT_WEBHOOK_URL=https://alerts.example.com/powergym
INSTALL_MONITOR_TIMEOUT_MS=8000
```

## Security notes

- Prefer HTTPS for both domains and IP addresses.
- HTTP/IP mode sets `SESSION_COOKIE_SECURE=false` so authentication works on a
  trusted internal network. Do not expose that mode directly to the internet.
- Set the firewall to expose only the intended reverse proxy or application
  port.
- Keep MySQL private and never expose port 3306 publicly.
