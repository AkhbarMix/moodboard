export type ItemType = 'text' | 'image' | 'todo' | 'shape' | 'drawing';

export type Urgency = 'low' | 'medium' | 'high';

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  urgency: Urgency;
}

export interface DrawingPath {
  points: Position[]; // Stored relative to item.x, item.y
  color: string;
  strokeWidth: number;
}

export interface Reaction {
  emoji: string;
  count: number;
}

export interface CanvasItem {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string; // For text, image URL (base64 or file path)
  todos?: TodoItem[]; // For todo lists
  
  // Style properties
  color?: string; // Shape background or Drawing stroke color
  textColor?: string; // Specific for text items
  fontFamily?: string; // Specific for text items
  fontWeight?: string; // '400', '600', '700', '800'
  fontStyle?: string; // 'normal', 'italic'
  opacity?: number; // 0 to 1
  
  // Specifics
  shapeType?: 'rectangle' | 'circle';
  drawingData?: DrawingPath[];
  
  zIndex: number;
  
  reactions?: Reaction[];
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
  color: string;
}

export interface AppState {
  items: CanvasItem[];
  connections: Connection[];
  pan: Position;
  scale: number;
  selectedIds: string[];
  selectionBox: { start: Position, end: Position } | null;
}

// --- Electron / Project Types ---

export interface ProjectMetadata {
  id: string;
  name: string;
  path: string; // Full path to the project folder
  lastOpened: number;
  createdAt: number;
  thumbnailPath?: string;
}

export interface ElectronAPI {
  createProject: (name: string) => Promise<ProjectMetadata>;
  saveProject: (id: string, state: AppState) => Promise<void>;
  loadProject: (id: string) => Promise<{ state: AppState; metadata: ProjectMetadata }>;
  listRecentProjects: () => Promise<ProjectMetadata[]>;
  deleteProject: (id: string) => Promise<void>;
  exportProject: (id: string) => Promise<boolean>;
  importProject: () => Promise<ProjectMetadata | null>;
  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    moodboard: ElectronAPI;
  }
}