const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const defaultDbPath = path.join(projectRoot, 'data', 'mini_erp.db');
const configuredDbPath = process.env.DB_PATH
  ? path.resolve(projectRoot, process.env.DB_PATH)
  : defaultDbPath;

function timestampForFileName(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

function resolveOutputPath() {
  const argOutput = process.argv.find((arg) => arg.startsWith('--out='));
  if (argOutput) {
    return path.resolve(projectRoot, argOutput.slice('--out='.length));
  }
  const outDir = path.join(projectRoot, 'backups');
  const fileName = `mini_erp-${timestampForFileName()}.db`;
  return path.join(outDir, fileName);
}

function copyIfExists(fromPath, toPath) {
  if (!fs.existsSync(fromPath)) return false;
  fs.copyFileSync(fromPath, toPath);
  return true;
}

function main() {
  if (!fs.existsSync(configuredDbPath)) {
    throw new Error(`DB not found: ${configuredDbPath}`);
  }

  const outPath = resolveOutputPath();
  const outDir = path.dirname(outPath);
  fs.mkdirSync(outDir, { recursive: true });

  fs.copyFileSync(configuredDbPath, outPath);

  const walCopied = copyIfExists(`${configuredDbPath}-wal`, `${outPath}-wal`);
  const shmCopied = copyIfExists(`${configuredDbPath}-shm`, `${outPath}-shm`);

  console.log(`Exported DB: ${outPath}`);
  console.log(`Source DB:   ${configuredDbPath}`);
  if (walCopied || shmCopied) {
    console.log(`Also copied sidecar files: wal=${walCopied}, shm=${shmCopied}`);
  }
}

try {
  main();
} catch (err) {
  console.error('DB export failed:', err.message);
  process.exit(1);
}
