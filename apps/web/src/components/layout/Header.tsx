import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Bell, LogOut, User } from 'lucide-react';
import { RootState } from '../../store';
import { logout } from '../../store/slices/auth.slice';

export default function Header() {
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.auth.user);
  const currentProject = useSelector((state: RootState) => state.project.currentProject);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div>
        {currentProject && (
          <span className="text-sm font-medium text-gray-700">{currentProject.name}</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button className="relative text-gray-500 hover:text-gray-700">
          <Bell size={20} />
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
            3
          </span>
        </button>

        <div className="flex items-center gap-2 text-sm">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
            {user?.firstName?.[0] || <User size={16} />}
          </div>
          {user && (
            <span className="text-gray-700 font-medium">
              {user.firstName} {user.lastName}
            </span>
          )}
        </div>

        <button
          onClick={() => dispatch(logout())}
          className="text-gray-500 hover:text-red-600 transition-colors"
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
