import React from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  Database, FlaskConical, Sparkles, Play, BarChart3, Shield,
  CheckCircle, Clock, AlertTriangle, TrendingUp, ArrowRight
} from 'lucide-react';
import { RootState } from '../../store';

const LAYER_CARDS = [
  {
    layer: 1,
    label: 'Context & Knowledge',
    icon: Database,
    color: 'bg-purple-50 border-purple-200',
    iconColor: 'text-purple-600 bg-purple-100',
    description: 'Connectors, App Model, Knowledge Base, Traceability Matrix',
  },
  {
    layer: 2,
    label: 'Test Design',
    icon: FlaskConical,
    color: 'bg-blue-50 border-blue-200',
    iconColor: 'text-blue-600 bg-blue-100',
    description: 'Technique Engine, Risk Prioritization, Coverage Gap Analysis',
  },
  {
    layer: 3,
    label: 'AI Generation',
    icon: Sparkles,
    color: 'bg-yellow-50 border-yellow-200',
    iconColor: 'text-yellow-600 bg-yellow-100',
    description: 'Test Cases, Scripts, Test Data – generated with your LLM',
  },
  {
    layer: 4,
    label: 'Execution',
    icon: Play,
    color: 'bg-green-50 border-green-200',
    iconColor: 'text-green-600 bg-green-100',
    description: 'Orchestrator, Environments, Azure DevOps / Jenkins CI/CD',
  },
  {
    layer: 5,
    label: 'Analysis & Self-Healing',
    icon: BarChart3,
    color: 'bg-orange-50 border-orange-200',
    iconColor: 'text-orange-600 bg-orange-100',
    description: 'Result Classifier, Failure Clustering, Locator Self-Healing',
  },
  {
    layer: 6,
    label: 'Governance',
    icon: Shield,
    color: 'bg-red-50 border-red-200',
    iconColor: 'text-red-600 bg-red-100',
    description: 'Review Gates, Audit Logs, RBAC, Explainability, Versioning',
  },
];

const STATS = [
  { label: 'Test Cases Generated', value: '2,847', icon: Sparkles, trend: '+124 this week', trendUp: true },
  { label: 'Scripts Executed', value: '1,563', icon: Play, trend: '+89 today', trendUp: true },
  { label: 'Pass Rate', value: '94.2%', icon: CheckCircle, trend: '+2.1%', trendUp: true },
  { label: 'Pending Reviews', value: '18', icon: Clock, trend: '5 critical', trendUp: false },
];

export default function DashboardPage() {
  const user = useSelector((state: RootState) => state.auth.user);
  const projects = useSelector((state: RootState) => state.project.projects);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.firstName} 👋
        </h1>
        <p className="text-gray-500 mt-1">
          Your AI-powered testing platform is ready. Select a project to get started.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{stat.label}</span>
              <stat.icon size={18} className="text-gray-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
            <div className={`flex items-center gap-1 mt-1 text-xs ${stat.trendUp ? 'text-green-600' : 'text-orange-600'}`}>
              <TrendingUp size={12} />
              {stat.trend}
            </div>
          </div>
        ))}
      </div>

      {/* 6-Layer Architecture Overview */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Platform Architecture — 6 Layers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LAYER_CARDS.map((card) => (
            <div key={card.layer} className={`rounded-xl border p-4 ${card.color}`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.iconColor}`}>
                  <card.icon size={18} />
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-500">Layer {card.layer}</span>
                  <h3 className="text-sm font-semibold text-gray-900">{card.label}</h3>
                </div>
              </div>
              <p className="text-xs text-gray-600">{card.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Projects */}
      {projects.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Recent Projects</h2>
            <Link to="/projects" className="text-blue-600 text-sm flex items-center gap-1 hover:underline">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.slice(0, 3).map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900 truncate">{project.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    project.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {project.status}
                  </span>
                </div>
                {project.description && (
                  <p className="text-xs text-gray-500 truncate">{project.description}</p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Alert: No projects */}
      {projects.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 flex items-start gap-4">
          <AlertTriangle className="text-blue-500 shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="font-semibold text-blue-900">No projects yet</h3>
            <p className="text-sm text-blue-700 mt-1">
              Create your first project to start using the AI Test Platform.
            </p>
            <Link
              to="/projects"
              className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              Create Project <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
