import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Project {
  id: string;
  name: string;
  description?: string;
  slug: string;
  status: string;
}

interface ProjectState {
  currentProject: Project | null;
  projects: Project[];
}

const initialState: ProjectState = {
  currentProject: null,
  projects: [],
};

const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    setCurrentProject: (state, action: PayloadAction<Project>) => {
      state.currentProject = action.payload;
    },
    setProjects: (state, action: PayloadAction<Project[]>) => {
      state.projects = action.payload;
    },
  },
});

export const { setCurrentProject, setProjects } = projectSlice.actions;
export default projectSlice.reducer;
