import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import express, { Request, Response } from 'express';
import getPort from 'get-port';
import * as http from 'http';

let server: http.Server | null = null;
let serverPort: number | null = null;
let outputChannel: vscode.OutputChannel;
let currentWebviewView: vscode.WebviewView | null = null;

// provider for the activity‑bar view
class ApiParserViewProvider implements vscode.WebviewViewProvider {
    // must match containerId.viewId from package.json
    public static readonly viewType = 'apiParser.apiParserView';
    
    constructor(private readonly context: vscode.ExtensionContext) {
        console.log('ApiParserViewProvider constructor');
        outputChannel.appendLine('🏗️ ApiParserViewProvider created');
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ) {
        currentWebviewView = webviewView; // Save reference for testing
        console.log('resolveWebviewView called for', webviewView.viewType);
        outputChannel.appendLine(`🔍 resolveWebviewView called for viewType: ${webviewView.viewType}`);
        
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };
        outputChannel.appendLine('✅ Webview options set');

        try {
            if (!server) {
                outputChannel.appendLine('🚀 Starting server for the first time...');
                await startServer(this.context);
            }
            if (serverPort === null) {
                outputChannel.appendLine('❌ Server port is null, showing error');
                webviewView.webview.html = getErrorContent('Server failed to start');
                return;
            }
            const url = `http://localhost:${serverPort}`;
            outputChannel.appendLine(`🌐 Setting webview HTML for URL: ${url}`);
            webviewView.webview.html = getWebviewContent(url, serverPort);
            outputChannel.appendLine('✅ Webview HTML set successfully');
        } catch (error) {
            console.error('Error resolving webview:', error);
            outputChannel.appendLine(`❌ Error resolving webview: ${error}`);
            webviewView.webview.html = getErrorContent(`Error: ${error}`);
        }
    }
}

function getWebviewContent(url: string, port: number): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://localhost:${port} https:; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline';">
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
            </style>
        </head>
        <body>
            <iframe src="${url}" title="API Parser Web Interface"></iframe>
        </body>
        </html>
    `;
}

function getTestContent(): string {
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

function getErrorContent(message: string): string {
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

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('API Parser');
    outputChannel.appendLine('API Parser extension activating...');
    outputChannel.show(); // Force show output panel for debugging
    
    console.log('API Parser extension activate()');
    console.log('activation events:', context.subscriptions.length, 'workspaceFolders', vscode.workspace.workspaceFolders);
    console.log('registered activationEvents from manifest', vscode.extensions.getExtension('api-parser-vscode')?.packageJSON.activationEvents);

    // register the sidebar view provider
    const provider = new ApiParserViewProvider(context);
    outputChannel.appendLine(`📝 Created provider, registering viewType: '${ApiParserViewProvider.viewType}'`);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ApiParserViewProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );
    outputChannel.appendLine('✅ WebviewViewProvider registered successfully');

    // keep a command for backwards compatibility that simply reveals the view
    context.subscriptions.push(
        vscode.commands.registerCommand('apiParser.open', () => {
            outputChannel.appendLine('Opening API Parser view...');
            return vscode.commands.executeCommand('workbench.view.extension.apiParser');
        })
    );

    // test command to force view resolution
    context.subscriptions.push(
        vscode.commands.registerCommand('apiParser.test', async () => {
            outputChannel.appendLine('🧪 Test command triggered!');
            try {
                await vscode.commands.executeCommand('workbench.view.extension.apiParser');
                outputChannel.appendLine('✅ View command executed');
            } catch (error) {
                outputChannel.appendLine(`❌ Failed to execute view command: ${error}`);
            }
        })
    );

    // test webview without server
    context.subscriptions.push(
        vscode.commands.registerCommand('apiParser.testWebview', () => {
            outputChannel.appendLine('🔬 Testing WebView without server...');
            if (currentWebviewView) {
                currentWebviewView.webview.html = getTestContent();
                outputChannel.appendLine('✅ Test content set to WebView');
            } else {
                outputChannel.appendLine('❌ No WebView available. Open the API Parser panel first.');
                vscode.window.showWarningMessage('Please open the API Parser panel first, then run this test.');
            }
        })
    );

    // open server in browser for debugging
    context.subscriptions.push(
        vscode.commands.registerCommand('apiParser.openInBrowser', async () => {
            outputChannel.appendLine('🌐 Opening server in browser...');
            if (!server) {
                try {
                    await startServer(context);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to start server: ${error}`);
                    return;
                }
            }
            if (serverPort) {
                const url = `http://localhost:${serverPort}`;
                vscode.env.openExternal(vscode.Uri.parse(url));
                outputChannel.appendLine(`✅ Opened ${url} in browser`);
            } else {
                vscode.window.showErrorMessage('Server is not running');
            }
        })
    );

    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('API Parser extension activated successfully!');
    
    // Auto-show view for debugging
    setTimeout(async () => {
        outputChannel.appendLine('🔄 Auto-opening API Parser view for testing...');
        try {
            await vscode.commands.executeCommand('workbench.view.extension.apiParser');
            outputChannel.appendLine('✅ Auto-open view command executed');
        } catch (error) {
            outputChannel.appendLine(`❌ Auto-open failed: ${error}`);
        }
    }, 1000);
}

export function deactivate() {
    outputChannel?.appendLine('API Parser extension deactivating...');
    if (server) {
        server.close();
        server = null;
        serverPort = null;
    }
    outputChannel?.dispose();
}

async function startServer(context: vscode.ExtensionContext): Promise<void> {
    try {
        outputChannel.appendLine('Starting Express server...');
        const app = express();

        // static files shipped with extension
        const staticPath = path.join(context.extensionPath, 'resources', 'web');
        outputChannel.appendLine(`Static files path: ${staticPath}`);
        
        // Check if static files exist
        if (!fs.existsSync(staticPath)) {
            throw new Error(`Static files not found at: ${staticPath}`);
        }
        
        app.use(express.static(staticPath));

        // parse text bodies (used for /api/save)
        app.use(express.text({ type: '*/*' }));

        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceRoot = workspaceFolders && workspaceFolders.length > 0
            ? workspaceFolders[0].uri.fsPath
            : null;
        
        outputChannel.appendLine(`Workspace root: ${workspaceRoot || 'None'}`);

        app.get('/api/file', (req: Request, res: Response) => {
            if (!workspaceRoot) {
                return res.status(500).send('No workspace folder');
            }
            const rel = req.query.path as string;
            if (!rel) return res.status(400).send('path query required');
            const full = path.join(workspaceRoot, rel);
            fs.stat(full, (err: NodeJS.ErrnoException | null, stats: fs.Stats) => {
                if (err || stats.isDirectory()) {
                    return res.status(404).end();
                }
                fs.readFile(full, 'utf8', (err2: NodeJS.ErrnoException | null, data: string) => {
                    if (err2) return res.status(500).end();
                    res.type('text/plain; charset=utf-8').send(data);
                });
            });
        });

        app.get('/api/exists', (req: Request, res: Response) => {
            if (!workspaceRoot) {
                return res.status(500).send('No workspace folder');
            }
            const rel = req.query.path as string;
            if (!rel) return res.status(400).send('path query required');
            const full = path.join(workspaceRoot, rel);
            fs.access(full, fs.constants.F_OK, (err: NodeJS.ErrnoException | null) => {
                res.status(err ? 404 : 200).end();
            });
        });

        app.post('/api/save', (req: Request, res: Response) => {
            if (!workspaceRoot) {
                return res.status(500).send('No workspace folder');
            }
            const rel = req.query.path as string;
            if (!rel) return res.status(400).send('path query required');
            const full = path.join(workspaceRoot, rel);
            const parent = path.dirname(full);
            fs.access(parent, fs.constants.F_OK, (err: NodeJS.ErrnoException | null) => {
                if (err) {
                    return res.status(404).end();
                }
                fs.writeFile(full, req.body || '', 'utf8', (err2: NodeJS.ErrnoException | null) => {
                    if (err2) return res.status(500).end();
                    res.status(200).end();
                });
            });
        });

        serverPort = await getPort({ port: getPort.makeRange(3000, 3999) });
        outputChannel.appendLine(`Attempting to start server on port ${serverPort}...`);
        
        return new Promise((resolve, reject) => {
            server = app.listen(serverPort!, () => {
                outputChannel.appendLine(`✅ API Parser server running on port ${serverPort}`);
                console.log('API Parser server running on port', serverPort);
                resolve();
            }).on('error', (error) => {
                outputChannel.appendLine(`❌ Server error: ${error.message}`);
                reject(error);
            });
        });
    } catch (error) {
        outputChannel.appendLine(`❌ Failed to start server: ${error}`);
        throw error;
    }
}
