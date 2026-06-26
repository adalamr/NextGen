import React from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  LayoutDashboard, FolderOpen, Database, FlaskConical,
  Sparkles, Play, BarChart3, Shield, ChevronLeft, ChevronRight,
  Bot
} from 'lucide-react';
import { RootState } from '../../store';
import { toggleSidebar } from '../../store/slices/ui.slice';

const LAYER_NAV = [
  { layer: 'layer1', label: 'Context & Knowledge', icon: Database, color: 'text-purple-500' },
  { layer: 'layer2', label: 'Test Design', icon: FlaskConical, color: 'text-blue-500' },
  { layer: 'layer3', label: 'Generation', icon: Sparkles, color: 'text-yellow-500' },
  { layer: 'layer4', label: 'Execution', icon: Play, color: 'text-green-500' },
  { layer: 'layer5', label: 'Analysis & Healing', icon: BarChart3, color: 'text-orange-500' },
  { layer: 'layer6', label: 'Governance', icon: Shield, color: 'text-red-500' },
];

export default function Sidebar() {
  const dispatch = useDispatch();
  const sidebarOpen = useSelector((state: RootState) => state.ui.sidebarOpen);
  const currentProject = useSelector((state: RootState) => state.project.currentProject);
  const { id: projectId } = useParams();
  const activeProjectId = projectId || currentProject?.id;

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-gray-900 text-white transition-all duration-300 z-40 flex flex-col
        ${sidebarOpen ? 'w-64' : 'w-16'}`}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-gray-700">
        <Bot className="text-blue-400 shrink-0" size={24} />
        {sidebarOpen && (
          <span className="ml-3 font-bold text-lg whitespace-nowrap">AI Test Platform</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {/* Global */}
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
             ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`
          }
        >
          <LayoutDashboard size={18} className="shrink-0" />
          {sidebarOpen && <span>Dashboard</span>}
        </NavLink>

        <NavLink
          to="/projects"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
             ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`
          }
        >
          <FolderOpen size={18} className="shrink-0" />
          {sidebarOpen && <span>Projects</span>}
        </NavLink>

        {/* Layer Nav (shown when project is active) */}
        {activeProjectId && (
          <>
            {sidebarOpen && (
              <div className="px-4 py-2 mt-4">
                <p className="text-xs font-semibold uppercase text-gray-500 tracking-wider">
                  Project Layers
                </p>
              </div>
            )}
            {LAYER_NAV.map((item) => (
              <NavLink
                key={item.layer}
                to={`/projects/${activeProjectId}/${item.layer}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
                   ${isActive ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-800'}`
                }
              >
                <item.icon size={18} className={`shrink-0 ${item.color}`} />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Toggle Button */}
      <button
        onClick={() => dispatch(toggleSidebar())}
        className="flex items-center justify-center h-12 border-t border-gray-700 hover:bg-gray-800 transition-colors"
      >
        {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>
    </aside>
  );
}
