"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const express_1 = __importDefault(require("express"));
const get_port_1 = __importDefault(require("get-port"));
let server = null;
let serverPort = null;
let outputChannel;
let currentWebviewView = null;
// provider for the activity‑bar view
class ApiParserViewProvider {
    constructor(context) {
        this.context = context;
        console.log('ApiParserViewProvider constructor');
        outputChannel.appendLine('🏗️ ApiParserViewProvider created');
    }
    async resolveWebviewView(webviewView, context, token) {
        currentWebviewView = webviewView; // Save reference for testing
        console.log('resolveWebviewView called for', webviewView.viewType);
        outputChannel.appendLine(`🔍 resolveWebviewView called for viewType: ${webviewView.viewType}`);
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this.context.extensionUri,
                vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'web')
            ]
        };
        outputChannel.appendLine('✅ Webview options set');
        try {
            // Wait for server to be ready (up to 5 seconds)
            let attempts = 0;
            while (!server && attempts < 50) {
                outputChannel.appendLine(`⏳ Waiting for server to start... (attempt ${attempts + 1}/50)`);
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            if (!server) {
                outputChannel.appendLine('❌ Server still not started after waiting, attempting to start now...');
                await startServer(this.context);
                outputChannel.appendLine(`✅ Server started on port ${serverPort}`);
            }
            else {
                outputChannel.appendLine(`✅ Server already running on port ${serverPort}`);
            }
            if (serverPort === null) {
                outputChannel.appendLine('❌ Server port is null, showing error');
                webviewView.webview.html = getErrorContent('Server failed to start - port is null');
                return;
            }
            const url = `http://localhost:${serverPort}`;
            outputChannel.appendLine(`🌐 Setting webview HTML for URL: ${url}`);
            webviewView.webview.html = getWebviewContent(url, serverPort);
            outputChannel.appendLine('✅ Webview HTML set successfully');
        }
        catch (error) {
            console.error('Error resolving webview:', error);
            outputChannel.appendLine(`❌ Error resolving webview: ${error}`);
            webviewView.webview.html = getErrorContent(`Error: ${error}`);
        }
    }
}
// must match containerId.viewId from package.json
ApiParserViewProvider.viewType = 'apiParser.apiParserView';
function getWebviewContent(url, port) {
    outputChannel.appendLine(`🌐 Generating iframe for URL: ${url}`);
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://localhost:${port} http://127.0.0.1:${port}; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
            <title>API Parser</title>
            <style>
                html, body {
                    margin: 0;
                    padding: 0;
                    height: 100%;
                    width: 100%;
                    overflow: hidden;
                }
                iframe {
                    width: 100%;
                    height: 100vh;
                    border: 0;
                    display: block;
                }
                #loading {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    font-family: Arial, sans-serif;
                    color: #888;
                    text-align: center;
                    padding: 20px;
                }
                .dots { animation: blink 1.4s infinite; }
                @keyframes blink { 0%, 50%, 100% { opacity: 1; } 25%, 75% { opacity: 0.5; } }
            </style>
        </head>
        <body>
            <div id="loading">
                <div>Загрузка<span class="dots">...</span></div>
                <div style="font-size: 12px; margin-top: 10px; color: #666;">Server: ${url}</div>
            </div>
            <iframe id="app-frame" src="${url}" title="API Parser Web Interface" style="display:none;"></iframe>
            <script>
                console.log('[Webview] Starting to load iframe from:', '${url}');
                const frame = document.getElementById('app-frame');
                const loading = document.getElementById('loading');
                
                frame.onload = () => {
                    console.log('[Webview] Iframe loaded successfully');
                    loading.style.display = 'none';
                    frame.style.display = 'block';
                };
                
                frame.onerror = (e) => {
                    console.error('[Webview] Iframe error:', e);
                    loading.innerHTML = '<div style="color: red;">❌ Ошибка загрузки iframe</div><div style="font-size: 12px; margin-top: 10px;">Проверьте Output → API Parser</div>';
                };
                
                // Fallback timeout
                setTimeout(() => {
                    if (loading.style.display !== 'none') {
                        console.error('[Webview] Iframe load timeout');
                        loading.innerHTML = '<div style="color: red;">❌ Таймаут загрузки</div><div style="font-size: 12px; margin-top: 10px;">Проверьте Output → API Parser</div><div style="font-size: 11px; margin-top: 5px; color: #888;">URL: ${url}</div>';
                    }
                }, 15000);
            </script>
        </body>
        </html>
    `;
}
function getTestContent() {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>API Parser - Test Mode</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                .success { background: #e8f5e8; border: 1px solid #4caf50; padding: 15px; border-radius: 4px; }
                button { background: #007acc; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
            </style>
        </head>
        <body>
            <div class="success">
                <h3>🎉 API Parser WebView Works!</h3>
                <p>This means the WebView provider is working correctly.</p>
                <p>The issue is likely with the Express server or web resources.</p>
                <button onclick="alert('WebView JavaScript is working!')">Test JS</button>
            </div>
        </body>
        </html>
    `;
}
function getErrorContent(message) {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>API Parser - Error</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                .error { background: #ffebee; border: 1px solid #ef5350; padding: 15px; border-radius: 4px; }
            </style>
        </head>
        <body>
            <div class="error">
                <h3>🔧 API Parser Error</h3>
                <p>${message}</p>
                <p>Please check the Output panel (API Parser) for more details.</p>
            </div>
        </body>
        </html>
    `;
}
function activate(context) {
    outputChannel = vscode.window.createOutputChannel('API Parser');
    outputChannel.appendLine('API Parser extension activating...');
    // outputChannel.show(); // Don't force show output panel
    console.log('API Parser extension activate()');
    console.log('activation events:', context.subscriptions.length, 'workspaceFolders', vscode.workspace.workspaceFolders);
    console.log('registered activationEvents from manifest', vscode.extensions.getExtension('api-parser-vscode')?.packageJSON.activationEvents);
    // Start server immediately on activation so it's ready when view opens
    outputChannel.appendLine('🚀 Pre-starting Express server...');
    startServer(context).then(() => {
        outputChannel.appendLine(`✅ Express server pre-started on port ${serverPort}`);
    }).catch((error) => {
        outputChannel.appendLine(`❌ Failed to pre-start server: ${error}`);
        vscode.window.showErrorMessage(`API Parser: Failed to start server - ${error}`);
    });
    // register the sidebar view provider
    const provider = new ApiParserViewProvider(context);
    outputChannel.appendLine(`📝 Created provider, registering viewType: '${ApiParserViewProvider.viewType}'`);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(ApiParserViewProvider.viewType, provider, {
        webviewOptions: {
            retainContextWhenHidden: true
        }
    }));
    outputChannel.appendLine('✅ WebviewViewProvider registered successfully');
    // keep a command for backwards compatibility that simply reveals the view
    context.subscriptions.push(vscode.commands.registerCommand('apiParser.open', () => {
        outputChannel.appendLine('Opening API Parser view...');
        return vscode.commands.executeCommand('workbench.view.extension.apiParser');
    }));
    // Force activate and show logs command
    context.subscriptions.push(vscode.commands.registerCommand('apiParser.forceActivate', async () => {
        outputChannel.show();
        outputChannel.appendLine('');
        outputChannel.appendLine('=== FORCE ACTIVATE COMMAND ===');
        outputChannel.appendLine(`Extension path: ${context.extensionPath}`);
        outputChannel.appendLine(`Server running: ${server !== null}`);
        outputChannel.appendLine(`Server port: ${serverPort}`);
        if (!server) {
            outputChannel.appendLine('Server not running, starting now...');
            try {
                await startServer(context);
                outputChannel.appendLine(`✅ Server started on port ${serverPort}`);
            }
            catch (error) {
                outputChannel.appendLine(`❌ Failed to start server: ${error}`);
            }
        }
        else {
            outputChannel.appendLine(`Server already running on port ${serverPort}`);
        }
        vscode.window.showInformationMessage(`API Parser: Check Output panel for logs. Server on port ${serverPort || 'not running'}`);
        // Try to open the view
        try {
            await vscode.commands.executeCommand('workbench.view.extension.apiParser');
        }
        catch (error) {
            outputChannel.appendLine(`❌ Failed to open view: ${error}`);
        }
    }));
    // test command to force view resolution
    context.subscriptions.push(vscode.commands.registerCommand('apiParser.test', async () => {
        outputChannel.appendLine('🧪 Test command triggered!');
        try {
            await vscode.commands.executeCommand('workbench.view.extension.apiParser');
            outputChannel.appendLine('✅ View command executed');
        }
        catch (error) {
            outputChannel.appendLine(`❌ Failed to execute view command: ${error}`);
        }
    }));
    // test webview without server
    context.subscriptions.push(vscode.commands.registerCommand('apiParser.testWebview', () => {
        outputChannel.appendLine('🔬 Testing WebView without server...');
        if (currentWebviewView) {
            currentWebviewView.webview.html = getTestContent();
            outputChannel.appendLine('✅ Test content set to WebView');
        }
        else {
            outputChannel.appendLine('❌ No WebView available. Open the API Parser panel first.');
            vscode.window.showWarningMessage('Please open the API Parser panel first, then run this test.');
        }
    }));
    // open server in browser for debugging
    context.subscriptions.push(vscode.commands.registerCommand('apiParser.openInBrowser', async () => {
        outputChannel.appendLine('🌐 Opening server in browser...');
        if (!server) {
            try {
                await startServer(context);
            }
            catch (error) {
                vscode.window.showErrorMessage(`Failed to start server: ${error}`);
                return;
            }
        }
        if (serverPort) {
            const url = `http://localhost:${serverPort}`;
            vscode.env.openExternal(vscode.Uri.parse(url));
            outputChannel.appendLine(`✅ Opened ${url} in browser`);
        }
        else {
            vscode.window.showErrorMessage('Server is not running');
        }
    }));
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('API Parser extension activated successfully!');
    outputChannel.appendLine('💡 To open API Parser, click on the icon in Activity Bar or run "Open YAML Docs" command');
}
function deactivate() {
    outputChannel?.appendLine('API Parser extension deactivating...');
    if (server) {
        server.close();
        server = null;
        serverPort = null;
    }
    outputChannel?.dispose();
}
async function startServer(context) {
    try {
        outputChannel.appendLine('Starting Express server...');
        outputChannel.appendLine(`Extension path: ${context.extensionPath}`);
        outputChannel.appendLine(`Extension URI: ${context.extensionUri.toString()}`);
        const app = (0, express_1.default)();
        // static files shipped with extension
        const staticPath = path.join(context.extensionPath, 'resources', 'web');
        outputChannel.appendLine(`Static files path: ${staticPath}`);
        outputChannel.appendLine(`Static path exists: ${fs.existsSync(staticPath)}`);
        // Check if static files exist
        if (!fs.existsSync(staticPath)) {
            outputChannel.appendLine(`❌ Static files not found at: ${staticPath}`);
            // Try to list what's in extension path
            try {
                const extensionContents = fs.readdirSync(context.extensionPath);
                outputChannel.appendLine(`Extension path contents: ${extensionContents.join(', ')}`);
                // Check if resources folder exists
                const resourcesPath = path.join(context.extensionPath, 'resources');
                if (fs.existsSync(resourcesPath)) {
                    const resourcesContents = fs.readdirSync(resourcesPath);
                    outputChannel.appendLine(`Resources folder contents: ${resourcesContents.join(', ')}`);
                }
            }
            catch (listErr) {
                outputChannel.appendLine(`Error listing directory: ${listErr}`);
            }
            throw new Error(`Static files not found at: ${staticPath}`);
        }
        // List what's actually in the static path
        try {
            const staticContents = fs.readdirSync(staticPath);
            outputChannel.appendLine(`Static path contents: ${staticContents.join(', ')}`);
        }
        catch (listErr) {
            outputChannel.appendLine(`Error listing static directory: ${listErr}`);
        }
        // Configure Express to serve static files with correct MIME types for ES6 modules
        app.use(express_1.default.static(staticPath, {
            setHeaders: (res, filePath) => {
                // Ensure .js files are served with correct MIME type for ES6 modules
                if (filePath.endsWith('.js')) {
                    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
                }
                // Ensure .mjs files are served with correct MIME type
                if (filePath.endsWith('.mjs')) {
                    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
                }
                // Add CORS headers to allow loading from webview
                res.setHeader('Access-Control-Allow-Origin', '*');
            }
        }));
        // Log all requests for debugging
        app.use((req, res, next) => {
            const timestamp = new Date().toISOString();
            outputChannel.appendLine(`📥 [${timestamp}] ${req.method} ${req.path}`);
            next();
        });
        // Explicit route for root to ensure index.html is served
        app.get('/', (req, res) => {
            const indexPath = path.join(staticPath, 'index.html');
            outputChannel.appendLine(`🏠 Serving index.html from: ${indexPath}`);
            outputChannel.appendLine(`   File exists: ${fs.existsSync(indexPath)}`);
            if (fs.existsSync(indexPath)) {
                res.sendFile(indexPath);
            }
            else {
                outputChannel.appendLine(`❌ index.html not found!`);
                res.status(404).send('index.html not found');
            }
        });
        // parse text bodies (used for /api/save)
        app.use(express_1.default.text({ type: '*/*' }));
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceRoot = workspaceFolders && workspaceFolders.length > 0
            ? workspaceFolders[0].uri.fsPath
            : null;
        outputChannel.appendLine(`Workspace root: ${workspaceRoot || 'None'}`);
        app.get('/api/file', (req, res) => {
            const rel = req.query.path;
            outputChannel.appendLine(`📄 GET /api/file?path=${rel}`);
            if (!workspaceRoot) {
                outputChannel.appendLine('❌ No workspace folder');
                return res.status(500).send('No workspace folder');
            }
            if (!rel) {
                outputChannel.appendLine('❌ Missing path parameter');
                return res.status(400).send('path query required');
            }
            const full = path.join(workspaceRoot, rel);
            outputChannel.appendLine(`📁 Reading file: ${full}`);
            fs.stat(full, (err, stats) => {
                if (err || stats.isDirectory()) {
                    outputChannel.appendLine(`❌ File not found or is directory: ${full}`);
                    return res.status(404).end();
                }
                fs.readFile(full, 'utf8', (err2, data) => {
                    if (err2) {
                        outputChannel.appendLine(`❌ Error reading file: ${err2.message}`);
                        return res.status(500).end();
                    }
                    outputChannel.appendLine(`✅ File read successfully: ${data.length} chars`);
                    res.type('text/plain; charset=utf-8').send(data);
                });
            });
        });
        app.get('/api/exists', (req, res) => {
            const rel = req.query.path;
            outputChannel.appendLine(`🔍 GET /api/exists?path=${rel}`);
            if (!workspaceRoot) {
                outputChannel.appendLine('❌ No workspace folder');
                return res.status(500).send('No workspace folder');
            }
            if (!rel) {
                outputChannel.appendLine('❌ Missing path parameter');
                return res.status(400).send('path query required');
            }
            const full = path.join(workspaceRoot, rel);
            fs.access(full, fs.constants.F_OK, (err) => {
                const exists = !err;
                outputChannel.appendLine(`${exists ? '✅' : '❌'} File ${exists ? 'exists' : 'not found'}: ${full}`);
                res.status(exists ? 200 : 404).end();
            });
        });
        app.post('/api/save', (req, res) => {
            const rel = req.query.path;
            const content = req.body || '';
            outputChannel.appendLine(`💾 POST /api/save?path=${rel} (${content.length} chars)`);
            if (!workspaceRoot) {
                outputChannel.appendLine('❌ No workspace folder');
                return res.status(500).send('No workspace folder');
            }
            if (!rel) {
                outputChannel.appendLine('❌ Missing path parameter');
                return res.status(400).send('path query required');
            }
            const full = path.join(workspaceRoot, rel);
            const parent = path.dirname(full);
            outputChannel.appendLine(`📁 Saving to: ${full}`);
            // Create directory if it doesn't exist
            fs.mkdir(parent, { recursive: true }, (err) => {
                if (err) {
                    outputChannel.appendLine(`❌ Failed to create directory: ${err.message}`);
                    return res.status(500).send('Failed to create directory');
                }
                fs.writeFile(full, content, 'utf8', (err2) => {
                    if (err2) {
                        outputChannel.appendLine(`❌ Failed to save file: ${err2.message}`);
                        return res.status(500).send('Failed to save file');
                    }
                    outputChannel.appendLine(`✅ File saved successfully: ${full}`);
                    // Show VS Code notification
                    vscode.window.showInformationMessage(`Saved: ${path.basename(full)}`);
                    res.status(200).send('File saved successfully');
                });
            });
        });
        app.post('/api/open-browser', (req, res) => {
            outputChannel.appendLine('🌐 POST /api/open-browser - opening in external browser');
            if (serverPort) {
                const url = `http://localhost:${serverPort}`;
                vscode.env.openExternal(vscode.Uri.parse(url));
                outputChannel.appendLine(`✅ Opened ${url} in external browser`);
                res.status(200).send('Browser opened');
            }
            else {
                outputChannel.appendLine('❌ Server not running');
                res.status(500).send('Server not running');
            }
        });
        serverPort = await (0, get_port_1.default)({ port: get_port_1.default.makeRange(3000, 3999) });
        outputChannel.appendLine(`Attempting to start server on port ${serverPort}...`);
        return new Promise((resolve, reject) => {
            server = app.listen(serverPort, () => {
                outputChannel.appendLine(`✅ API Parser server running on port ${serverPort}`);
                console.log('API Parser server running on port', serverPort);
                resolve();
            }).on('error', (error) => {
                outputChannel.appendLine(`❌ Server error: ${error.message}`);
                reject(error);
            });
        });
    }
    catch (error) {
        outputChannel.appendLine(`❌ Failed to start server: ${error}`);
        throw error;
    }
}
//# sourceMappingURL=extension.js.map