#!/usr/bin/env node
/*
 * Encrypt (or decrypt) an exam pack into the ExamSim AES-GCM envelope that the
 * app's secure-transfer.js decrypts on import. Use this to produce a paid
 * "pro" pack that buyers activate with a license key (the passphrase).
 *
 * The envelope format MUST stay in sync with assets/js/secure-transfer.js:
 *   PBKDF2-SHA256 (210000 iters), 16-byte salt, 12-byte IV, AES-GCM-256.
 *
 * Usage:
 *   Encrypt a combined pack file ({id, questions, metadata}) into an envelope:
 *     node tools/encrypt-pack.js encrypt --in pack.json --key "LICENSE-KEY" --out az104-complete.json
 *
 *   Or pass a raw questions array file plus its metadata:
 *     node tools/encrypt-pack.js encrypt --in questions.json --id az104 \
 *          --metadata metadata.json --key "LICENSE-KEY" --out az104-complete.json
 *
 *   Decrypt (verify) an envelope back to the pack:
 *     node tools/encrypt-pack.js decrypt --in az104-complete.json --key "LICENSE-KEY" --out pack.json
 *
 *   The license key / passphrase can also come from the ENCRYPT_PACK_KEY env var or an
 *   interactive prompt (preferred for paid packs, so it never lands in shell history or
 *   process listings).
 */
'use strict';

const fs = require('fs');
const { webcrypto } = require('crypto');
const { subtle } = webcrypto;

const ENVELOPE_FORMAT = 'examsim-encrypted';
const ENVELOPE_VERSION = 1;
const KDF_ITERATIONS = 210000;
const MIN_KDF_ITERATIONS = 100000;
const MAX_KDF_ITERATIONS = 1000000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MAX_ENCRYPTED_BYTES = 8 * 1024 * 1024;
const MIN_PASSPHRASE_LENGTH = 8;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

async function deriveKey(passphrase, salt, iterations) {
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(String(passphrase)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(data, passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`License key / passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    format: ENVELOPE_FORMAT,
    version: ENVELOPE_VERSION,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    cipher: 'AES-GCM',
    iterations: KDF_ITERATIONS,
    salt: Buffer.from(salt).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    data: Buffer.from(new Uint8Array(cipher)).toString('base64')
  };
}

function decodeBase64(value, expectedBytes = null, maxBytes = MAX_ENCRYPTED_BYTES) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    return null;
  }
  if (value.length > Math.ceil(maxBytes / 3) * 4) return null;
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) return null;
  if (expectedBytes !== null && bytes.length !== expectedBytes) return null;
  if (bytes.length > maxBytes) return null;
  return bytes;
}

function isEncryptedEnvelope(envelope) {
  return Boolean(
    envelope
    && typeof envelope === 'object'
    && !Array.isArray(envelope)
    && envelope.format === ENVELOPE_FORMAT
    && envelope.version === ENVELOPE_VERSION
    && envelope.kdf === 'PBKDF2'
    && envelope.hash === 'SHA-256'
    && envelope.cipher === 'AES-GCM'
    && Number.isInteger(envelope.iterations)
    && envelope.iterations >= MIN_KDF_ITERATIONS
    && envelope.iterations <= MAX_KDF_ITERATIONS
    && decodeBase64(envelope.salt, SALT_BYTES, SALT_BYTES) !== null
    && decodeBase64(envelope.iv, IV_BYTES, IV_BYTES) !== null
    && (decodeBase64(envelope.data, null, MAX_ENCRYPTED_BYTES)?.length || 0) >= 16
  );
}

async function decrypt(envelope, passphrase) {
  if (!isEncryptedEnvelope(envelope)) {
    throw new Error('Input is not a valid ExamSim encrypted envelope.');
  }
  const salt = decodeBase64(envelope.salt, SALT_BYTES, SALT_BYTES);
  const iv = decodeBase64(envelope.iv, IV_BYTES, IV_BYTES);
  const data = decodeBase64(envelope.data, null, MAX_ENCRYPTED_BYTES);
  const key = await deriveKey(passphrase, salt, envelope.iterations);
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function buildPack(input, id, metadataPath) {
  if (Array.isArray(input)) {
    const pack = { questions: input };
    if (id) pack.id = id;
    if (metadataPath) pack.metadata = readJson(metadataPath);
    return pack;
  }
  // Already a pack object: respect it, allow id/metadata overrides.
  const pack = { ...input };
  if (id) pack.id = id;
  if (metadataPath) pack.metadata = readJson(metadataPath);
  return pack;
}

function promptHidden(query) {
  return new Promise((resolve) => {
    const stream = require('stream');
    const readline = require('readline');
    const muted = new stream.Writable({
      write(chunk, enc, cb) { if (!muted.isMuted) process.stdout.write(chunk, enc); cb(); }
    });
    muted.isMuted = false;
    const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: true });
    process.stdout.write(query);
    muted.isMuted = true;
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(String(answer).trim());
    });
  });
}

async function resolveKey(argKey) {
  if (argKey && argKey !== true) return String(argKey);
  if (process.env.ENCRYPT_PACK_KEY) return String(process.env.ENCRYPT_PACK_KEY);
  if (process.stdin.isTTY) {
    const key = await promptHidden('License key / passphrase: ');
    if (key) return key;
  }
  throw new Error('No license key. Pass --key, set ENCRYPT_PACK_KEY, or run interactively.');
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  const args = parseArgs(argv.slice(1));

  if (!['encrypt', 'decrypt'].includes(mode) || !args.in || !args.out) {
    process.stderr.write(
      'Usage:\n'
      + '  node tools/encrypt-pack.js encrypt --in <pack.json|questions.json> [--id <id>] [--metadata <metadata.json>] --out <out.json>\n'
      + '  node tools/encrypt-pack.js decrypt --in <envelope.json> --out <pack.json>\n'
      + '\n'
      + 'The license key / passphrase is read from --key, the ENCRYPT_PACK_KEY env var,\n'
      + 'or an interactive prompt (preferred, so it never lands in shell history or process listings).\n'
    );
    process.exit(2);
  }

  const key = await resolveKey(args.key);
  const input = readJson(args.in);

  if (mode === 'encrypt') {
    const pack = buildPack(input, args.id, args.metadata);
    if (!Array.isArray(pack.questions) || pack.questions.length === 0) {
      throw new Error('Pack has no questions to encrypt.');
    }
    const envelope = await encrypt(pack, key);
    fs.writeFileSync(args.out, JSON.stringify(envelope, null, 2) + '\n');
    process.stdout.write(`Encrypted ${pack.questions.length} question(s) into ${args.out}\n`);
  } else {
    const pack = await decrypt(input, key);
    fs.writeFileSync(args.out, JSON.stringify(pack, null, 2) + '\n');
    const n = Array.isArray(pack.questions) ? pack.questions.length : 'unknown';
    process.stdout.write(`Decrypted ${n} question(s) into ${args.out}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
});
