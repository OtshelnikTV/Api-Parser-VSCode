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
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('apiParser.open', async () => {
        try {
            if (!server) {
                await startServer(context);
            }
            if (serverPort === null) {
                vscode.window.showErrorMessage('Server failed to start');
                return;
            }
            const panel = vscode.window.createWebviewPanel('apiParser', 'YAML Docs', vscode.ViewColumn.One, {
                enableScripts: true,
                retainContextWhenHidden: true,
                // allow the iframe to load remote content
            });
            const url = `http://localhost:${serverPort}`;
            panel.webview.html = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http: https:; script-src 'unsafe-inline' 'unsafe-eval' http://localhost:${serverPort}; style-src 'unsafe-inline';"></head>
                    <body style="margin:0;padding:0;overflow:hidden">
                    <iframe src="${url}" style="width:100%;height:100%;border:0"></iframe>
                    </body>
                    </html>
                `;
        }
        catch (err) {
            vscode.window.showErrorMessage('Failed to open API Parser: ' + err);
        }
    }));
}
function deactivate() {
    if (server) {
        server.close();
        server = null;
        serverPort = null;
    }
}
async function startServer(context) {
    const app = (0, express_1.default)();
    // static files shipped with extension
    const staticPath = path.join(context.extensionPath, 'resources', 'web');
    app.use(express_1.default.static(staticPath));
    // parse text bodies (used for /api/save)
    app.use(express_1.default.text({ type: '*/*' }));
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders && workspaceFolders.length > 0
        ? workspaceFolders[0].uri.fsPath
        : null;
    app.get('/api/file', (req, res) => {
        if (!workspaceRoot) {
            return res.status(500).send('No workspace folder');
        }
        const rel = req.query.path;
        if (!rel)
            return res.status(400).send('path query required');
        const full = path.join(workspaceRoot, rel);
        fs.stat(full, (err, stats) => {
            if (err || stats.isDirectory()) {
                return res.status(404).end();
            }
            fs.readFile(full, 'utf8', (err2, data) => {
                if (err2)
                    return res.status(500).end();
                res.type('text/plain; charset=utf-8').send(data);
            });
        });
    });
    app.get('/api/exists', (req, res) => {
        if (!workspaceRoot) {
            return res.status(500).send('No workspace folder');
        }
        const rel = req.query.path;
        if (!rel)
            return res.status(400).send('path query required');
        const full = path.join(workspaceRoot, rel);
        fs.access(full, fs.constants.F_OK, (err) => {
            res.status(err ? 404 : 200).end();
        });
    });
    app.post('/api/save', (req, res) => {
        if (!workspaceRoot) {
            return res.status(500).send('No workspace folder');
        }
        const rel = req.query.path;
        if (!rel)
            return res.status(400).send('path query required');
        const full = path.join(workspaceRoot, rel);
        const parent = path.dirname(full);
        fs.access(parent, fs.constants.F_OK, (err) => {
            if (err) {
                return res.status(404).end();
            }
            fs.writeFile(full, req.body || '', 'utf8', (err2) => {
                if (err2)
                    return res.status(500).end();
                res.status(200).end();
            });
        });
    });
    serverPort = await (0, get_port_1.default)({ port: get_port_1.default.makeRange(3000, 3999) });
    return new Promise((resolve, reject) => {
        server = app.listen(serverPort, () => {
            console.log('API Parser server running on port', serverPort);
            resolve();
        }).on('error', reject);
    });
}
//# sourceMappingURL=extension.js.map