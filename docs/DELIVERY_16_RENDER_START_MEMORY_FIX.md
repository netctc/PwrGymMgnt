# Delivery 16 - Render Start Command and Memory Fix

## Problem observed on Render

The latest Render deploy log showed that Render was running `npm run render:build` during the deploy/start phase. Because that command builds the application instead of starting the HTTP server, Render could not detect an open port and eventually failed the deployment.

The same log also showed a Vite build memory failure on the Render instance:

- `No open ports detected`
- `Running 'npm run render:build'`
- `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`

## Fixes included

1. Clarified Render commands in `render.yaml`:
   - Build Command: `npm run render:build`
   - Pre-Deploy Command: `npm run render:predeploy`
   - Start Command: `npm run render:start`

2. Changed `render:start` to run only the production server:
   - `node dist/server.cjs`

3. Added a lighter Render build:
   - `build:render` uses a controlled heap and disables frontend minification for Render's constrained build environment.

4. Removed real Firebase SDK usage from `src/lib/firebase.ts` and kept the MySQL compatibility shim. This reduces the frontend bundle/build workload.

5. Added Render `NODE_OPTIONS=--max-old-space-size=384` in `render.yaml`.

## Required Render dashboard settings

If the Render dashboard has manually configured commands, they can override `render.yaml`. Set them exactly as follows:

```txt
Build Command:
npm run render:build

Pre-Deploy Command:
npm run render:predeploy

Start Command:
npm run render:start
```

Do not put `npm run render:build` in the Start Command.

## Notes

If the service is on Render Free and still runs out of memory during Vite build, either use the Render Starter plan or build locally and deploy a prebuilt Docker image. The application itself starts with `node dist/server.cjs`; the memory issue is build-time, not runtime.
