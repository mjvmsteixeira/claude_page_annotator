# Annotator for Claude

PT | **[EN](README.md)**

Extensão Chrome para anotar áreas de páginas web e enviar directamente para o Claude CLI via canal MCP local — sem API key.

```
Chrome Extension  →  POST localhost:{PORT}  →  MCP Server  →  Claude CLI
```

## Funcionalidades

- Selecção por drag para anotar qualquer área de uma página
- Categorias: Código (HTML/CSS/JS), Acessibilidade (WCAG), Conteúdo/Texto
- Anotações persistem entre refreshes (chrome.storage.session)
- Multi-servidor: suporta múltiplas sessões Claude CLI em portas diferentes
- Alternância PT/EN — preferência sincroniza entre dispositivos
- Processamento automático via instrução CLAUDE.md ou skill `/annotator`

## Requisitos

- Chrome (ou browser baseado em Chromium)
- [Claude CLI](https://claude.ai/download) com suporte MCP
- Node.js 18+

## Instalação

### 1. Clonar o repositório

```bash
git clone https://github.com/mjvmsteixeira/claude_page_annotator.git
cd claude_page_annotator
```

### 2. Carregar a extensão Chrome

1. Abre `chrome://extensions/`
2. Activa o **Modo de programador**
3. Clica **Carregar sem compactação** e selecciona a pasta `extension/`

### 3. Instalar o servidor MCP

```bash
cd mcp && npm install
```

### 4. Registar no Claude CLI

```bash
claude mcp add -s user annotator node /caminho/para/claude_page_annotator/mcp/server.js
```

Verificar:
```bash
claude mcp list
# annotator: node .../server.js  Connected
```

## Utilização

### Anotar

1. Abre o Claude CLI: `claude` — o servidor MCP arranca automaticamente na porta 3847
2. Activa com **Cmd+Shift+Y** (Mac) / **Ctrl+Shift+Y** (Windows/Linux), ou popup → **Ativar Anotador**
3. Arrasta para seleccionar uma área da página
4. Na janela de comentário, escolhe categorias e descreve o que o Claude deve analisar (`Ctrl+Enter` para guardar)
5. Clica num marcador para ver, editar ou apagar a anotação

### Enviar anotações para o Claude CLI

1. Selecciona o servidor MCP no popup
2. Clica **Enviar para CLI (n)**
3. As anotações são processadas automaticamente no Claude CLI (se o CLAUDE.md estiver configurado — ver abaixo)

### Alternância de idioma (PT/EN)

Clica no botão **PT | EN** no cabeçalho do popup. A preferência é guardada e sincroniza entre dispositivos.

## Integração com Claude Code

### Processamento automático

Copia o `CLAUDE.md` para a raiz do teu projecto (ou adiciona o conteúdo ao teu CLAUDE.md existente):

```markdown
After each response in this project, silently call the `get_annotations` MCP tool.
- If there are pending annotations: process them immediately inline.
- If the queue is empty: say nothing.
```

O Claude verifica as anotações após cada resposta — sem necessidade de trigger manual.

### Skill `/annotator`

Para processamento explícito a qualquer momento, instala o skill:

```bash
cp skills/annotator.md ~/.claude/skills/annotator.md
```

Escreve `/annotator` no Claude CLI para buscar e processar anotações pendentes.

## Múltiplas sessões Claude

Cada sessão precisa do seu servidor numa porta diferente:

```bash
# Terminal 1 — sessão frontend
PORT=3847 ANNOTATOR_NAME="frontend" claude

# Terminal 2 — sessão backend
PORT=3848 ANNOTATOR_NAME="backend" claude
```

O popup detecta ambos os servidores automaticamente. Selecciona o destino antes de enviar.

## Secret personalizado

Para usar um secret de autenticação personalizado:

```bash
ANNOTATOR_SECRET=o-meu-secret node mcp/server.js
```

Actualiza também `DEFAULT_SECRET` em `extension/config.js`.

## Testes

```bash
cd mcp && npm test
```

## Resolução de problemas

| Sintoma | Causa | Solução |
|---------|-------|---------|
| "Nenhum servidor encontrado" | Servidor não está a correr | Inicia `claude` com o MCP registado |
| "Servidor não está activo" | Servidor parou | Reinicia `claude` |
| Popup mostra "Inativo" | Estado inicial correcto | Clica Ativar Anotador |
| Botão fica cinzento | Página restrita (chrome://) | Navega para uma página normal |
| Sem resposta no terminal | MCP não registado | Corre `claude mcp list` e verifica |
| Anotações desapareceram após envio | Comportamento correcto | Normal — removidas após envio bem-sucedido |

## Licença

MIT — ver [LICENSE](LICENSE)
