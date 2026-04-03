// mcp/server.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHttpServer, formatAnnotations } from './server.js';

const TEST_PORT = 13847;
const TEST_SECRET = 'test-secret';
let tmpDir;
let queueFile;
let server;
const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

before(() => new Promise((resolve, reject) => {
  tmpDir = mkdtempSync(join(tmpdir(), 'annotator-test-'));
  queueFile = join(tmpDir, 'queue.json');
  server = createHttpServer(TEST_PORT, TEST_SECRET, queueFile);
  server.listen(TEST_PORT, '127.0.0.1', resolve);
  server.on('error', reject);
}));

after(() => new Promise(resolve => {
  server.close(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    resolve();
  });
}));

const annotate = (body, secret = TEST_SECRET) =>
  fetch(`${baseUrl}/annotate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Annotator-Secret': secret },
    body: JSON.stringify(body),
  });

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.version, '1.0.0');
    assert.equal(typeof body.pending, 'number');
    assert.equal(typeof body.name, 'string');
    assert.equal(typeof body.port, 'number');
  });

  it('reflects pending count from queue', async () => {
    writeFileSync(queueFile, JSON.stringify([{ annotations: [{}] }]));
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();
    assert.equal(body.pending, 1);
    writeFileSync(queueFile, '[]');
  });
});

describe('POST /annotate', () => {
  it('returns 401 with wrong secret', async () => {
    const res = await annotate(
      { annotations: [{ id: 1, tags: [], comment: 'x', html: '<p/>' }], url: 'http://x.com', title: 'X' },
      'wrong-secret'
    );
    assert.equal(res.status, 401);
  });

  it('returns 400 with empty annotations array', async () => {
    const res = await annotate({ annotations: [], url: 'http://x.com', title: 'X' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'No annotations provided');
  });

  it('returns 400 with invalid JSON', async () => {
    const res = await fetch(`${baseUrl}/annotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Annotator-Secret': TEST_SECRET },
      body: 'not-valid-json',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Invalid JSON');
  });

  it('returns 200 and writes to queue', async () => {
    const payload = {
      url: 'https://example.com',
      title: 'Example',
      annotations: [{ id: 1, tags: ['codigo'], comment: 'Fix this', html: '<button/>' }],
    };
    const res = await annotate(payload);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.queued, 1);
  });

  it('OPTIONS preflight returns 204', async () => {
    const res = await fetch(`${baseUrl}/annotate`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
  });

  it('accepts lang=en payload without error', async () => {
    const res = await annotate({
      url: 'https://example.com',
      title: 'Test',
      lang: 'en',
      annotations: [{ id: 1, tags: ['acessibilidade'], comment: 'Check this', html: '<div/>' }],
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
  });
});

describe('formatAnnotations', () => {
  const base = {
    url: 'https://example.com',
    title: 'Test',
    annotations: [{ id: 1, tags: ['codigo'], comment: 'Fix this', html: '<button/>' }],
  };

  it('defaults to PT when lang is absent', () => {
    const out = formatAnnotations(base);
    assert.ok(out.includes('anotação(ões)'), 'should contain PT header');
    assert.ok(out.includes('Diagnóstico'), 'should contain PT instructions');
  });

  it('uses EN strings when lang=en', () => {
    const out = formatAnnotations({ ...base, lang: 'en' });
    assert.ok(out.includes('annotation(s)'), 'should contain EN header');
    assert.ok(out.includes('Diagnosis'), 'should contain EN instructions');
    assert.ok(!out.includes('anotação'), 'should not contain PT text');
  });

  it('falls back to PT for unknown lang', () => {
    const out = formatAnnotations({ ...base, lang: 'fr' });
    assert.ok(out.includes('anotação(ões)'), 'should fall back to PT');
  });
});
