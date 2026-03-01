import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import express, { Request, Response } from 'express';
import getPort from 'get-port';
import * as http from 'http';

let server: http.Server | null = null;
let serverPort: number | null = null;

// provider for the activity‑bar view
class ApiParserViewProvider implements vscode.WebviewViewProvider {
    // must match containerId.viewId from package.json
    public static readonly viewType = 'apiParser.apiParserView';
    constructor(private readonly context: vscode.ExtensionContext) {
        console.log('ApiParserViewProvider constructor');
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ) {
        console.log('resolveWebviewView called for', webviewView.viewType);
        webviewView.webview.options = {
            enableScripts: true
        };

        if (!server) {
            await startServer(this.context);
        }
        if (serverPort === null) {
            webviewView.webview.html = '<p>Server failed to start</p>';
            return;
        }
        const url = `http://localhost:${serverPort}`;
        webviewView.webview.html = getWebviewContent(url);
    }
}

function getWebviewContent(url: string): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http: https:; script-src 'unsafe-inline' 'unsafe-eval' http://localhost:${serverPort}; style-src 'unsafe-inline';"></head>
        <body style="margin:0;padding:0;overflow:hidden">
        <iframe src="${url}" style="width:100%;height:100%;border:0"></iframe>
        </body>
        </html>
    `;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('API Parser extension activate()');
    console.log('activation events:', context.subscriptions.length, 'workspaceFolders', vscode.workspace.workspaceFolders);
    console.log('registered activationEvents from manifest', vscode.extensions.getExtension('api-parser-vscode')?.packageJSON.activationEvents);

    // register the sidebar view provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ApiParserViewProvider.viewType,  // fully qualified
            new ApiParserViewProvider(context)
        )
    );

    // keep a command for backwards compatibility that simply reveals the view
    context.subscriptions.push(
        vscode.commands.registerCommand('apiParser.open', () => {
            return vscode.commands.executeCommand('workbench.view.extension.apiParser');
        })
    );
}

export function deactivate() {
    if (server) {
        server.close();
        server = null;
        serverPort = null;
    }
}

async function startServer(context: vscode.ExtensionContext): Promise<void> {
    const app = express();

    // static files shipped with extension
    const staticPath = path.join(context.extensionPath, 'resources', 'web');
    app.use(express.static(staticPath));

    // parse text bodies (used for /api/save)
    app.use(express.text({ type: '*/*' }));

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders && workspaceFolders.length > 0
        ? workspaceFolders[0].uri.fsPath
        : null;

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
    return new Promise((resolve, reject) => {
        server = app.listen(serverPort!, () => {
            console.log('API Parser server running on port', serverPort);
            resolve();
        }).on('error', reject);
    });
}
