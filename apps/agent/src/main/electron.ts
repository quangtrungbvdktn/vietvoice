import { delimiter, join } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { JsonAgentStateStore } from "./json-state-store.js";
import { redeemPairingCode } from "./pairing-client.js";
import { persistPairing } from "./pairing.js";
import { ElectronSecretStorage } from "./safe-storage.js";
import { createProcessingLoop } from "./processing-runtime.js";

let pollingController: AbortController | undefined;

const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VietVoice Agent</title><style>body{font:15px system-ui;background:#10131a;color:#f5f7fa;margin:0;padding:32px}main{max-width:520px;margin:auto}label{display:grid;gap:6px;margin:16px 0}input,button{font:inherit;padding:12px;border-radius:9px;border:1px solid #394150}button{background:#7957ff;color:white;font-weight:700}#status{min-height:24px;color:#b9c1d0}</style><main><h1>VietVoice Windows Agent</h1><p>Ghép máy này với Web Dashboard bằng mã dùng một lần.</p><form id="pair"><label>Địa chỉ API<input name="apiUrl" value="http://127.0.0.1:3200" required></label><label>Mã ghép nối<input name="code" pattern="[0-9]{8}" required></label><label>Tên máy<input name="name" value="Máy dựng phim" required></label><button>Ghép nối an toàn</button></form><p id="status"></p></main><script>const status=document.querySelector('#status');document.querySelector('#pair').addEventListener('submit',async(e)=>{e.preventDefault();status.textContent='Đang ghép nối…';const data=Object.fromEntries(new FormData(e.target));try{await window.vietvoiceAgent.pair({...data,deviceId:crypto.randomUUID()});status.textContent='Đã ghép nối. Agent sẵn sàng nhận tác vụ.'}catch(error){status.textContent='Không thể ghép nối: '+error.message}})</script></html>`;

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 720,
    height: 620,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: join(__dirname, "preload.cjs") },
  });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

app.whenReady().then(async () => {
  if (app.isPackaged) process.env.PATH = `${join(process.resourcesPath, "bin")}${delimiter}${process.env.PATH ?? ""}`;
  const store = new JsonAgentStateStore(app.getPath("userData"));
  const secretStorage = new ElectronSecretStorage();
  const startPolling = async (apiUrl: string, deviceToken: string) => {
    pollingController?.abort();
    pollingController = new AbortController();
    const loop = await createProcessingLoop({
      apiUrl, deviceToken, userDataDirectory: app.getPath("userData"), workDirectory: join(app.getPath("videos"), "VietVoice"),
      resourceDirectory: process.env.PARAFORMER_RESOURCE_DIR ?? join(process.resourcesPath, "paraformer"),
    });
    loop.run(pollingController.signal).catch(() => undefined);
  };
  ipcMain.handle("agent:pair", async (_event, input) => {
    let deviceToken = "";
    const result = await redeemPairingCode(input, {
      request: fetch,
      save: async (token) => { deviceToken = token; await persistPairing(token, { secretStorage, store }); },
    });
    await store.saveConnection({ apiUrl: input.apiUrl, deviceId: input.deviceId });
    await startPolling(input.apiUrl, deviceToken);
    return result;
  });
  const [encryptedToken, connection] = await Promise.all([store.loadDeviceToken(), store.loadConnection()]);
  if (encryptedToken && connection) await startPolling(connection.apiUrl, secretStorage.decryptString(encryptedToken));
  await createWindow();
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => pollingController?.abort());
