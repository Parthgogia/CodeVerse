# Sandbox image for TypeScript execution.
#
# The stock node:20-alpine image has no TypeScript toolchain, and the sandbox runs
# with --network none, so nothing can be downloaded at run time. This image bakes
# tsx (esbuild-based: strips types, no type-check — the same semantics as the old
# `ts-node --transpile-only` command) in at build time instead.
#
# Build once per host, like the other runtime images are pulled once:
#   npm run sandbox:build        (from backend/)
FROM node:20-alpine

RUN npm install -g tsx@4.23.13 \
 && npm cache clean --force

# tsx is invoked as `tsx /code/main.ts` by dockerRunner.ts; no entrypoint needed.
