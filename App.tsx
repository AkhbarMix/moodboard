import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CanvasItem, Connection, AppState, Position, ItemType, DrawingPath, Reaction, ProjectMetadata } from './types';
import { CanvasItemComp } from './components/CanvasItemComp';
import { HomeScreen } from './components/HomeScreen';
import { generateIdeas, generateMoodboardImage } from './services/geminiService';
import { webStorage } from './services/webStorage';
import { 
  Plus, Image as ImageIcon, Type, Square, Layout, PenTool,
  Wand2, Download, Share2, Move, ZoomIn, ZoomOut, Check, Maximize2, Palette, Droplets,
  Hand, MousePointer2, Layers, ArrowUp, ArrowDown, Save, FolderOpen, Bold, Italic, Smile, SmilePlus, X, Home, LogOut
} from 'lucide-react';
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./services/firebase";
import { logout } from "./services/authService";
import { LoginScreen } from "./components/LoginScreen";

const INITIAL_STATE: AppState = {
  items: [],
  connections: [],
  pan: { x: 0, y: 0 },
  scale: 1,
  selectedIds: [],
  selectionBox: null
};

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD'];
const SHAPE_COLORS = ['#e2e8f0', '#fecaca', '#bbf7d0', '#bfdbfe', '#ddd6fe', '#fde68a', '#e5e5e5'];

const FONTS = [
  { name: 'Serif', value: "'Playfair Display', serif" },
  { name: 'Sans', value: "'Inter', sans-serif" },
  { name: 'Montserrat', value: "'Montserrat', sans-serif" },
  { name: 'Japanese', value: "'Noto Sans JP', sans-serif" },
  { name: 'Arabic', value: "'Noto Sans Arabic', sans-serif" },
];

const EMOJIS = [
  "❤️", "👍", "👎", "🔥", "✨", "🚀", "💡", "🎨", 
  "✅", "❌", "⚠️", "⭐", "🎉", "👏", "🙌", "💀", 
  "😂", "😮", "😢", "😡", "🤔", "👀", "🧠", "💼", 
  "📝", "📅", "📍", "🎵", "📷", "💻", "🌈", "🍀"
];

// Helper to calculate point on rectangle edge intersecting with line to another center
const getRectIntersection = (center: Position, target: Position, rect: {x:number, y:number, width:number, height:number}) => {
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    
    // Half dimensions
    const w = rect.width / 2;
    const h = rect.height / 2;

    // Slopes
    if (dx === 0 && dy === 0) return center; // Should not happen

    // Check intersection with vertical edges (x = +/- w)
    // t_x = (w * sign(dx)) / dx
    // but we use absolute calc
    let t = Infinity;
    
    if (dx !== 0) {
        const tx = (dx > 0 ? w : -w) / dx;
        if (tx >= 0) {
             const y_at_edge = tx * dy;
             if (Math.abs(y_at_edge) <= h) {
                 t = tx;
             }
        }
    }
    
    // Check intersection with horizontal edges (y = +/- h)
    if (dy !== 0) {
        const ty = (dy > 0 ? h : -h) / dy;
        if (ty >= 0) {
            const x_at_edge = ty * dx;
            if (Math.abs(x_at_edge) <= w) {
                 if (ty < t) t = ty;
            }
        }
    }

    if (t === Infinity) return center; // Fallback

    return {
        x: center.x + t * dx,
        y: center.y + t * dy
    };
};

export default function App() {
 const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);
const userId = user?.uid || null;

  // Routing State
  const [view, setView] = useState<'home' | 'editor'>('home');
  const [currentProject, setCurrentProject] = useState<ProjectMetadata | null>(null);

  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [dragMode, setDragMode] = useState<'none' | 'pan' | 'move' | 'resize' | 'connect' | 'draw' | 'select'>('none');
  const [toolMode, setToolMode] = useState<'select' | 'hand' | 'pen'>('select');
  
  const [dragStart, setDragStart] = useState<Position | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [movingChildIds, setMovingChildIds] = useState<Set<string>>(new Set());
  
  const [tempConnection, setTempConnection] = useState<Position | null>(null);
  
  // Drawing State
  const [drawingColor, setDrawingColor] = useState('#000000');
  
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);

  // Emoji Picker State
  const [emojiPicker, setEmojiPicker] = useState<{ type: 'reaction' | 'sticker', targetId?: string, x: number, y: number } | null>(null);
  
  // Fullscreen State
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // For Web Import

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Delete
        if ((e.key === 'Delete' || e.key === 'Backspace')) {
            const activeTag = document.activeElement?.tagName;
            // Don't delete if user is typing in input or textarea
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
            
            if (state.selectedIds.length > 0) {
                setState(prev => ({
                    ...prev,
                    items: prev.items.filter(i => !prev.selectedIds.includes(i.id)),
                    connections: prev.connections.filter(c => !prev.selectedIds.includes(c.fromId) && !prev.selectedIds.includes(c.toId)),
                    selectedIds: []
                }));
            }
        }
        // Save shortcut
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            handleSaveProject();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.selectedIds, toolMode, currentProject, state]);

  // --- Project Management Handlers ---

  const handleCreateProject = async (name: string) => {
      try {
          let metadata;
          if (window.moodboard) {
             metadata = await window.moodboard.createProject(userId, name);
          } else {
             // Web Storage Fallback
             metadata = await webStorage.createProject(name);
          }
          setCurrentProject(metadata);
          setState(INITIAL_STATE);
          setView('editor');
      } catch (e) {
          console.error("Failed to create project:", e);
          alert("Error creating project.");
      }
  };

  const handleOpenProject = async (id: string) => {
      try {
          let loadedState, metadata;
          if (window.moodboard) {
              const result = await window.moodboard.loadProject(id);
              loadedState = result.state;
              metadata = result.metadata;
          } else {
              // Web Storage Fallback
              const result = await webStorage.loadProject(id);
              loadedState = result.state;
              metadata = result.metadata;
          }
          setCurrentProject(metadata);
          setState(loadedState);
          setView('editor');
      } catch (e) {
          alert('Failed to load project');
          console.error(e);
      }
  };

  const handleImportProject = async () => {
      if (window.moodboard) {
          try {
              const metadata = await window.moodboard.importProject();
              if (metadata) {
                  handleOpenProject(metadata.id);
              }
          } catch (e) {
              console.error(e);
          }
      } else {
          // Web Import Fallback
          // Ensure ref exists
          if (fileInputRef.current) {
              fileInputRef.current.click();
          } else {
              console.error("File input ref is null");
          }
      }
  };
  
  const handleWebFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          try {
              const metadata = await webStorage.importProject(file);
              if (metadata) {
                  handleOpenProject(metadata.id);
                  alert("Project imported successfully!");
              }
          } catch (err) {
              console.error(err);
              alert("Failed to import project file. Ensure it is a valid .mix3d or .json file.");
          }
          // Reset input so same file can be selected again if needed
          e.target.value = ''; 
      }
  };

  const handleSaveProject = async () => {
      if (!currentProject) return;
      
      if (window.moodboard) {
          await window.moodboard.saveProject(currentProject.id, state);
          console.log('Saved to disk');
      } else {
          // Web Storage Fallback
          await webStorage.saveProject(currentProject.id, state);
          console.log('Saved to web storage');
      }
  };

  const handleExportProject = async () => {
      if (!currentProject) return;
      
      // Ensure saved first
      await handleSaveProject();
      
      if (window.moodboard) {
          const success = await window.moodboard.exportProject(currentProject.id);
          if (success) alert('Project exported successfully!');
      } else {
          // Web Export Fallback
          const success = await webStorage.exportProject(currentProject.id, currentProject.name);
          if (success) console.log('Export download started');
      }
  };

  // --- Handlers for Adding Items ---

  const addItem = (type: ItemType, extras: Partial<CanvasItem> = {}) => {
    const centerX = (-state.pan.x + window.innerWidth / 2) / state.scale;
    const centerY = (-state.pan.y + window.innerHeight / 2) / state.scale;

    // Default Z-Index logic: Shapes go to back, others on top
    const minZ = state.items.length > 0 ? Math.min(...state.items.map(i => i.zIndex)) : 0;
    const maxZ = state.items.length > 0 ? Math.max(...state.items.map(i => i.zIndex)) : 0;
    
    // If shape, try to put it behind everything (minZ - 1), else put on top
    const zIndex = type === 'shape' ? minZ - 1 : maxZ + 1;

    const newItem: CanvasItem = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      x: centerX - 100,
      y: centerY - 75,
      width: type === 'shape' || type === 'image' ? 200 : 250,
      height: type === 'shape' || type === 'image' ? 200 : 180,
      zIndex,
      content: '',
      color: type === 'shape' ? '#e2e8f0' : undefined,
      shapeType: 'rectangle',
      opacity: 1,
      fontFamily: type === 'text' ? "'Playfair Display', serif" : undefined,
      fontWeight: '400',
      fontStyle: 'normal',
      ...extras,
    };
    
    if (type === 'todo') {
        newItem.todos = [
            { id: '1', text: 'Define goals', completed: false, urgency: 'high' },
            { id: '2', text: 'Gather inspiration', completed: false, urgency: 'low' }
        ];
    }

    setState(prev => ({
      ...prev,
      items: [...prev.items, newItem],
      selectedIds: [newItem.id]
    }));
    setToolMode('select'); // Switch back to select after adding
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (window.moodboard) {
          // If in Electron, we can use the file path directly for efficiency/copying later
          // But to render it immediately in `CanvasItemComp`, we might need a file:// URL or base64
          // Let's stick to Base64 for immediate rendering, and `main.ts` will optimize it on save.
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              addItem('image', { content: event.target.result as string });
            }
          };
          reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
            addItem('image', { content: event.target.result as string });
            }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // --- Emoji Logic ---

  const handleEmojiSelect = (emoji: string) => {
     if (!emojiPicker) return;

     if (emojiPicker.type === 'reaction' && emojiPicker.targetId) {
         // Add reaction to item
         setState(prev => ({
             ...prev,
             items: prev.items.map(item => {
                 if (item.id === emojiPicker.targetId) {
                     const existing = item.reactions || [];
                     const existingReaction = existing.find(r => r.emoji === emoji);
                     let newReactions;
                     if (existingReaction) {
                         newReactions = existing.map(r => r.emoji === emoji ? { ...r, count: r.count + 1 } : r);
                     } else {
                         newReactions = [...existing, { emoji, count: 1 }];
                     }
                     return { ...item, reactions: newReactions };
                 }
                 return item;
             })
         }));
     } else if (emojiPicker.type === 'sticker') {
         // Add new text item with large emoji
         addItem('text', {
             content: emoji,
             width: 100,
             height: 100,
             fontFamily: "'Inter', sans-serif",
             color: '#ffffff', // transparent bg for text type usually
             // We can hack the style via content, or just standard text
             // Let's rely on standard text render but user can resize
         });
     }
     setEmojiPicker(null);
  };

  // --- Canvas Interaction Handlers ---

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Zoom centered on pointer
    const sensitivity = 0.001;
    const delta = -e.deltaY;
    const zoomFactor = Math.exp(delta * sensitivity);
    const newScale = Math.min(Math.max(0.1, state.scale * zoomFactor), 5);
    
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    const newPanX = mouseX - ((mouseX - state.pan.x) / state.scale) * newScale;
    const newPanY = mouseY - ((mouseY - state.pan.y) / state.scale) * newScale;
    
    setState(prev => ({
        ...prev,
        scale: newScale,
        pan: { x: newPanX, y: newPanY }
    }));
  }, [state.scale, state.pan]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (emojiPicker && !(e.target as Element).closest('.emoji-picker')) {
        setEmojiPicker(null);
    }

    if (toolMode === 'pen') {
        setDragMode('draw');
        const startX = (e.clientX - state.pan.x) / state.scale;
        const startY = (e.clientY - state.pan.y) / state.scale;
        
        const newItem: CanvasItem = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'drawing',
            x: startX,
            y: startY,
            width: 0, 
            height: 0,
            zIndex: state.items.length + 1,
            drawingData: [{
                points: [{x: 0, y: 0}], 
                color: drawingColor,
                strokeWidth: 3
            }]
        };
        
        setActiveItemId(newItem.id);
        setState(prev => ({
            ...prev,
            items: [...prev.items, newItem],
            selectedIds: [newItem.id]
        }));
        setDragStart({ x: startX, y: startY });
        return;
    }

    if (toolMode === 'hand' || (e.button === 1)) {
        setDragMode('pan');
        setDragStart({ x: e.clientX, y: e.clientY });
        return;
    }

    if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('button')) return;
      
      setDragMode('select');
      const startPos = { 
          x: (e.clientX - state.pan.x) / state.scale, 
          y: (e.clientY - state.pan.y) / state.scale 
      };
      setDragStart({ x: startPos.x, y: startPos.y });
      setState(prev => ({ 
          ...prev, 
          selectedIds: [],
          selectionBox: { start: startPos, end: startPos }
      }));
    }
  };

  const handleItemMouseDown = (e: React.MouseEvent, id: string, type: 'move' | 'resize' | 'connect') => {
    if (toolMode === 'pen' || toolMode === 'hand') return; 
    e.stopPropagation();
    
    setActiveItemId(id);
    setDragStart({ x: e.clientX, y: e.clientY }); // Store screen start for drag delta
    setDragMode(type);
    
    if (type === 'connect') {
        setTempConnection({ 
          x: (e.clientX - state.pan.x) / state.scale, 
          y: (e.clientY - state.pan.y) / state.scale 
        });
    }
    
    const movedItem = state.items.find(i => i.id === id);
    const children = new Set<string>();
    
    if (type === 'move' && movedItem && movedItem.type === 'shape') {
        state.items.forEach(other => {
            if (other.id !== id && 
                other.x >= movedItem.x && 
                other.x + other.width <= movedItem.x + movedItem.width &&
                other.y >= movedItem.y && 
                other.y + other.height <= movedItem.y + movedItem.height
            ) {
                children.add(other.id);
            }
        });
    }
    setMovingChildIds(children);

    setState(prev => ({
      ...prev,
      selectedIds: prev.selectedIds.includes(id) ? prev.selectedIds : [id]
    }));
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragMode === 'none') return;

    if (dragMode === 'draw' && activeItemId && dragStart) {
        const mouseX = (e.clientX - state.pan.x) / state.scale;
        const mouseY = (e.clientY - state.pan.y) / state.scale;
        
        setState(prev => ({
            ...prev,
            items: prev.items.map(item => {
                if (item.id !== activeItemId || !item.drawingData) return item;
                
                const pathIdx = item.drawingData.length - 1;
                const path = item.drawingData[pathIdx];
                const newPoint = { x: mouseX - item.x, y: mouseY - item.y };
                const newPoints = [...path.points, newPoint];
                
                let minX = 0, minY = 0, maxX = item.width, maxY = item.height;
                newPoints.forEach(p => {
                    if (p.x < minX) minX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y > maxY) maxY = p.y;
                });
                
                const shiftX = minX < 0 ? minX : 0;
                const shiftY = minY < 0 ? minY : 0;
                
                const adjustedPoints = newPoints.map(p => ({
                    x: p.x - shiftX,
                    y: p.y - shiftY
                }));
                
                const newDrawingData = [...item.drawingData];
                newDrawingData[pathIdx] = { ...path, points: adjustedPoints };
                
                return {
                    ...item,
                    x: item.x + shiftX,
                    y: item.y + shiftY,
                    width: maxX - minX || 1, 
                    height: maxY - minY || 1,
                    drawingData: newDrawingData
                };
            })
        }));
        return;
    }

    if (dragMode === 'select' && dragStart) {
        const currentPos = { 
            x: (e.clientX - state.pan.x) / state.scale, 
            y: (e.clientY - state.pan.y) / state.scale 
        };
        
        setState(prev => {
            const box = { start: dragStart, end: currentPos };
            const x1 = Math.min(box.start.x, box.end.x);
            const y1 = Math.min(box.start.y, box.end.y);
            const x2 = Math.max(box.start.x, box.end.x);
            const y2 = Math.max(box.start.y, box.end.y);
            
            const selected = prev.items.filter(item => 
                item.x + item.width/2 >= x1 && 
                item.x + item.width/2 <= x2 && 
                item.y + item.height/2 >= y1 && 
                item.y + item.height/2 <= y2
            ).map(i => i.id);

            return {
                ...prev,
                selectionBox: box,
                selectedIds: selected
            };
        });
        return;
    }

    if (!dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    if (dragMode === 'pan') {
      setState(prev => ({
        ...prev,
        pan: { x: prev.pan.x + dx, y: prev.pan.y + dy }
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (dragMode === 'move' && activeItemId) {
      const scaledDx = dx / state.scale;
      const scaledDy = dy / state.scale;
      
      setState(prev => ({
        ...prev,
        items: prev.items.map(item => {
            if (item.id === activeItemId || movingChildIds.has(item.id)) {
                 return { ...item, x: item.x + scaledDx, y: item.y + scaledDy };
            }
            return item;
        })
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (dragMode === 'resize' && activeItemId) {
      const scaledDx = dx / state.scale;
      const scaledDy = dy / state.scale;
      setState(prev => ({
        ...prev,
        items: prev.items.map(item => 
          item.id === activeItemId 
            ? { ...item, width: Math.max(50, item.width + scaledDx), height: Math.max(50, item.height + scaledDy) }
            : item
        )
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (dragMode === 'connect') {
      setTempConnection({ 
        x: (e.clientX - state.pan.x) / state.scale, 
        y: (e.clientY - state.pan.y) / state.scale 
      });
    }
  }, [dragMode, dragStart, activeItemId, state.scale, state.pan, movingChildIds, toolMode]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragMode === 'connect' && activeItemId) {
      const mouseX = (e.clientX - state.pan.x) / state.scale;
      const mouseY = (e.clientY - state.pan.y) / state.scale;
      
      // Simple bounding box hit test
      const targetItem = state.items.find(item => 
        item.id !== activeItemId &&
        mouseX >= item.x && mouseX <= item.x + item.width &&
        mouseY >= item.y && mouseY <= item.y + item.height
      );

      if (targetItem) {
        const newConnection: Connection = {
          id: Math.random().toString(),
          fromId: activeItemId,
          toId: targetItem.id,
          color: COLORS[Math.floor(Math.random() * COLORS.length)]
        };
        setState(prev => ({ ...prev, connections: [...prev.connections, newConnection] }));
      }
    }

    setDragMode('none');
    setDragStart(null);
    setActiveItemId(null);
    setTempConnection(null);
    setMovingChildIds(new Set());
    setState(prev => ({ ...prev, selectionBox: null }));
  }, [dragMode, activeItemId, state.items, state.pan, state.scale]);

  // --- Path Calculations ---
  
  const getPath = (conn: Connection) => {
    const from = state.items.find(i => i.id === conn.fromId);
    const to = state.items.find(i => i.id === conn.toId);
    if (!from || !to) return '';
    
    const centerFrom = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const centerTo = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    
    // Calculate start and end points on the edges of the bounding boxes
    const start = getRectIntersection(centerFrom, centerTo, from);
    const end = getRectIntersection(centerTo, centerFrom, to); // intersect from reverse direction

    const dx = Math.abs(end.x - start.x) * 0.5;
    return `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;
  };

  const getTempPath = () => {
    if (!activeItemId || !tempConnection || !dragStart) return '';
    
    // We want the line to start from the exact point we clicked (world coords)
    // dragStart is currently stored in Screen Coords (clientX/Y) from handleItemMouseDown
    // Convert to World Coords
    const startX = (dragStart.x - state.pan.x) / state.scale;
    const startY = (dragStart.y - state.pan.y) / state.scale;
    
    const start = { x: startX, y: startY };
    
    // Simple straight line or curve for temp connection
    return `M ${start.x} ${start.y} L ${tempConnection.x} ${tempConnection.y}`;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const updateItem = (id: string, updates: Partial<CanvasItem>) => {
      setState(prev => ({
          ...prev,
          items: prev.items.map(i => i.id === id ? { ...i, ...updates } : i)
      }));
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiLoading(true);
    try {
        const isImageRequest = aiPrompt.toLowerCase().includes('image') || aiPrompt.toLowerCase().includes('draw');
        if (isImageRequest) {
             const base64 = await generateMoodboardImage(aiPrompt);
             if (base64) addItem('image', { content: base64 });
        } else {
            const ideas = await generateIdeas(aiPrompt);
            const centerX = (-state.pan.x + window.innerWidth / 2) / state.scale;
            const centerY = (-state.pan.y + window.innerHeight / 2) / state.scale;
            const newItems: CanvasItem[] = ideas.map((idea, idx) => ({
                id: Math.random().toString(36).substr(2, 9),
                type: 'text',
                x: centerX + (Math.random() * 400 - 200),
                y: centerY + (Math.random() * 400 - 200),
                width: 200,
                height: 150,
                zIndex: state.items.length + idx + 1,
                content: idea,
                textColor: '#1f2937'
            }));
            setState(prev => ({ ...prev, items: [...prev.items, ...newItems] }));
        }
    } catch (e) { console.error(e); } 
    finally { setIsAiLoading(false); setShowAiModal(false); setAiPrompt(''); }
  };

  // --- Properties Panel ---
  const selectedItem = state.items.find(i => state.selectedIds.includes(i.id));
  if (authLoading) {
    return (
      <div className="w-screen h-screen grid place-items-center">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <>
        {/* Global File Input - Always rendered so Import works from Home */}
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleWebFileImport} 
            accept=".mix3d,.json" 
            className="hidden" 
        />

        {view === 'home' ? (
            <HomeScreen
  userId={userId}
  onNewProject={handleCreateProject}
  onOpenProject={handleOpenProject}
  onImportProject={handleImportProject}
/>
        ) : (
            <div 
                ref={containerRef}
                className={`w-screen h-screen overflow-hidden bg-[#f5f5f7] relative text-gray-800 
                    ${toolMode === 'pen' ? 'cursor-crosshair' : toolMode === 'hand' || dragMode === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
            >
                {/* --- Toolbar --- */}
                <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-4">
                    <div className="glass-panel px-4 py-2 rounded-full shadow-2xl flex items-center gap-3">
                    {/* Home Button */}
                    <button onClick={() => setView('home')} className="p-2 hover:bg-black/5 rounded-full transition-colors tooltip" title="Home">
                        <Home size={20} className="text-gray-700" />
                    </button>
                    <button
  onClick={async () => {
    await logout();
    setView('home');
    setCurrentProject(null);
    setState(INITIAL_STATE);
  }}
  className="p-2 hover:bg-black/5 rounded-full transition-colors tooltip"
  title="Logout"
>
  <LogOut size={20} className="text-gray-700" />
</button>

                    <div className="w-px h-6 bg-gray-300 mx-1"></div>

                    <button onClick={() => setToolMode('select')} className={`p-2 rounded-full transition-colors ${toolMode === 'select' ? 'bg-blue-100 text-blue-600' : 'hover:bg-black/5'}`} title="Select">
                        <MousePointer2 size={20} />
                    </button>
                    <button onClick={() => setToolMode('hand')} className={`p-2 rounded-full transition-colors ${toolMode === 'hand' ? 'bg-blue-100 text-blue-600' : 'hover:bg-black/5'}`} title="Pan (Hand)">
                        <Hand size={20} />
                    </button>
                    <div className="w-px h-6 bg-gray-300 mx-1"></div>
                    
                    <button onClick={() => addItem('text')} className="p-2 hover:bg-black/5 rounded-full transition-colors tooltip" title="Add Text">
                        <Type size={20} className="text-gray-700" />
                    </button>
                    <label className="p-2 hover:bg-black/5 rounded-full transition-colors cursor-pointer" title="Add Image">
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                        <ImageIcon size={20} className="text-gray-700" />
                    </label>
                    <button onClick={() => addItem('todo')} className="p-2 hover:bg-black/5 rounded-full transition-colors" title="Add To-Do">
                        <Check size={20} className="text-gray-700" />
                    </button>
                    <button onClick={() => addItem('shape', { shapeType: 'rectangle' })} className="p-2 hover:bg-black/5 rounded-full transition-colors" title="Add Shape">
                        <Square size={20} className="text-gray-700" />
                    </button>
                    
                    <button 
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setEmojiPicker({ type: 'sticker', x: rect.left, y: rect.bottom + 10 });
                        }} 
                        className="p-2 hover:bg-black/5 rounded-full transition-colors" 
                        title="Add Emoji Sticker"
                    >
                        <Smile size={20} className="text-gray-700" />
                    </button>

                    <div className="w-px h-6 bg-gray-300 mx-1"></div>
                    <button 
                            onClick={() => { setToolMode(toolMode === 'pen' ? 'select' : 'pen'); setState(s => ({...s, selectedIds: []})); }} 
                            className={`p-2 rounded-full transition-colors ${toolMode === 'pen' ? 'bg-blue-500 text-white' : 'hover:bg-black/5 text-gray-700'}`} 
                            title="Pen Tool"
                    >
                        <PenTool size={20} />
                    </button>
                    
                    <div className="w-px h-6 bg-gray-300 mx-1"></div>
                    <button onClick={handleSaveProject} className="p-2 hover:bg-black/5 rounded-full transition-colors tooltip" title="Save Project (Ctrl+S)">
                        <Save size={20} className="text-gray-700" />
                    </button>
                    <button onClick={handleExportProject} className="p-2 hover:bg-black/5 rounded-full transition-colors tooltip" title="Export .moodboard">
                        <Share2 size={20} className="text-gray-700" />
                    </button>

                    <div className="w-px h-6 bg-gray-300 mx-1"></div>
                    <button onClick={() => setShowAiModal(true)} className="p-2 hover:bg-purple-100 bg-purple-50 text-purple-600 rounded-full transition-colors flex items-center gap-2 px-3">
                        <Wand2 size={18} />
                        <span className="text-sm font-semibold">Gemini</span>
                    </button>
                    </div>
                </div>
                
                {/* Project Title Indicator */}
                {currentProject && (
                    <div className="fixed top-8 left-8 z-40 text-sm font-serif font-bold text-gray-400 opacity-50 select-none pointer-events-none">
                        {currentProject.name}
                    </div>
                )}

                {/* --- Properties Bar (Selection) --- */}
                {selectedItem && (
                    <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-40 glass-panel px-4 py-2 rounded-xl shadow-lg flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-200">
                        {/* Color Picker (Full Wheel) */}
                        <div className="flex items-center gap-2 relative group">
                            <Palette size={16} className="text-gray-500" />
                            <div className="w-6 h-6 rounded-full border border-gray-300 overflow-hidden cursor-pointer relative shadow-sm">
                                <input 
                                    type="color" 
                                    value={selectedItem.type === 'text' ? (selectedItem.textColor || '#000000') : (selectedItem.color || '#e2e8f0')}
                                    onChange={(e) => updateItem(selectedItem.id, selectedItem.type === 'text' ? { textColor: e.target.value } : { color: e.target.value })}
                                    className="absolute -top-2 -left-2 w-10 h-10 p-0 border-0 cursor-pointer"
                                />
                            </div>
                            {/* Preset Colors */}
                            <div className="flex gap-1 ml-2">
                                {SHAPE_COLORS.slice(0, 4).map(c => (
                                    <button 
                                        key={c} 
                                        onClick={() => updateItem(selectedItem.id, selectedItem.type === 'text' ? { textColor: c } : { color: c })}
                                        className="w-4 h-4 rounded-full border border-gray-200 hover:scale-110 transition-transform"
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Font Controls for Text */}
                        {selectedItem.type === 'text' && (
                            <>
                                <div className="w-px h-6 bg-gray-300"></div>
                                
                                {/* Font Family */}
                                <select
                                    value={selectedItem.fontFamily || FONTS[0].value}
                                    onChange={(e) => updateItem(selectedItem.id, { fontFamily: e.target.value })}
                                    className="bg-transparent text-sm font-medium text-gray-700 outline-none cursor-pointer hover:bg-black/5 rounded p-1 w-24"
                                >
                                    {FONTS.map(f => (
                                        <option key={f.name} value={f.value}>{f.name}</option>
                                    ))}
                                </select>

                                {/* Font Weight */}
                                <select
                                    value={selectedItem.fontWeight || '400'}
                                    onChange={(e) => updateItem(selectedItem.id, { fontWeight: e.target.value })}
                                    className="bg-transparent text-sm font-medium text-gray-700 outline-none cursor-pointer hover:bg-black/5 rounded p-1"
                                >
                                    <option value="400">Regular</option>
                                    <option value="600">Semi Bold</option>
                                    <option value="700">Bold</option>
                                    <option value="800">Extra Bold</option>
                                </select>

                                {/* Italic Toggle */}
                                <button 
                                    onClick={() => updateItem(selectedItem.id, { fontStyle: selectedItem.fontStyle === 'italic' ? 'normal' : 'italic' })}
                                    className={`p-1 rounded hover:bg-black/5 transition-colors ${selectedItem.fontStyle === 'italic' ? 'bg-black/10 text-black' : 'text-gray-500'}`}
                                    title="Italic"
                                >
                                    <Italic size={16} />
                                </button>
                            </>
                        )}

                        {/* Opacity */}
                        {(selectedItem.type === 'shape' || selectedItem.type === 'image') && (
                            <>
                                <div className="w-px h-6 bg-gray-300"></div>
                                <div className="flex items-center gap-2">
                                    <Droplets size={16} className="text-gray-500" />
                                    <input 
                                        type="range" min="0.1" max="1" step="0.1"
                                        value={selectedItem.opacity || 1}
                                        onChange={(e) => updateItem(selectedItem.id, { opacity: parseFloat(e.target.value) })}
                                        className="w-20 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    />
                                </div>
                            </>
                        )}

                        {/* Layering Controls */}
                        <div className="w-px h-6 bg-gray-300"></div>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => {
                                    const minZ = Math.min(...state.items.map(i => i.zIndex));
                                    updateItem(selectedItem.id, { zIndex: minZ - 1 });
                                }}
                                className="p-1 hover:bg-gray-100 rounded text-gray-600 tooltip" 
                                title="Send to Back"
                            >
                                <Layers size={16} />
                                <ArrowDown size={10} className="absolute ml-3 mt-1" />
                            </button>
                            <button 
                                onClick={() => {
                                    const maxZ = Math.max(...state.items.map(i => i.zIndex));
                                    updateItem(selectedItem.id, { zIndex: maxZ + 1 });
                                }}
                                className="p-1 hover:bg-gray-100 rounded text-gray-600 tooltip" 
                                title="Bring to Front"
                            >
                                <Layers size={16} />
                                <ArrowUp size={10} className="absolute ml-3 -mt-2" />
                            </button>
                        </div>
                        
                        <div className="w-px h-6 bg-gray-300"></div>
                        <span className="text-xs text-gray-400 font-mono">
                            {Math.round(selectedItem.width)}x{Math.round(selectedItem.height)}
                        </span>
                    </div>
                )}

                {/* --- Properties Bar (Pen Mode) --- */}
                {toolMode === 'pen' && !selectedItem && (
                    <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-40 glass-panel px-4 py-2 rounded-xl shadow-lg flex items-center gap-4">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pen Settings</span>
                        <div className="w-px h-6 bg-gray-300"></div>
                        <input 
                            type="color" 
                            value={drawingColor}
                            onChange={(e) => setDrawingColor(e.target.value)}
                            className="w-8 h-8 rounded-full border-none cursor-pointer bg-transparent"
                        />
                    </div>
                )}

                {/* --- Emoji Picker Overlay --- */}
                {emojiPicker && (
                    <div 
                        className="fixed z-[60] glass-panel p-3 rounded-2xl shadow-2xl emoji-picker animate-in fade-in zoom-in-95 duration-200"
                        style={{ top: emojiPicker.y, left: emojiPicker.x }}
                    >
                        <div className="grid grid-cols-8 gap-1 w-64">
                            {EMOJIS.map(emoji => (
                                <button
                                    key={emoji}
                                    onClick={() => handleEmojiSelect(emoji)}
                                    className="p-1.5 hover:bg-white/50 rounded-lg transition-colors text-xl flex items-center justify-center"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                        {/* Custom Emoji Input */}
                        <div className="mt-2 pt-2 border-t border-gray-300/50 flex gap-2">
                            <input 
                                type="text" 
                                placeholder="Custom emoji..." 
                                className="w-full bg-white/50 rounded-lg px-2 py-1 text-sm outline-none border border-transparent focus:border-blue-300"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleEmojiSelect((e.target as HTMLInputElement).value);
                                    }
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* --- Floating Tools --- */}
                <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
                    <div className="glass-panel p-2 rounded-2xl shadow-xl flex flex-col gap-2">
                    <button onClick={() => setState(p => ({...p, scale: Math.min(2, p.scale + 0.1)}))} className="p-2 hover:bg-black/5 rounded-xl">
                        <ZoomIn size={20} />
                    </button>
                    <button onClick={() => setState(p => ({...p, scale: Math.max(0.2, p.scale - 0.1)}))} className="p-2 hover:bg-black/5 rounded-xl">
                        <ZoomOut size={20} />
                    </button>
                    </div>
                    <button onClick={toggleFullscreen} className="glass-panel p-3 rounded-full shadow-xl hover:bg-white transition-colors">
                        <Maximize2 size={20} />
                    </button>
                </div>

                {/* --- Canvas Area --- */}
                <div 
                    id="canvas-bg"
                    className="w-full h-full"
                    onMouseDown={handleMouseDown}
                    style={{
                        backgroundImage: 'radial-gradient(#cfcfcf 1px, transparent 1px)',
                        backgroundSize: `${20 * state.scale}px ${20 * state.scale}px`,
                        backgroundPosition: `${state.pan.x}px ${state.pan.y}px`
                    }}
                >
                    <div 
                        className="origin-top-left w-full h-full"
                        style={{ 
                            transform: `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.scale})`,
                        }}
                    >
                        {/* Items are rendered first (background shapes usually have negative Z, standard items positive Z) */}
                        {[...state.items].sort((a, b) => a.zIndex - b.zIndex).map(item => (
                            <CanvasItemComp 
                                key={item.id}
                                item={item}
                                isSelected={state.selectedIds.includes(item.id)}
                                onMouseDown={handleItemMouseDown}
                                onUpdate={updateItem}
                                onDelete={(id) => {
                                    setState(prev => ({
                                        ...prev,
                                        items: prev.items.filter(i => i.id !== id),
                                        connections: prev.connections.filter(c => c.fromId !== id && c.toId !== id)
                                    }));
                                }}
                                onAddReaction={(id, e) => {
                                    e.stopPropagation();
                                    setEmojiPicker({ 
                                        type: 'reaction', 
                                        targetId: id, 
                                        x: e.clientX, 
                                        y: e.clientY 
                                    });
                                }}
                                scale={state.scale}
                            />
                        ))}

                        {/* SVG Connections Layer - Rendered after items to ensure it stays on top of negative/low Z items (like background shapes) */}
                        {/* pointer-events-none ensures we can still click items underneath if the line isn't hit directly (though lines are thin) */}
                        <svg className="absolute top-0 left-0 w-[50000px] h-[50000px] pointer-events-none overflow-visible">
                            <defs>
                                <filter id="glow">
                                    <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                                    <feMerge>
                                        <feMergeNode in="coloredBlur"/>
                                        <feMergeNode in="SourceGraphic"/>
                                    </feMerge>
                                </filter>
                            </defs>
                            {state.connections.map(conn => (
                                <g key={conn.id}>
                                    <path 
                                        d={getPath(conn)} 
                                        fill="none" 
                                        stroke={conn.color} 
                                        strokeWidth="3"
                                        className="opacity-50"
                                        filter="url(#glow)"
                                    />
                                    <path 
                                        d={getPath(conn)} 
                                        fill="none" 
                                        stroke={conn.color} 
                                        strokeWidth="2" 
                                        strokeDasharray="5,5"
                                        className="animate-dash"
                                    />
                                </g>
                            ))}
                            {dragMode === 'connect' && (
                                <path 
                                    d={getTempPath()} 
                                    fill="none" 
                                    stroke="#3b82f6" 
                                    strokeWidth="2" 
                                    strokeDasharray="5,5"
                                />
                            )}
                        </svg>
                        
                        {/* Selection Box Visual */}
                        {state.selectionBox && (
                            <div 
                                className="absolute border border-blue-500 bg-blue-500/10 pointer-events-none z-[9999]"
                                style={{
                                    left: Math.min(state.selectionBox.start.x, state.selectionBox.end.x),
                                    top: Math.min(state.selectionBox.start.y, state.selectionBox.end.y),
                                    width: Math.abs(state.selectionBox.end.x - state.selectionBox.start.x),
                                    height: Math.abs(state.selectionBox.end.y - state.selectionBox.start.y),
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>
        )}
    </>
  );
}