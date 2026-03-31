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

function getArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((v) => v.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '';
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function copyIfExists(fromPath, toPath) {
  if (!fs.existsSync(fromPath)) return false;
  fs.copyFileSync(fromPath, toPath);
  return true;
}

function main() {
  const srcArg = getArg('src');
  if (!srcArg) {
    throw new Error('Missing required argument --src=<path-to-db-file>');
  }

  const sourcePath = path.resolve(projectRoot, srcArg);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source DB not found: ${sourcePath}`);
  }

  const force = hasFlag('force');
  if (fs.existsSync(configuredDbPath) && !force) {
    throw new Error('Target DB already exists. Re-run with --force to overwrite.');
  }

  const targetDir = path.dirname(configuredDbPath);
  fs.mkdirSync(targetDir, { recursive: true });

  if (fs.existsSync(configuredDbPath)) {
    const backupDir = path.join(projectRoot, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `mini_erp-local-backup-${timestampForFileName()}.db`);
    fs.copyFileSync(configuredDbPath, backupPath);
    console.log(`Backed up current DB to: ${backupPath}`);
  }

  removeIfExists(`${configuredDbPath}-wal`);
  removeIfExists(`${configuredDbPath}-shm`);

  fs.copyFileSync(sourcePath, configuredDbPath);

  const walCopied = copyIfExists(`${sourcePath}-wal`, `${configuredDbPath}-wal`);
  const shmCopied = copyIfExists(`${sourcePath}-shm`, `${configuredDbPath}-shm`);

  console.log(`Imported DB from: ${sourcePath}`);
  console.log(`Target DB:        ${configuredDbPath}`);
  if (walCopied || shmCopied) {
    console.log(`Also copied sidecar files: wal=${walCopied}, shm=${shmCopied}`);
  }
  console.log('Done. Start the server to run any required migrations automatically.');
}

try {
  main();
} catch (err) {
  console.error('DB import failed:', err.message);
  process.exit(1);
}
