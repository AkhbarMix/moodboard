import React, { useState, useEffect } from 'react';
import { ProjectMetadata } from '../types';
import { Plus, FolderOpen, Upload, Clock, Trash2, ArrowRight, Layout } from 'lucide-react';
import { webStorage } from '../services/webStorage';

interface Props {
  userId: string | null;
  onOpenProject: (id: string) => void;
  onNewProject: (name: string) => void;
  onImportProject: () => void;
}

export const HomeScreen: React.FC<Props> = ({ 
  userId,
  onOpenProject, 
  onNewProject, 
  onImportProject 
}) => {
  const [recents, setRecents] = useState<ProjectMetadata[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadRecents();
  }, []);

  const loadRecents = async () => {
    try {
        let list: ProjectMetadata[] = [];
        if (window.moodboard) {
            list = await window.moodboard.listRecentProjects(userId);
        } else {
            // Web Fallback
            list = await webStorage.listRecentProjects();
        }
        setRecents(list);
    } catch (e) {
        console.error("Failed to load recents", e);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onNewProject(newName.trim());
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    // Prevent any parent handlers from firing
    e.preventDefault();
    e.stopPropagation();
    
    // Use setTimeout to allow the event to finish bubbling/capturing phases 
    // and UI updates before the blocking alert freezes the thread.
    setTimeout(async () => {
        if (!window.confirm('Are you sure you want to delete this project permanently?')) {
            return;
        }

        // Optimistic update: Remove immediately from UI for instant feedback
        const originalRecents = [...recents];
        setRecents(prev => prev.filter(p => p.id !== id));

        try {
            if (window.moodboard) {
                await window.moodboard.deleteProject(id);
            } else {
                await webStorage.deleteProject(id);
            }
            // Success - state already updated optimistically
        } catch (err) {
            console.error("Failed to delete project", err);
            // If fail, revert to original state and notify
            setRecents(originalRecents);
            alert("Failed to delete project. Please try again.");
        }
    }, 10);
  };

  return (
    <div className="w-full h-full bg-[#f5f5f7] flex flex-col items-center justify-center p-8 overflow-y-auto">
      <div className="max-w-4xl w-full flex flex-col gap-8">
        
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-2xl shadow-xl flex items-center justify-center mb-4">
                <Layout className="text-white" size={32} />
            </div>
            <h1 className="text-4xl font-serif font-bold text-gray-800">Lumière Board</h1>
            <p className="text-gray-500 mt-2">Your infinite creative workspace</p>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
                onClick={() => setIsCreating(true)}
                className="group relative h-32 bg-white rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all flex flex-col items-center justify-center gap-2 overflow-hidden"
            >
                {!isCreating ? (
                    <>
                        <div className="p-3 bg-blue-50 rounded-full text-blue-600 group-hover:scale-110 transition-transform">
                            <Plus size={24} />
                        </div>
                        <span className="font-semibold text-gray-700">New Project</span>
                    </>
                ) : (
                    <form onSubmit={handleCreateSubmit} className="w-full px-8 flex flex-col gap-2 items-center animate-in fade-in zoom-in-95">
                        <input 
                            autoFocus
                            type="text" 
                            placeholder="Project Name..." 
                            className="w-full text-center text-lg font-medium border-b-2 border-blue-500 outline-none pb-1 bg-transparent"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onBlur={() => { if(!newName) setIsCreating(false); }}
                        />
                        <button type="submit" className="text-xs bg-blue-500 text-white px-3 py-1 rounded-full mt-1">Create</button>
                    </form>
                )}
            </button>

            <button 
                onClick={onImportProject}
                className="group h-32 bg-white rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-purple-300 transition-all flex flex-col items-center justify-center gap-2"
            >
                <div className="p-3 bg-purple-50 rounded-full text-purple-600 group-hover:scale-110 transition-transform">
                    <Upload size={24} />
                </div>
                <span className="font-semibold text-gray-700">Import Project</span>
            </button>
        </div>

        {/* Recent Projects */}
        <div className="mt-4">
            <div className="flex items-center gap-2 mb-4 text-gray-500 uppercase text-xs font-bold tracking-wider">
                <Clock size={14} />
                <span>Recent Projects</span>
            </div>
            
            <div className="flex flex-col gap-2">
                {recents.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 italic">No recent projects</div>
                ) : (
                    recents.map(project => (
                        <div 
                            key={project.id}
                            className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex items-stretch overflow-hidden"
                        >
                            {/* Clickable Main Area - Completely separate div */}
                            <div 
                                onClick={() => onOpenProject(project.id)}
                                className="flex-1 p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                            >
                                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                                    <FolderOpen size={20} />
                                </div>
                                <div>
                                    <h3 className="font-medium text-gray-800">{project.name}</h3>
                                    <span className="text-xs text-gray-400">Last opened: {new Date(project.lastOpened).toLocaleDateString()}</span>
                                </div>
                            </div>

                            {/* Actions Area - Separate container with high z-index */}
                            <div className="flex items-center gap-2 px-4 bg-white relative z-20">
                                <button 
                                    onClick={(e) => handleDelete(e, project.id)}
                                    onMouseDown={(e) => e.stopPropagation()} 
                                    onMouseUp={(e) => e.stopPropagation()}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors cursor-pointer"
                                    title="Delete Project"
                                >
                                    <Trash2 size={18} className="pointer-events-none" />
                                </button>
                                
                                <button
                                     onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenProject(project.id);
                                     }}
                                     className="p-2 text-blue-500 bg-blue-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                >
                                    <ArrowRight size={18} className="pointer-events-none" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
      </div>
    </div>
  );
};