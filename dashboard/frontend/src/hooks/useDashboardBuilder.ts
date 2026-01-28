import { useState, useCallback } from 'react';
import { Layout } from 'react-grid-layout';

export interface DashboardWidget {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, any>;
}

export interface DashboardBuilderState {
  layout: Layout[];
  widgets: DashboardWidget[];
  selectedWidget: string | null;
  isDragging: boolean;
  showGrid: boolean;
  isEditMode: boolean;
  zoom: number;
  dashboardName: string;
  history: DashboardBuilderState[];
  historyIndex: number;
}

const initialState: DashboardBuilderState = {
  layout: [],
  widgets: [],
  selectedWidget: null,
  isDragging: false,
  showGrid: true,
  isEditMode: true,
  zoom: 1,
  dashboardName: '',
  history: [],
  historyIndex: -1
};

export const useDashboardBuilder = () => {
  const [state, setState] = useState<DashboardBuilderState>(initialState);
  const maxHistorySize = 50;

  const addToHistory = useCallback((newState: Partial<DashboardBuilderState>) => {
    setState(prevState => {
      const currentStateSnapshot = {
        layout: [...prevState.layout],
        widgets: [...prevState.widgets],
        selectedWidget: prevState.selectedWidget,
        isDragging: prevState.isDragging,
        showGrid: prevState.showGrid,
        isEditMode: prevState.isEditMode,
        zoom: prevState.zoom,
        dashboardName: prevState.dashboardName,
        history: prevState.history,
        historyIndex: prevState.historyIndex
      };

      const newHistory = [...prevState.history.slice(0, prevState.historyIndex + 1), currentStateSnapshot];
      if (newHistory.length > maxHistorySize) {
        newHistory.shift();
      }

      return {
        ...prevState,
        ...newState,
        history: newHistory,
        historyIndex: newHistory.length - 1
      };
    });
  }, []);

  const setLayout = useCallback((newLayout: Layout[]) => {
    addToHistory({ layout: newLayout });
  }, [addToHistory]);

  const setSelectedWidget = useCallback((widgetId: string | null) => {
    setState(prevState => ({
      ...prevState,
      selectedWidget: widgetId
    }));
  }, []);

  const setShowGrid = useCallback((show: boolean) => {
    setState(prevState => ({
      ...prevState,
      showGrid: show
    }));
  }, []);

  const setIsEditMode = useCallback((isEdit: boolean) => {
    setState(prevState => ({
      ...prevState,
      isEditMode: isEdit
    }));
  }, []);

  const setZoom = useCallback((zoom: number) => {
    setState(prevState => ({
      ...prevState,
      zoom: Math.max(0.5, Math.min(2, zoom))
    }));
  }, []);

  const setDashboardName = useCallback((name: string) => {
    setState(prevState => ({
      ...prevState,
      dashboardName: name
    }));
  }, []);

  const addWidget = useCallback((widget: DashboardWidget) => {
    const layoutItem: Layout = {
      i: widget.id,
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
      minW: 2,
      minH: 2,
      maxW: 12,
      maxH: 12
    };

    addToHistory({
      layout: [...state.layout, layoutItem],
      widgets: [...state.widgets, widget]
    });
  }, [state.layout, state.widgets, addToHistory]);

  const removeWidget = useCallback((widgetId: string) => {
    const newLayout = state.layout.filter(item => item.i !== widgetId);
    const newWidgets = state.widgets.filter(widget => widget.id !== widgetId);
    
    addToHistory({
      layout: newLayout,
      widgets: newWidgets,
      selectedWidget: null
    });
  }, [state.layout, state.widgets, addToHistory]);

  const updateWidget = useCallback((widgetId: string, updates: Partial<DashboardWidget>) => {
    const newWidgets = state.widgets.map(widget =>
      widget.id === widgetId ? { ...widget, ...updates } : widget
    );
    
    addToHistory({
      widgets: newWidgets
    });
  }, [state.widgets, addToHistory]);

  const saveDashboard = useCallback(() => {
    const dashboardData = {
      name: state.dashboardName,
      layout: state.layout,
      widgets: state.widgets,
      created: new Date().toISOString()
    };
    
    try {
      const savedDashboards = JSON.parse(localStorage.getItem('savedDashboards') || '[]');
      const existingIndex = savedDashboards.findIndex((d: any) => d.name === state.dashboardName);
      
      if (existingIndex >= 0) {
        savedDashboards[existingIndex] = { ...dashboardData, updated: new Date().toISOString() };
      } else {
        savedDashboards.push(dashboardData);
      }
      
      localStorage.setItem('savedDashboards', JSON.stringify(savedDashboards));
      return true;
    } catch (error) {
      console.error('Error saving dashboard:', error);
      return false;
    }
  }, [state.dashboardName, state.layout, state.widgets]);

  const loadDashboard = useCallback((dashboardData: any) => {
    try {
      setState(prevState => ({
        ...prevState,
        layout: dashboardData.layout || [],
        widgets: dashboardData.widgets || [],
        dashboardName: dashboardData.name || '',
        selectedWidget: null,
        history: [],
        historyIndex: -1
      }));
      return true;
    } catch (error) {
      console.error('Error loading dashboard:', error);
      return false;
    }
  }, []);

  const clearDashboard = useCallback(() => {
    addToHistory({
      layout: [],
      widgets: [],
      selectedWidget: null,
      dashboardName: ''
    });
  }, [addToHistory]);

  const undo = useCallback(() => {
    if (state.historyIndex > 0) {
      setState(prevState => {
        const previousState = prevState.history[prevState.historyIndex - 1];
        return {
          ...prevState,
          ...previousState,
          historyIndex: prevState.historyIndex - 1
        };
      });
    }
  }, [state.historyIndex]);

  const redo = useCallback(() => {
    if (state.historyIndex < state.history.length - 1) {
      setState(prevState => {
        const nextState = prevState.history[prevState.historyIndex + 1];
        return {
          ...prevState,
          ...nextState,
          historyIndex: prevState.historyIndex + 1
        };
      });
    }
  }, [state.historyIndex, state.history.length]);

  const canUndo = state.historyIndex > 0;
  const canRedo = state.historyIndex < state.history.length - 1;

  return {
    layout: state.layout,
    widgets: state.widgets,
    selectedWidget: state.selectedWidget,
    isDragging: state.isDragging,
    showGrid: state.showGrid,
    isEditMode: state.isEditMode,
    zoom: state.zoom,
    dashboardName: state.dashboardName,
    setLayout,
    setSelectedWidget,
    setShowGrid,
    setIsEditMode,
    setZoom,
    setDashboardName,
    addWidget,
    removeWidget,
    updateWidget,
    saveDashboard,
    loadDashboard,
    clearDashboard,
    canUndo,
    canRedo,
    undo,
    redo
  };
};