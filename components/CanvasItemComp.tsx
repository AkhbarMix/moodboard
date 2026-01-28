import React, { useRef, useState, useEffect } from 'react';
import { CanvasItem, TodoItem, Urgency, Reaction } from '../types';
import { Trash2, Plus, Square, CheckSquare, Flag, SmilePlus } from 'lucide-react';

interface Props {
  item: CanvasItem;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent, id: string, type: 'move' | 'resize' | 'connect') => void;
  onUpdate: (id: string, updates: Partial<CanvasItem>) => void;
  onDelete: (id: string) => void;
  onAddReaction: (id: string, event: React.MouseEvent) => void;
  scale: number;
}

export const CanvasItemComp: React.FC<Props> = ({ item, isSelected, onMouseDown, onUpdate, onDelete, onAddReaction, scale }) => {
  const [isEditing, setIsEditing] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  
  // Auto-focus text area when entering edit mode
  useEffect(() => {
    if (isEditing && textAreaRef.current) {
        textAreaRef.current.focus();
    }
  }, [isEditing]);

  // If created empty (e.g. from toolbar), start editing immediately
  useEffect(() => {
    if (item.type === 'text' && !item.content && isSelected && !isEditing) {
        setIsEditing(true);
    }
  }, [item.id]); // Run once on mount/creation

  const handleContentChange = (val: string) => {
    onUpdate(item.id, { content: val });
  };

  const handleTodoToggle = (todoId: string) => {
    const newTodos = item.todos?.map(t => 
      t.id === todoId ? { ...t, completed: !t.completed } : t
    );
    onUpdate(item.id, { todos: newTodos });
  };

  const handleUrgencyToggle = (todoId: string) => {
      const order: Urgency[] = ['low', 'medium', 'high'];
      const newTodos = item.todos?.map(t => {
          if (t.id === todoId) {
              const nextIdx = (order.indexOf(t.urgency) + 1) % order.length;
              return { ...t, urgency: order[nextIdx] };
          }
          return t;
      });
      onUpdate(item.id, { todos: newTodos });
  };

  const handleAddTodo = () => {
    const newTodo: TodoItem = { id: Date.now().toString(), text: 'New Task', completed: false, urgency: 'low' };
    onUpdate(item.id, { todos: [...(item.todos || []), newTodo] });
  };

  const handleTodoTextChange = (todoId: string, text: string) => {
    const newTodos = item.todos?.map(t => 
      t.id === todoId ? { ...t, text } : t
    );
    onUpdate(item.id, { todos: newTodos });
  };
  
  const handleReactionClick = (emoji: string) => {
      // Decrement or remove reaction
      const existing = item.reactions || [];
      const target = existing.find(r => r.emoji === emoji);
      
      if (!target) return;

      let newReactions;
      if (target.count > 1) {
          newReactions = existing.map(r => 
              r.emoji === emoji ? { ...r, count: r.count - 1 } : r
          );
      } else {
          newReactions = existing.filter(r => r.emoji !== emoji);
      }
      onUpdate(item.id, { reactions: newReactions });
  };

  // SVG Drawing path generator
  const getSvgPath = (points: {x:number, y:number}[]) => {
      if (points.length === 0) return '';
      // Points are relative to item.x, item.y
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      return d;
  };

  // Base styles for selection and rendering
  const containerStyle: React.CSSProperties = {
    transform: `translate(${item.x}px, ${item.y}px)`,
    width: item.width,
    height: item.height,
    zIndex: item.zIndex,
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: item.opacity ?? 1,
    pointerEvents: item.type === 'drawing' ? (isSelected ? 'auto' : 'none') : 'auto', 
  };

  const selectionClass = isSelected 
    ? "ring-2 ring-blue-500 shadow-xl" 
    : item.type === 'drawing' ? "" : "hover:ring-1 hover:ring-gray-300 shadow-sm";

  // --- Drawing Item ---
  if (item.type === 'drawing') {
     return (
        <div 
            style={containerStyle}
            className={`group absolute select-none ${isSelected ? 'ring-1 ring-blue-400 border border-blue-200 bg-blue-50/10' : ''}`}
            onMouseDown={(e) => {
                onMouseDown(e, item.id, 'move');
            }}
        >
            <svg 
                width="100%" 
                height="100%" 
                viewBox={`0 0 ${item.width} ${item.height}`} 
                style={{overflow: 'visible'}}
            >
                {item.drawingData?.map((path, i) => (
                    <path 
                        key={i}
                        d={getSvgPath(path.points)}
                        stroke={path.color}
                        strokeWidth={path.strokeWidth}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    />
                ))}
            </svg>
             {isSelected && (
                <div 
                  className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize bg-blue-400 rounded-full opacity-50 hover:opacity-100"
                  onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, item.id, 'resize'); }}
                  style={{ pointerEvents: 'auto' }}
                />
            )}
        </div>
     );
  }

  // --- Wrapper for Text, Image, Shape, Todo to share handles ---
  const renderContent = () => {
    if (item.type === 'text') {
        const fontStyle = {
            fontFamily: item.fontFamily || "'Playfair Display', serif",
            color: item.textColor || '#1f2937',
            fontSize: Math.max(14, item.width / 10) + 'px',
            fontWeight: item.fontWeight || '400',
            fontStyle: item.fontStyle || 'normal',
        };

        return (
            <div className="flex-1 w-full h-full p-4 overflow-hidden relative" style={{ cursor: isEditing ? 'text' : 'grab' }}>
                {isEditing ? (
                    <textarea
                        ref={textAreaRef}
                        className="w-full h-full resize-none outline-none bg-transparent leading-relaxed"
                        value={item.content || ''}
                        onChange={(e) => handleContentChange(e.target.value)}
                        onBlur={() => setIsEditing(false)}
                        onKeyDown={(e) => { e.stopPropagation(); }} 
                        style={fontStyle}
                        dir="auto"
                    />
                ) : (
                    <div 
                        className="w-full h-full leading-relaxed whitespace-pre-wrap break-words"
                        style={fontStyle}
                        onDoubleClick={() => setIsEditing(true)}
                        dir="auto"
                    >
                        {item.content || <span className="text-gray-300 italic">Double-click to edit...</span>}
                    </div>
                )}
            </div>
        );
    }
    
    if (item.type === 'image') {
        return (
          <div className="w-full h-full relative group/img">
            {item.content ? (
              <img 
                src={item.content} 
                alt="moodboard" 
                className="w-full h-full object-cover pointer-events-none select-none"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-400 font-light">
                No Image
              </div>
            )}
          </div>
        );
    }
    
    if (item.type === 'shape') {
        return (
          <div 
            className="w-full h-full transition-colors duration-300"
            style={{ 
              backgroundColor: item.color || '#e5e7eb',
              borderRadius: item.shapeType === 'circle' ? '50%' : '12px',
              border: item.opacity && item.opacity < 1 ? '1px solid rgba(0,0,0,0.1)' : 'none'
            }}
          />
        );
    }
    
    if (item.type === 'todo') {
        return (
          <div className="w-full h-full p-4 flex flex-col bg-yellow-50/30">
            <h3 className="font-serif font-semibold text-gray-700 mb-3 text-lg border-b border-gray-200 pb-2">To-Do</h3>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {item.todos?.map((todo) => (
                <div 
                  key={todo.id} 
                  className={`flex items-center gap-2 group/todo p-1.5 rounded-lg transition-all border border-transparent ${
                    todo.urgency === 'high' ? 'bg-red-50/80 border-red-100' : 
                    todo.urgency === 'medium' ? 'bg-orange-50/50' : 
                    'hover:bg-black/5'
                  }`}
                >
                  <button 
                    onClick={() => handleUrgencyToggle(todo.id)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="p-1 rounded-full hover:bg-black/5 transition-colors focus:outline-none"
                    title={`Priority: ${todo.urgency.charAt(0).toUpperCase() + todo.urgency.slice(1)}`}
                  >
                    <Flag 
                        size={14} 
                        className={`transition-colors ${
                            todo.urgency === 'high' ? 'text-red-500 fill-red-500' : 
                            todo.urgency === 'medium' ? 'text-orange-500 fill-orange-100' : 
                            'text-gray-400'
                        }`}
                    />
                  </button>
                  
                  <button 
                    onClick={() => handleTodoToggle(todo.id)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`text-gray-400 hover:text-green-600 transition-colors ${todo.completed ? 'text-green-600' : ''}`}
                  >
                    {todo.completed ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                  
                  <input 
                    type="text" 
                    value={todo.text}
                    onKeyDown={(e) => e.stopPropagation()} 
                    onChange={(e) => handleTodoTextChange(todo.id, e.target.value)}
                    className={`bg-transparent outline-none w-full text-sm font-medium transition-all ${
                        todo.completed ? 'line-through text-gray-400' : 'text-gray-700'
                    }`}
                  />
                  
                  <button 
                    onClick={() => {
                        const newTodos = item.todos?.filter(t => t.id !== todo.id);
                        onUpdate(item.id, {todos: newTodos});
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover/todo:opacity-100 text-gray-300 hover:text-red-500 transition-colors p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button 
              onClick={handleAddTodo}
              onMouseDown={(e) => e.stopPropagation()}
              className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-800 bg-white/50 hover:bg-white p-2 rounded-lg transition-all shadow-sm border border-transparent hover:border-gray-200"
            >
              <Plus size={14} /> Add Item
            </button>
          </div>
        );
    }
    return null;
  };

  return (
    <div 
      style={containerStyle} 
      className={`group transition-shadow duration-200 select-none ${selectionClass} ${item.type === 'text' ? '' : 'bg-white'} rounded-xl overflow-visible flex flex-col`}
      onMouseDown={(e) => {
         if ((e.target as HTMLElement).tagName === 'INPUT') return;
         if ((e.target as HTMLElement).tagName === 'BUTTON') return; // Prevent drag on button click if not stopped
         if (!isEditing) onMouseDown(e, item.id, 'move');
      }}
    >
      {/* CONNECTION HANDLES (Left & Right) - Visible on Hover */}
      <div 
        className="absolute -left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border border-blue-500 opacity-0 group-hover:opacity-100 cursor-crosshair hover:bg-blue-100 hover:scale-125 transition-all shadow-sm z-50 flex items-center justify-center"
        onMouseDown={(e) => {
            e.stopPropagation();
            onMouseDown(e, item.id, 'connect');
        }}
        title="Connect from Left"
      >
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
      </div>
      
      <div 
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border border-blue-500 opacity-0 group-hover:opacity-100 cursor-crosshair hover:bg-blue-100 hover:scale-125 transition-all shadow-sm z-50 flex items-center justify-center"
        onMouseDown={(e) => {
            e.stopPropagation();
            onMouseDown(e, item.id, 'connect');
        }}
        title="Connect from Right"
      >
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
      </div>

      {/* Move Handle (Top) - Optional visual cue */}
      {isSelected && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-1 bg-gray-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
      )}

      {/* Content */}
      <div className="flex-1 w-full h-full overflow-hidden relative rounded-xl">
        {renderContent()}
      </div>

      {/* REACTIONS (Bottom Floating) */}
      <div className="absolute -bottom-3 left-0 w-full flex items-center gap-1 flex-wrap px-2 pointer-events-none">
         {/* Render existing reactions */}
         {item.reactions?.map((r, i) => (
             <button
                key={r.emoji + i}
                onMouseDown={(e) => { e.stopPropagation(); handleReactionClick(r.emoji); }}
                className="pointer-events-auto flex items-center gap-1 bg-white/90 backdrop-blur-sm border border-yellow-200/50 shadow-[0_0_8px_rgba(250,204,21,0.5)] rounded-full px-2 py-0.5 text-xs hover:scale-110 transition-all hover:bg-white hover:shadow-[0_0_12px_rgba(250,204,21,0.8)]"
                title="Click to remove"
             >
                <span className="filter drop-shadow-sm">{r.emoji}</span>
                <span className="text-gray-600 font-medium">{r.count}</span>
             </button>
         ))}
         
         {/* Add Reaction Button - Visible on Hover or if picker active */}
         <button
            onMouseDown={(e) => { e.stopPropagation(); onAddReaction(item.id, e); }}
            className="pointer-events-auto bg-gray-100/80 backdrop-blur-sm border border-gray-200 shadow-sm rounded-full w-6 h-6 flex items-center justify-center text-gray-500 hover:text-blue-600 hover:bg-white transition-all opacity-0 group-hover:opacity-100 scale-90 hover:scale-110"
            title="Add Reaction"
         >
            <SmilePlus size={14} />
         </button>
      </div>

      {/* Resize Handle (Bottom Right) */}
      {isSelected && !isEditing && (
        <div 
          className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-center justify-center text-gray-400 hover:text-blue-500 z-50"
          onMouseDown={(e) => {
            e.stopPropagation();
            onMouseDown(e, item.id, 'resize');
          }}
        >
          <div className="w-2 h-2 bg-current rounded-full" />
        </div>
      )}
    </div>
  );
};