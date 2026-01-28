import fs from "fs/promises";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";
import { v4 as uuidv4 } from "uuid";
import { app, BrowserWindow, ipcMain, dialog, shell, protocol } from "electron";
import http from "http";
import { URL } from "url";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// Types
interface ProjectMetadata {
  id: string;
  uid: string;          // ✅ added
  name: string;
  path: string;
  lastOpened: number;
  createdAt: number;
}

const APP_NAME = "MoodBoard By Mix 3D Design";

// ✅ NEW BASE DIR: Documents/MoodBoard
const APP_DIR = path.join(os.homedir(), "Documents", "MoodBoard");

// Recents stored once (contains uid so we can filter)
const RECENTS_FILE = path.join(APP_DIR, "recents.json");

// Ensure base directory exists
if (!existsSync(APP_DIR)) {
  mkdirSync(APP_DIR, { recursive: true });
}

// --- Helpers ---

function sanitizeFolderName(input: string) {
  return (input || "Untitled").replace(/[^a-z0-9]/gi, "_");
}

function getUserProjectsDir(uid: string) {
  const safeUid = sanitizeFolderName(uid);
  return path.join(APP_DIR, "users", safeUid, "projects");
}

/**
 * ✅ FIX: Normalize both file:// URLs and regular paths to absolute filesystem paths
 * This fixes the "Blocked path (outside allowed root)" error in packaged builds
 */
function normalizeAbsPath(p: string) {
  let out = String(p || "");

  // Convert file:// URL to real path
  if (out.startsWith("file://")) {
    // Remove file:// or file:/// prefix
    out = decodeURIComponent(out.replace(/^file:\/+/, ""));

    // On Windows, the URL format is file:///C:/path
    // After removing file:///, we get C:/path
    // Convert forward slashes to backslashes for Windows
    if (process.platform === "win32") {
      out = out.replace(/\//g, "\\");
    }
  }

  return path.resolve(out);
}

async function getRecents(): Promise<ProjectMetadata[]> {
  try {
    const data = await fs.readFile(RECENTS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveRecents(recents: ProjectMetadata[]) {
  await fs.writeFile(RECENTS_FILE, JSON.stringify(recents, null, 2));
}

async function updateRecentsList(metadata: ProjectMetadata) {
  let recents = await getRecents();

  // Remove existing entry for this ID
  recents = recents.filter((r) => r.id !== metadata.id);

  // Add to top
  recents.unshift(metadata);

  // Keep last 50 (you can change)
  if (recents.length > 50) recents = recents.slice(0, 50);

  await saveRecents(recents);
}
  
// --- IPC Handlers ---

/**
 * ✅ Now supports:
 * - listRecentProjects(uid) -> returns only that user's projects
 * - listRecentProjects()    -> returns all (fallback)
 */
ipcMain.handle("project:list-recent", async (_, uid?: string) => {
  const recents = await getRecents();

  // Filter out projects that no longer exist on disk
  const existingRecents: ProjectMetadata[] = [];
  for (const r of recents) {
    if (existsSync(r.path)) existingRecents.push(r);
  }
  if (existingRecents.length !== recents.length) {
    await saveRecents(existingRecents);
  }

  if (!uid) return existingRecents;
  return existingRecents.filter((r) => r.uid === uid);
});

/**
 * ✅ FIXED: Properly handles file:// URLs by normalizing them before security check
 * This was the root cause of "Blocked path (outside allowed root)" errors
 */
ipcMain.handle(
  "assets:readDataUrl",
  async (_event, args: { absPath: string; allowedRoot: string }) => {
    const { absPath, allowedRoot } = args;

    // ✅ FIX: Use the updated normalizeAbsPath that handles file:// URLs
    const normalizedRoot = normalizeAbsPath(allowedRoot);
    const normalizedPath = normalizeAbsPath(absPath);

    const inside =
      normalizedPath === normalizedRoot ||
      normalizedPath.startsWith(normalizedRoot + path.sep);

    if (!inside) {
      console.error("Security check failed:", {
        absPath,
        allowedRoot,
        normalizedPath,
        normalizedRoot,
      });
      throw new Error("Blocked path (outside allowed root)");
    }

    const buf = await fs.readFile(normalizedPath);
    const mime = getMimeFromExt(path.extname(normalizedPath));
    const base64 = buf.toString("base64");

    return `data:${mime};base64,${base64}`;
  }
);

/**
 * ✅ IMPORTANT:
 * Your preload now calls:
 *   ipcRenderer.invoke("project:create", { uid, name })
 */
ipcMain.handle("project:create", async (_, payload: { uid: string; name: string }) => {
  const { uid, name } = payload || ({} as any);
  if (!uid) throw new Error("Not signed in.");

  const userProjectsDir = getUserProjectsDir(uid);
  await fs.mkdir(userProjectsDir, { recursive: true });

  const id = uuidv4();
  const safeName = sanitizeFolderName(name);
  const projectFolderName = `${safeName}_${id.substring(0, 6)}`;

  const projectPath = path.join(userProjectsDir, projectFolderName);
  const assetsPath = path.join(projectPath, "assets");

  await fs.mkdir(projectPath, { recursive: true });
  await fs.mkdir(assetsPath, { recursive: true });

  const metadata: ProjectMetadata = {
    id,
    uid,
    name,
    path: projectPath,
    lastOpened: Date.now(),
    createdAt: Date.now(),
  };

  const initialState = {
    items: [],
    connections: [],
    pan: { x: 0, y: 0 },
    scale: 1,
    selectedIds: [],
    selectionBox: null,
  };

  await fs.writeFile(
    path.join(projectPath, "project.json"),
    JSON.stringify(initialState, null, 2)
  );
  await updateRecentsList(metadata);

  return metadata;
});

ipcMain.handle("project:save", async (_, { id, state }) => {
  const recents = await getRecents();
  const project = recents.find((r) => r.id === id);
  if (!project) throw new Error("Project not found in recents");

  const projectPath = project.path;
  const assetsPath = path.join(projectPath, "assets");

  // Process items to save images locally
  const processedItems = await Promise.all(
    state.items.map(async (item: any) => {
      if (item.type === "image" && item.content) {
        // Case 1: Base64 Data URL
        if (typeof item.content === "string" && item.content.startsWith("data:image")) {
          const matches = item.content.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
          if (matches) {
            const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
            const buffer = Buffer.from(matches[2], "base64");
            const fileName = `${item.id}.${ext}`;
            await fs.writeFile(path.join(assetsPath, fileName), buffer);
            return { ...item, content: `assets/${fileName}` };
          }
        }
        // Case 2: External File Path
        else if (typeof item.content === "string" && path.isAbsolute(item.content) && !item.content.includes(assetsPath)) {
          const ext = path.extname(item.content);
          const fileName = `${item.id}${ext}`;
          await fs.copyFile(item.content, path.join(assetsPath, fileName));
          return { ...item, content: `assets/${fileName}` };
        }
      }
      return item;
    })
  );

  const stateToSave = { ...state, items: processedItems };
  await fs.writeFile(
    path.join(projectPath, "project.json"),
    JSON.stringify(stateToSave, null, 2)
  );

  // Update timestamp
  project.lastOpened = Date.now();
  await updateRecentsList(project);
});

ipcMain.handle("project:load", async (_, id: string) => {
  const recents = await getRecents();
  const project = recents.find((r) => r.id === id);
  if (!project) throw new Error("Project not found");

  const projectPath = project.path;
  const jsonPath = path.join(projectPath, "project.json");
  const rawData = await fs.readFile(jsonPath, "utf-8");
  const state = JSON.parse(rawData);

  // ✅ FIX: Use proper Windows file URL format (file:/// with 3 slashes)
  // Convert "assets/" paths to absolute "file://" paths for the renderer
  state.items = state.items.map((item: any) => {
    if (item.type === "image" && item.content && typeof item.content === "string" && item.content.startsWith("assets/")) {
      const absolutePath = path.join(projectPath, item.content);
      
      // ✅ IMPORTANT: On Windows, use file:/// (3 slashes) format
      // file:///C:/Users/... is the correct format
      const fileUrl = process.platform === "win32"
        ? `file:///${absolutePath.replace(/\\/g, "/")}`
        : `file://${absolutePath}`;
      
      return { ...item, content: fileUrl };
    }
    return item;
  });

  // Update Opened Time
  project.lastOpened = Date.now();
  await updateRecentsList(project);

  return { state, metadata: project };
});

ipcMain.handle("project:delete", async (_, id: string) => {
  let recents = await getRecents();
  const project = recents.find((r) => r.id === id);

  if (project) {
    try {
      await fs.rm(project.path, { recursive: true, force: true });
    } catch (e) {
      console.error("Could not delete folder", e);
    }
  }

  recents = recents.filter((r) => r.id !== id);
  await saveRecents(recents);
});

ipcMain.handle("project:export", async (_, id: string) => {
  const recents = await getRecents();
  const project = recents.find((r) => r.id === id);
  if (!project) return false;

  const { filePath } = await dialog.showSaveDialog({
    title: "Export Moodboard",
    defaultPath: `${project.name}.mix3d`,
    filters: [{ name: `${APP_NAME} Project`, extensions: ["mix3d"] }],
  });

  if (!filePath) return false;

const zip = new AdmZip();

// Put the folder contents at the ZIP root
zip.addLocalFolder(project.path, "");

// Create the zip in-memory then write as binary
const buffer = zip.toBuffer();
writeFileSync(filePath, buffer);

return true;

});

/**
 * ✅ Recommended update:
 * Import should also belong to a user.
 * If you later pass uid from preload, it will go to that user's folder.
 * For now, it will import under "anonymous".
 */
ipcMain.handle("project:import", async (_, payload?: { uid?: string }) => {
  const uid = payload?.uid || "anonymous";

  const { filePaths } = await dialog.showOpenDialog({
    title: "Import Moodboard",
    filters: [{ name: `${APP_NAME} Project`, extensions: ["mix3d"] }],
    properties: ["openFile"],
  });

  if (filePaths.length === 0) return null;

  const sourcePath = filePaths[0];
  const zip = new AdmZip(sourcePath);

  const projectEntry = zip.getEntry("project.json");
  if (!projectEntry) throw new Error("Invalid moodboard file");

  const userProjectsDir = getUserProjectsDir(uid);
  await fs.mkdir(userProjectsDir, { recursive: true });

  // Generate new ID and Folder to avoid conflicts
  const newId = uuidv4();
  const name = path.basename(sourcePath, ".mix3d");
  const folderName = `${sanitizeFolderName(name)}_${newId.substring(0, 6)}`;
  const destinationPath = path.join(userProjectsDir, folderName);

  zip.extractAllTo(destinationPath, true);

  const metadata: ProjectMetadata = {
    id: newId,
    uid,
    name,
    path: destinationPath,
    lastOpened: Date.now(),
    createdAt: Date.now(),
  };

  await updateRecentsList(metadata);
  return metadata;
});

ipcMain.handle("shell:open", (_, url) => shell.openExternal(url));
function contentType(file: string) {
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

async function startRendererServer(distDir: string): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
        let rel = decodeURIComponent(reqUrl.pathname);

        if (rel === "/") rel = "/index.html";

        // prevent path traversal
        rel = rel.replace(/\.\./g, "");

        let filePath = path.join(distDir, rel);

        // If file doesn't exist, fallback to SPA index.html
        if (!existsSync(filePath)) {
          filePath = path.join(distDir, "index.html");
        }

        const data = await fs.readFile(filePath);
        res.writeHead(200, { "Content-Type": contentType(filePath) });
        res.end(data);
      } catch (e) {
        res.writeHead(500);
        res.end("Server error");
      }
    });

    server.on("error", reject);

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") resolve(addr.port);
      else reject(new Error("Could not get port"));
    });
  });
}
function getMimeFromExt(ext: string) {
  switch (ext.toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    webPreferences: {
  contextIsolation: true,
  preload: path.join(__dirname, "preload.js"),
},

  });

  // Allow popup windows (Google login)
  win.webContents.setWindowOpenHandler(() => ({ action: "allow" }));

  // DEV
  if (!app.isPackaged) {
    await win.loadURL("http://127.0.0.1:3000");
    win.webContents.openDevTools({ mode: "detach" });
    return;
  }

  // PACKAGED: serve dist via local http so Firebase accepts the domain
  const distDir = path.join(__dirname, "..", "dist");
  const port = await startRendererServer(distDir);
  await win.loadURL(`http://127.0.0.1:${port}`);
}
app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
