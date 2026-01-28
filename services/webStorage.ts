import { ProjectMetadata, AppState } from '../types';
import { v4 as uuidv4 } from 'uuid';

const RECENTS_KEY = 'lumiere_recents';
const PROJECT_PREFIX = 'lumiere_project_';

export const webStorage = {
  async listRecentProjects(): Promise<ProjectMetadata[]> {
    try {
      const json = localStorage.getItem(RECENTS_KEY);
      return json ? JSON.parse(json) : [];
    } catch (e) {
      console.error("Error listing projects", e);
      return [];
    }
  },

  async createProject(name: string): Promise<ProjectMetadata> {
    const id = uuidv4();
    const metadata: ProjectMetadata = {
      id,
      name,
      path: 'local-storage', // Placeholder for web
      lastOpened: Date.now(),
      createdAt: Date.now()
    };
    
    // Save initial state
    const initialState: AppState = {
      items: [],
      connections: [],
      pan: { x: 0, y: 0 },
      scale: 1,
      selectedIds: [],
      selectionBox: null
    };
    
    try {
      localStorage.setItem(PROJECT_PREFIX + id, JSON.stringify(initialState));
      
      // Update recents
      const recents = await this.listRecentProjects();
      recents.unshift(metadata);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
    } catch (e) {
      console.error("Error creating project", e);
      throw e;
    }

    return metadata;
  },

  async saveProject(id: string, state: AppState): Promise<void> {
    try {
      localStorage.setItem(PROJECT_PREFIX + id, JSON.stringify(state));
      
      // Update last opened timestamp and move to top
      const recents = await this.listRecentProjects();
      const index = recents.findIndex(r => r.id === id);
      
      if (index !== -1) {
        const metadata = recents[index];
        metadata.lastOpened = Date.now();
        
        // Remove from current position and add to start
        recents.splice(index, 1);
        recents.unshift(metadata);
        
        localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
      }
    } catch (e) {
       console.error("Error saving project", e);
    }
  },

  async loadProject(id: string): Promise<{ state: AppState; metadata: ProjectMetadata }> {
    const stateJson = localStorage.getItem(PROJECT_PREFIX + id);
    if (!stateJson) throw new Error('Project data not found locally');
    
    const recents = await this.listRecentProjects();
    const metadata = recents.find(r => r.id === id);
    
    // Create dummy metadata if missing from recents but data exists (recovery)
    const finalMetadata = metadata || {
        id,
        name: 'Recovered Project',
        path: 'local-storage',
        lastOpened: Date.now(),
        createdAt: Date.now()
    };

    // Update last opened on load
    await this.saveProject(id, JSON.parse(stateJson));
    
    return { state: JSON.parse(stateJson), metadata: finalMetadata };
  },

  async deleteProject(id: string): Promise<void> {
    try {
      localStorage.removeItem(PROJECT_PREFIX + id);
      let recents = await this.listRecentProjects();
      recents = recents.filter(r => r.id !== id);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
    } catch (e) {
      console.error("Error deleting project", e);
      throw e; // Rethrow to inform UI
    }
  },
  
  // Web implementation of export (download JSON with .mix3d extension)
  async exportProject(id: string, fileName: string): Promise<boolean> {
      try {
          const stateJson = localStorage.getItem(PROJECT_PREFIX + id);
          if (!stateJson) return false;
          
          const blob = new Blob([stateJson], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          
          const a = document.createElement('a');
          a.href = url;
          a.download = `${fileName}.mix3d`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          return true;
      } catch (e) {
          console.error("Export failed", e);
          return false;
      }
  },
  
  // Web implementation of import
  async importProject(file: File): Promise<ProjectMetadata | null> {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async (e) => {
              try {
                  const content = e.target?.result as string;
                  const state = JSON.parse(content);
                  // Basic validation
                  if (!state.items) throw new Error("Invalid project file");
                  
                  // Create new project with this content
                  // Clean extension
                  const name = file.name.replace(/\.mix3d$/i, '').replace(/\.json$/i, '');
                  const metadata = await this.createProject(name + " (Imported)");
                  await this.saveProject(metadata.id, state);
                  resolve(metadata);
              } catch (err) {
                  reject(err);
              }
          };
          reader.readAsText(file);
      });
  }
};