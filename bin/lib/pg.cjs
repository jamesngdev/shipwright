'use strict';
// Postgres helpers built on psql / pg_dump / pg_restore (libpq connection URLs).
const { execSync } = require('child_process');
const { run, tryRun } = require('./git.cjs');

const PG_URL_RE = /^postgres(?:ql)?:\/\//;

function isPgUrl(v) {
  return typeof v === 'string' && PG_URL_RE.test(v);
}

function parse(url) {
  const u = new URL(url);
  return { url: u, db: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres' };
}

// libpq rejects unknown params such as Prisma's ?schema=public — strip the query.
function libpqUrl(url, dbOverride) {
  const u = new URL(url);
  if (dbOverride) u.pathname = '/' + encodeURIComponent(dbOverride);
  u.search = '';
  return u.toString();
}

// Same URL (query kept) pointing at another database.
function withDb(url, db) {
  const u = new URL(url);
  u.pathname = '/' + encodeURIComponent(db);
  return u.toString();
}

function sameServer(a, b) {
  const ua = new URL(a);
  const ub = new URL(b);
  return ua.hostname === ub.hostname && (ua.port || '5432') === (ub.port || '5432');
}

function env(password) {
  return password ? { ...process.env, PGPASSWORD: password } : process.env;
}

function psql(url, sql, password) {
  return run('psql', [libpqUrl(url), '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { env: env(password) });
}

function quoteIdent(name) {
  return '"' + name.replace(/"/g, '""') + '"';
}

function dbSize(url, password) {
  return Number(psql(url, 'select pg_database_size(current_database())', password)) || 0;
}

function exists(url, db, password) {
  return psql(libpqUrl(url, 'postgres'), `select 1 from pg_database where datname = '${db.replace(/'/g, "''")}'`, password) === '1';
}

function create(url, db, password) {
  psql(libpqUrl(url, 'postgres'), `CREATE DATABASE ${quoteIdent(db)}`, password);
}

function drop(url, db, password) {
  const admin = libpqUrl(url, 'postgres');
  try {
    psql(admin, `DROP DATABASE IF EXISTS ${quoteIdent(db)} WITH (FORCE)`, password);
  } catch {
    psql(admin, `DROP DATABASE IF EXISTS ${quoteIdent(db)}`, password); // < PG13
  }
}

const MIGRATION_TABLES = ['_prisma_migrations', 'goose_db_version', 'schema_migrations', 'knex_migrations', 'typeorm_migrations', 'migrations'];

// Full copy, or schema + migration-history only when the source is large.
// Plain-format dump piped through psql: works when the local pg_dump is newer than the server
// (drops SET lines for settings the older server does not know, e.g. transaction_timeout).
function clone(srcUrl, dstDb, { password, schemaOnly }) {
  const src = libpqUrl(srcUrl);
  const dst = libpqUrl(srcUrl, dstDb);
  const opts = { env: env(password), stdio: ['ignore', 'pipe', 'pipe'], shell: '/bin/bash', maxBuffer: 1 << 30 };
  const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
  const pipe = (dumpArgs) =>
    execSync(`set -o pipefail; pg_dump --no-owner --no-acl ${dumpArgs} ${q(src)} | sed -e '/^SET transaction_timeout/d' | psql -q -v ON_ERROR_STOP=1 -d ${q(dst)} >/dev/null`, opts);
  if (!schemaOnly) {
    pipe('');
    return { mode: 'full' };
  }
  pipe('--schema-only');
  const present = tryRun('psql', [src, '-tAc', `select string_agg(quote_ident(table_schema)||'.'||quote_ident(table_name), ' ') from information_schema.tables where table_name in (${MIGRATION_TABLES.map((t) => `'${t}'`).join(',')})`], { env: env(password) });
  const tables = (present || '').split(' ').filter(Boolean);
  if (tables.length) pipe(`--data-only ${tables.map((x) => `-t ${q(x)}`).join(' ')}`);
  return { mode: 'schema', migrationTables: tables };
}

module.exports = { isPgUrl, parse, libpqUrl, withDb, sameServer, dbSize, exists, create, drop, clone, psql };
