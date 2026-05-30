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
const SALT_BYTES = 16;
const IV_BYTES = 12;
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

async function decrypt(envelope, passphrase) {
  if (!envelope || envelope.format !== ENVELOPE_FORMAT) {
    throw new Error('Input is not a valid ExamSim encrypted envelope.');
  }
  const iterations = Number.isInteger(envelope.iterations) && envelope.iterations > 0
    ? envelope.iterations
    : KDF_ITERATIONS;
  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const key = await deriveKey(passphrase, salt, iterations);
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    Buffer.from(envelope.data, 'base64')
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
