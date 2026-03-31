const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '../../..');
const defaultDbPath = path.join(projectRoot, 'data', 'mini_erp.db');
const configuredDbPath = process.env.DB_PATH
  ? path.resolve(projectRoot, process.env.DB_PATH)
  : defaultDbPath;
const dbPath = configuredDbPath;
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

class Database {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  init() {
    if (this.db) {
      return Promise.resolve();
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          this.db = null;
          this.initPromise = null;
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.db.run('PRAGMA foreign_keys = ON', (pragmaErr) => {
            if (pragmaErr) {
              this.db = null;
              this.initPromise = null;
              reject(pragmaErr);
            } else {
              resolve();
            }
          });
        }
      });
    });

    return this.initPromise;
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

module.exports = new Database();
module.exports.dbPath = dbPath;
