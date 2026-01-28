import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("moodboard", {
  createProject: (uid: string | null, name: string) => {
    if (!uid) throw new Error("Not signed in.");
    return ipcRenderer.invoke("project:create", { uid, name });
  },

  saveProject: (id: string, state: any) =>
    ipcRenderer.invoke("project:save", { id, state }),

  loadProject: (id: string) =>
    ipcRenderer.invoke("project:load", id),

  listRecentProjects: (uid: string | null) => {
    if (!uid) throw new Error("Not signed in.");
    return ipcRenderer.invoke("project:list-recent", uid);
  },

  deleteProject: (id: string) =>
    ipcRenderer.invoke("project:delete", id),

  exportProject: (id: string) =>
    ipcRenderer.invoke("project:export", id),

  // ✅ FIXED: Now accepts and passes uid to import projects under the correct user
  importProject: (uid: string | null) => {
    if (!uid) throw new Error("Not signed in.");
    return ipcRenderer.invoke("project:import", { uid });
  },

  openExternal: (url: string) =>
    ipcRenderer.invoke("shell:open", url),

  // 👇 THIS IS THE FIX
  readImageDataUrl: (absPath: string, allowedRoot: string) =>
    ipcRenderer.invoke("assets:readDataUrl", {
      absPath,
      allowedRoot,
    }),
});
