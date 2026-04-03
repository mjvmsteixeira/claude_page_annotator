import http from 'http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, CreateMessageResultSchema } from '@modelcontextprotocol/sdk/types.js';

const PORT = Number(process.env.PORT ?? 3847);
const SECRET = process.env.ANNOTATOR_SECRET ?? 'claude-annotator-local';
const ANNOTATOR_NAME = process.env.ANNOTATOR_NAME ?? `annotator-${PORT}`;
const QUEUE_FILE = join(homedir(), '.claude', `annotator-queue-${PORT}.json`);

// ── Queue helpers ──────────────────────────────────────────
function readQueue(file = QUEUE_FILE) {
  if (!existsSync(file)) return [];
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return []; }
}

function writeQueue(items, file = QUEUE_FILE) {
  mkdirSync(join(homedir(), '.claude'), { recursive: true });
  writeFileSync(file, JSON.stringify(items, null, 2));
}

// ── Format strings (PT / EN) ────────────────────────────
// NOTE: These strings are intentionally duplicated from extension/i18n.js (mcp* keys).
// server.js is a Node.js ESM module and cannot access window.CPA_STRINGS.
// If strings change, update both files. A shared mcp/i18n.js is the future consolidation path.
const FORMAT_STRINGS = {
  pt: {
    header: (count, url) => `[Claude Annotator] ${count} anotação(ões) de ${url}`,
    titleLabel: 'Título',
    annotationHeading: (id, tags) => `## Anotação #${id} — ${tags}`,
    tagGeneral: 'Geral',
    htmlLabel: 'HTML capturado:',
    instructions: 'Para cada anotação, fornece:\n1. Diagnóstico — o que está errado ou pode melhorar\n2. Código corrigido (se aplicável)\n3. Explicação da correção\n4. Severidade: Crítico / Importante / Sugestão',
    tagLabels: { codigo: 'Código (HTML/CSS/JS)', acessibilidade: 'Acessibilidade (WCAG)', conteudo: 'Conteúdo/Texto' },
  },
  en: {
    header: (count, url) => `[Claude Annotator] ${count} annotation(s) from ${url}`,
    titleLabel: 'Title',
    annotationHeading: (id, tags) => `## Annotation #${id} — ${tags}`,
    tagGeneral: 'General',
    htmlLabel: 'Captured HTML:',
    instructions: 'For each annotation, provide:\n1. Diagnosis — what is wrong or can be improved\n2. Fixed code (if applicable)\n3. Explanation of the fix\n4. Severity: Critical / Important / Suggestion',
    tagLabels: { codigo: 'Code (HTML/CSS/JS)', acessibilidade: 'Accessibility (WCAG)', conteudo: 'Content/Text' },
  },
};

export function formatAnnotations(data) {
  const str = FORMAT_STRINGS[data.lang] ?? FORMAT_STRINGS.pt;
  const sep = '─'.repeat(50);

  let msg = `${str.header(data.annotations.length, data.url)}\n`;
  msg += `${str.titleLabel}: ${data.title}\n`;
  msg += `${sep}\n\n`;

  data.annotations.forEach(ann => {
    const tags = ann.tags.map(t => str.tagLabels[t] ?? t).join(', ') || str.tagGeneral;
    msg += `${str.annotationHeading(ann.id, tags)}\n`;
    msg += `> ${ann.comment}\n\n`;
    msg += `${str.htmlLabel}\n\`\`\`html\n${ann.html}\n\`\`\`\n\n`;
  });

  msg += `${sep}\n`;
  msg += `${str.instructions}\n`;

  return msg;
}

// ── MCP Server ─────────────────────────────────────────────
const mcpServer = new Server(
  { name: 'annotator', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'get_annotations',
    description: `Retorna as anotações pendentes feitas na página web pelo Claude Annotator (porta ${PORT} — sessão: ${ANNOTATOR_NAME}). Chama esta ferramenta quando o utilizador pedir para ver ou processar anotações.`,
    inputSchema: { type: 'object', properties: {}, required: [] },
  }],
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== 'get_annotations') {
    return { content: [{ type: 'text', text: 'Unknown tool' }], isError: true };
  }

  const queue = readQueue(QUEUE_FILE);
  if (queue.length === 0) {
    return { content: [{ type: 'text', text: 'Sem anotações pendentes.' }] };
  }

  const text = queue.map(formatAnnotations).join('\n\n' + '═'.repeat(60) + '\n\n');
  writeQueue([], QUEUE_FILE);
  return { content: [{ type: 'text', text }] };
});

// ── CORS headers ───────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Annotator-Secret',
};

// ── HTTP Server factory (exported for tests) ───────────────
export function createHttpServer(port = PORT, secret = SECRET, queueFile = QUEUE_FILE, annotatorName = ANNOTATOR_NAME, mcpRef = null) {
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      const pending = readQueue(queueFile).length;
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({ status: 'ok', version: '1.0.0', pending, name: annotatorName, port }));
      return;
    }

    if (req.method === 'POST' && req.url === '/annotate') {
      if (req.headers['x-annotator-secret'] !== secret) {
        res.writeHead(401, { 'Content-Type': 'application/json', ...CORS });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      let body = '';
      let aborted = false;
      req.on('error', () => {});
      req.on('data', chunk => {
        if (aborted) return;
        body += chunk;
        if (body.length > 1_048_576) {
          aborted = true;
          res.writeHead(413, { 'Content-Type': 'application/json', ...CORS });
          res.end(JSON.stringify({ error: 'Payload too large' }));
        }
      });
      req.on('end', () => {
        if (aborted) return;
        let data;
        try {
          data = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json', ...CORS });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }

        if (!Array.isArray(data.annotations) || data.annotations.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...CORS });
          res.end(JSON.stringify({ error: 'No annotations provided' }));
          return;
        }

        const tagLabels = { codigo: 'Código', acessibilidade: 'Acessibilidade', conteudo: 'Conteúdo' };
        process.stderr.write(`[annotator-mcp] ── ${data.annotations.length} anotação(ões) de ${data.url}\n`);
        data.annotations.forEach(ann => {
          const tags = ann.tags.map(t => tagLabels[t] ?? t).join(', ') || 'Geral';
          process.stderr.write(`  #${ann.id} [${tags}] "${ann.comment}"\n`);
        });

        const queue = readQueue(queueFile);
        queue.push(data);
        writeQueue(queue, queueFile);
        process.stderr.write(`[annotator-mcp] Guardado na fila (${queue.length} total).\n`);

        // Try to push directly into Claude via sampling
        if (mcpRef) {
          const text = formatAnnotations(data);
          mcpRef.request(
            {
              method: 'sampling/createMessage',
              params: {
                messages: [{ role: 'user', content: { type: 'text', text } }],
                maxTokens: 8192,
                includeContext: 'thisServer',
              },
            },
            CreateMessageResultSchema,
          ).then(() => {
            writeQueue([], queueFile); // clear queue — Claude already received
          }).catch(() => {
            process.stderr.write(`[annotator-mcp] Sampling não disponível — diz "ver anotações" no Claude.\n`);
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
        res.end(JSON.stringify({ success: true, queued: queue.length }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.on('error', err => {
    process.stderr.write(`[annotator-mcp] HTTP error: ${err.message}\n`);
    if (err.code === 'EADDRINUSE') {
      process.stderr.write(`[annotator-mcp] Porta ${port} ocupada — HTTP desactivado, MCP activo.\n`);
    }
  });

  return server;
}

// ── Only start when running as main module ─────────────────
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const httpServer = createHttpServer(PORT, SECRET, QUEUE_FILE, ANNOTATOR_NAME, mcpServer);
  httpServer.listen(PORT, '127.0.0.1', () => {
    process.stderr.write(`[annotator-mcp] HTTP listening on localhost:${PORT} (${ANNOTATOR_NAME})\n`);
  });

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}
