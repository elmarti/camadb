const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function chromeExecutable() {
  const configured = process.env.CHROME_PATH;
  const candidates = [
    configured,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  for (const command of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const located = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { encoding: 'utf8' });
    if (located.status === 0) return located.stdout.trim().split(/\r?\n/)[0];
  }
  throw new Error('Chrome was not found. Set CHROME_PATH to a Chromium-compatible executable.');
}

async function waitFor(check, description, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

class DevToolsClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('Chrome DevTools connection failed')), {
        once: true,
      });
    });
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.id) {
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
        return;
      }
      this.events.push(message);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const response = new Promise((resolve, reject) => this.pending.set(id, { reject, resolve }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function run() {
  const appPort = await availablePort();
  const debugPort = await availablePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'camadb-browser-profile-'));
  const appUrl = `http://127.0.0.1:${appPort}/`;
  const server = spawn(process.execPath, ['apps/knowledge-demo/serve.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(appPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverErrors = '';
  let chromeErrors = '';
  server.stderr.on('data', (chunk) => {
    serverErrors += chunk;
  });
  let chrome;
  let client;

  try {
    await waitFor(
      () =>
        new Promise((resolve) =>
          http
            .get(appUrl, (response) => {
              response.resume();
              resolve(response.statusCode === 200);
            })
            .on('error', () => resolve(false)),
        ),
      'the knowledge-demo server',
    );
    const args = [
      '--headless=new',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-gpu',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-default-browser-check',
      '--no-first-run',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      appUrl,
    ];
    if (process.env.CI) args.unshift('--no-sandbox');
    chrome = spawn(chromeExecutable(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
    chrome.stderr.on('data', (chunk) => {
      chromeErrors += chunk;
    });

    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      return targets.find((item) => item.type === 'page' && item.url.startsWith(appUrl));
    }, 'the Chrome page target');
    client = new DevToolsClient(target.webSocketDebuggerUrl);
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Network.enable');

    const pageErrors = [];
    const externalRequests = [];
    let eventCursor = 0;
    const consumeEvents = () => {
      for (const event of client.events.slice(eventCursor)) {
        if (event.method === 'Runtime.exceptionThrown') pageErrors.push(event.params.exceptionDetails.text);
        if (
          event.method === 'Network.requestWillBeSent' &&
          event.params.request.url.startsWith('http') &&
          !event.params.request.url.startsWith(appUrl)
        ) {
          externalRequests.push(event.params.request.url);
        }
      }
      eventCursor = client.events.length;
    };
    const evaluateUntil = (expression, description) =>
      waitFor(async () => {
        consumeEvents();
        assert.deepStrictEqual(pageErrors, []);
        return client.evaluate(expression);
      }, description);

    await evaluateUntil(
      `document.querySelector('#activity-status')?.textContent === 'Ready. Your data stays in this browser.'`,
      'the IndexedDB application to become ready',
    );
    await client.evaluate(
      `document.querySelector('#sample-button').click(); document.querySelector('#import-button').click()`,
    );
    const storedCount = await evaluateUntil(
      `Number(document.querySelector('#memory-count')?.textContent) || false`,
      'sample records to be stored in IndexedDB',
    );
    assert.ok(storedCount > 0);

    await client.evaluate(`(() => {
      const input = document.querySelector('#search-query');
      input.value = 'IndexedDB browser records';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#search-form').requestSubmit();
    })()`);
    await evaluateUntil(`document.querySelectorAll('.result-card').length > 0`, 'hybrid browser results');
    await client.evaluate(`document.querySelector('.memory-card button').click()`);
    await evaluateUntil(`document.querySelector('#inspector').open`, 'record inspection');

    await client.evaluate(`window.__camadbReleaseJourneyBeforeReload = true`);
    await client.send('Page.reload', { ignoreCache: true });
    await evaluateUntil(
      `!window.__camadbReleaseJourneyBeforeReload && document.querySelector('#activity-status')?.textContent === 'Ready. Your data stays in this browser.' && Number(document.querySelector('#memory-count')?.textContent) === ${storedCount}`,
      'IndexedDB records after a real browser reload',
    );
    await client.evaluate(`window.confirm = () => true; document.querySelector('#clear-button').click()`);
    await evaluateUntil(
      `document.querySelector('#activity-status')?.textContent === 'All demo memories were deleted from this browser.' && document.querySelector('#memory-count')?.textContent === '0'`,
      'browser deletion',
    );

    consumeEvents();
    assert.deepStrictEqual(pageErrors, []);
    assert.deepStrictEqual(externalRequests, []);
    console.log(
      `Real Chrome journey passed: IndexedDB import, hybrid recall, inspect, reload, delete (${storedCount} records).`,
    );
  } catch (error) {
    if (serverErrors) process.stderr.write(serverErrors);
    if (chromeErrors) process.stderr.write(chromeErrors);
    throw error;
  } finally {
    client?.close();
    chrome?.kill('SIGTERM');
    server.kill('SIGTERM');
    fs.rmSync(profile, { force: true, recursive: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
