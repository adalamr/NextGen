import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import RequirementsTab from './components/RequirementsTab';
import AppModelTab from './components/AppModelTab';
import KnowledgeSearchTab from './components/KnowledgeSearchTab';
import TemplatesTab from './components/TemplatesTab';
import TraceabilityTab from './components/TraceabilityTab';
import { FileText, Globe, Search, BookOpen, Link } from 'lucide-react';

type Tab = 'requirements' | 'appmodel' | 'knowledge' | 'templates' | 'traceability';

const TABS: Array<{ key: Tab; label: string; icon: React.ReactNode; description: string }> = [
  { key: 'requirements', label: 'Requirements', icon: <FileText className="w-4 h-4" />, description: '1E: Structured requirements & coverage' },
  { key: 'appmodel', label: 'App Model', icon: <Globe className="w-4 h-4" />, description: '1C: API contracts, UI pages, DB schema, roles' },
  { key: 'knowledge', label: 'Knowledge Base', icon: <Search className="w-4 h-4" />, description: '1F: Semantic search over all project docs' },
  { key: 'templates', label: 'Templates & Samples', icon: <BookOpen className="w-4 h-4" />, description: '1A/1B/1D: I/O templates and few-shot examples' },
  { key: 'traceability', label: 'Traceability', icon: <Link className="w-4 h-4" />, description: 'Req → Test Case coverage matrix' },
];

export default function Layer1ContextPage() {
  const [activeTab, setActiveTab] = useState<Tab>('requirements');
  const selectedProjectId = useSelector((state: RootState) => state.project.currentProject?.id ?? null);

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-4xl mb-3">📂</div>
        <h2 className="text-xl font-semibold text-gray-700 mb-1">No Project Selected</h2>
        <p className="text-gray-400 text-sm">Select a project from the top navigation to view Layer 1 context.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Layer 1: Context & Knowledge</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage requirements, application model, knowledge base, templates, and traceability for AI-powered test generation.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b mb-5 gap-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap
              ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab description */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5 mb-4 text-sm text-indigo-700">
        {TABS.find(t => t.key === activeTab)?.description}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'requirements' && <RequirementsTab projectId={selectedProjectId} />}
        {activeTab === 'appmodel' && <AppModelTab projectId={selectedProjectId} />}
        {activeTab === 'knowledge' && <KnowledgeSearchTab projectId={selectedProjectId} />}
        {activeTab === 'templates' && <TemplatesTab projectId={selectedProjectId} />}
                {activeTab === 'traceability' && <TraceabilityTab projectId={selectedProjectId} />}
      </div>
    </div>
  );
}
