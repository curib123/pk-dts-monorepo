const { spawnSync } = require('node:child_process');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const prismaWrapper = path.join(__dirname, 'prisma-env.js');
const maxAttempts = Number.parseInt(
  process.env.PRISMA_DB_PUSH_MAX_ATTEMPTS || '12',
  10,
);
const retryDelayMs = Number.parseInt(
  process.env.PRISMA_DB_PUSH_RETRY_DELAY_MS || '5000',
  10,
);

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const result = spawnSync(
    process.execPath,
    [
      prismaWrapper,
      'db',
      'push',
      '--skip-generate',
      // The PostgreSQL startup schema adds nullable workflow fields and a
      // unique current-step relation. Existing rows remain intact because
      // the new fields start as NULL; Prisma still requires this flag to
      // acknowledge its generic unique-constraint warning.
      '--accept-data-loss',
    ],
    {
      cwd: rootDir,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    },
  );

  if (result.status === 0) {
    process.exit(0);
  }

  if (attempt === maxAttempts) {
    console.error(
      `Prisma db push failed after ${maxAttempts} attempts. Giving up.`,
    );
    process.exit(result.status ?? 1);
  }

  console.warn(
    `Prisma db push attempt ${attempt}/${maxAttempts} failed; retrying in ${retryDelayMs}ms...`,
  );
  wait(retryDelayMs);
}
