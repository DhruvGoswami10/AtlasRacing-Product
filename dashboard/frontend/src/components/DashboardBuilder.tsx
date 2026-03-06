import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import ReactGridLayout, { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useDashboardBuilder, DashboardWidget } from '../hooks/useDashboardBuilder';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Gauge, BarChart, Hash, Sliders, Circle, Thermometer, Clock, Timer,
  TrendingUp, Fuel, Zap, List, Map, Cloud, Flag, Wifi, Trophy,
  Search, ChevronDown, ChevronRight, Plus, Trash2, Undo2, Redo2,
  Save, FolderOpen, Grid3X3, Eye, Edit3, ArrowLeft, X, GripVertical,
  LucideIcon,
} from 'lucide-react';

interface WidgetDefinition {
  type: string;
  name: string;
  category: string;
  defaultW: number;
  defaultH: number;
  icon: LucideIcon;
}

const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  { type: 'speed-gauge', name: 'Speed', category: 'gauge', defaultW: 3, defaultH: 3, icon: Gauge },
  { type: 'rpm-bar', name: 'RPM Bar', category: 'gauge', defaultW: 6, defaultH: 2, icon: BarChart },
  { type: 'gear-display', name: 'Gear', category: 'gauge', defaultW: 2, defaultH: 3, icon: Hash },
  { type: 'throttle-brake', name: 'Throttle/Brake', category: 'input', defaultW: 2, defaultH: 4, icon: Sliders },
  { type: 'tyre-status', name: 'Tyre Status', category: 'tyre', defaultW: 4, defaultH: 4, icon: Circle },
  { type: 'tyre-temps', name: 'Tyre Temps', category: 'tyre', defaultW: 4, defaultH: 3, icon: Thermometer },
  { type: 'lap-times', name: 'Lap Times', category: 'timing', defaultW: 4, defaultH: 3, icon: Clock },
  { type: 'sector-timing', name: 'Sectors', category: 'timing', defaultW: 4, defaultH: 2, icon: Timer },
  { type: 'delta-display', name: 'Delta', category: 'timing', defaultW: 3, defaultH: 2, icon: TrendingUp },
  { type: 'fuel-status', name: 'Fuel', category: 'fuel', defaultW: 3, defaultH: 3, icon: Fuel },
  { type: 'ers-bar', name: 'ERS', category: 'fuel', defaultW: 4, defaultH: 2, icon: Zap },
  { type: 'leaderboard', name: 'Leaderboard', category: 'race', defaultW: 4, defaultH: 6, icon: List },
  { type: 'track-map', name: 'Track Map', category: 'race', defaultW: 4, defaultH: 4, icon: Map },
  { type: 'weather-info', name: 'Weather', category: 'session', defaultW: 3, defaultH: 2, icon: Cloud },
  { type: 'session-timer', name: 'Session Timer', category: 'session', defaultW: 3, defaultH: 2, icon: Timer },
  { type: 'pit-strategy', name: 'Pit Strategy', category: 'strategy', defaultW: 4, defaultH: 4, icon: Flag },
  { type: 'connection-status', name: 'Connection', category: 'session', defaultW: 3, defaultH: 2, icon: Wifi },
  { type: 'position-display', name: 'Position', category: 'race', defaultW: 2, defaultH: 2, icon: Trophy },
];

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'gauge', label: 'Gauges' },
  { key: 'tyre', label: 'Tyres' },
  { key: 'timing', label: 'Timing' },
  { key: 'fuel', label: 'Fuel / ERS' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'race', label: 'Race' },
  { key: 'session', label: 'Session' },
  { key: 'input', label: 'Inputs' },
];

const CATEGORY_COLORS: Record<string, string> = {
  gauge: '#ef4444',
  tyre: '#22c55e',
  timing: '#3b82f6',
  fuel: '#f59e0b',
  strategy: '#a855f7',
  race: '#ec4899',
  session: '#06b6d4',
  input: '#f97316',
};

export function DashboardBuilder() {
  const {
    layout, widgets, selectedWidget, showGrid, isEditMode, dashboardName,
    setLayout, setSelectedWidget, setShowGrid, setIsEditMode, setDashboardName,
    addWidget, removeWidget, saveDashboard, loadDashboard, clearDashboard,
    canUndo, canRedo, undo, redo,
  } = useDashboardBuilder();

  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [savedList, setSavedList] = useState<any[]>([]);
  const [showLoadDropdown, setShowLoadDropdown] = useState(false);
  const loadRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(960);

  useEffect(() => {
    if (!canvasRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentRect.width);
      }
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (loadRef.current && !loadRef.current.contains(e.target as Node)) {
        setShowLoadDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const refreshSavedList = useCallback(() => {
    try {
      const list = JSON.parse(localStorage.getItem('savedDashboards') || '[]');
      setSavedList(list);
    } catch {
      setSavedList([]);
    }
  }, []);

  const handleBack = useCallback(() => {
    window.dispatchEvent(new CustomEvent('atlas-back-to-selection'));
  }, []);

  const handleAddWidget = useCallback((def: WidgetDefinition) => {
    const maxY = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    const widget: DashboardWidget = {
      id: `${def.type}-${Date.now()}`,
      type: def.type,
      x: 0,
      y: maxY,
      w: def.defaultW,
      h: def.defaultH,
      config: {},
    };
    addWidget(widget);
  }, [layout, addWidget]);

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    setLayout(newLayout);
  }, [setLayout]);

  const handleSave = useCallback(() => {
    if (!dashboardName.trim()) return;
    saveDashboard();
    refreshSavedList();
  }, [dashboardName, saveDashboard, refreshSavedList]);

  const handleLoad = useCallback((dashboard: any) => {
    loadDashboard(dashboard);
    setShowLoadDropdown(false);
  }, [loadDashboard]);

  const toggleCategory = useCallback((key: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const filteredDefinitions = useMemo(() => {
    if (!searchQuery.trim()) return WIDGET_DEFINITIONS;
    const q = searchQuery.toLowerCase();
    return WIDGET_DEFINITIONS.filter(
      d => d.name.toLowerCase().includes(q) || d.type.toLowerCase().includes(q) || d.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const groupedWidgets = useMemo(() => {
    const map: Record<string, WidgetDefinition[]> = {};
    for (const def of filteredDefinitions) {
      if (!map[def.category]) map[def.category] = [];
      map[def.category].push(def);
    }
    return map;
  }, [filteredDefinitions]);

  const selectedWidgetData = useMemo(
    () => widgets.find(w => w.id === selectedWidget),
    [widgets, selectedWidget]
  );

  const selectedWidgetDef = useMemo(
    () => selectedWidgetData ? WIDGET_DEFINITIONS.find(d => d.type === selectedWidgetData.type) : null,
    [selectedWidgetData]
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-[#050505] text-foreground overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-[#0a0a0a] shrink-0">
        <Button variant="ghost" size="icon" onClick={handleBack} title="Back">
          <ArrowLeft className="size-4" />
        </Button>

        <div className="h-5 w-px bg-border/40" />

        <input
          type="text"
          value={dashboardName}
          onChange={e => setDashboardName(e.target.value)}
          placeholder="Dashboard name…"
          className="bg-transparent border border-border/40 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground w-48 focus:outline-none focus:border-ring"
        />

        <div className="h-5 w-px bg-border/40" />

        <Button
          variant={isEditMode ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setIsEditMode(!isEditMode)}
          title={isEditMode ? 'Switch to preview' : 'Switch to edit'}
        >
          {isEditMode ? <Edit3 className="size-3.5 mr-1" /> : <Eye className="size-3.5 mr-1" />}
          {isEditMode ? 'Edit' : 'Preview'}
        </Button>

        <Button
          variant={showGrid ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowGrid(!showGrid)}
          title="Toggle grid"
        >
          <Grid3X3 className="size-3.5" />
        </Button>

        <div className="h-5 w-px bg-border/40" />

        <Button variant="outline" size="icon" onClick={undo} disabled={!canUndo} title="Undo">
          <Undo2 className="size-3.5" />
        </Button>
        <Button variant="outline" size="icon" onClick={redo} disabled={!canRedo} title="Redo">
          <Redo2 className="size-3.5" />
        </Button>

        <div className="h-5 w-px bg-border/40" />

        <Button variant="default" size="sm" onClick={handleSave} disabled={!dashboardName.trim()} title="Save">
          <Save className="size-3.5 mr-1" />
          Save
        </Button>

        <div className="relative" ref={loadRef}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refreshSavedList(); setShowLoadDropdown(!showLoadDropdown); }}
            title="Load"
          >
            <FolderOpen className="size-3.5 mr-1" />
            Load
          </Button>
          {showLoadDropdown && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-[#111] border border-border/40 rounded-lg shadow-xl z-50 py-1 max-h-64 overflow-y-auto">
              {savedList.length === 0 ? (
                <p className="text-xs text-muted-foreground px-3 py-2">No saved dashboards</p>
              ) : (
                savedList.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => handleLoad(d)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors text-foreground"
                  >
                    {d.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <Button variant="outline" size="sm" onClick={clearDashboard} title="Clear all">
          <Trash2 className="size-3.5 mr-1" />
          Clear
        </Button>

        <div className="flex-1" />

        <Badge variant="outline" className="text-xs">
          {widgets.length} widget{widgets.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar - Widget Palette */}
        {isEditMode && (
          <div className="w-[280px] shrink-0 border-r border-border/40 bg-[#0a0a0a] flex flex-col min-h-0">
            <div className="p-3 border-b border-border/40">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search widgets…"
                  className="w-full bg-transparent border border-border/40 rounded-md pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {CATEGORIES.filter(cat => cat.key in groupedWidgets).map(cat => {
                const isCollapsed = collapsedCategories.has(cat.key);
                const items = groupedWidgets[cat.key] || [];
                return (
                  <div key={cat.key}>
                    <button
                      onClick={() => toggleCategory(cat.key)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    >
                      {isCollapsed
                        ? <ChevronRight className="size-3" />
                        : <ChevronDown className="size-3" />}
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[cat.key] }}
                      />
                      {cat.label}
                      <span className="ml-auto text-[10px] font-normal opacity-60">{items.length}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="pb-1">
                        {items.map((def: WidgetDefinition) => {
                          const Icon = def.icon;
                          return (
                            <button
                              key={def.type}
                              onClick={() => handleAddWidget(def)}
                              className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-white/5 transition-colors group"
                            >
                              <div
                                className="size-7 rounded-md flex items-center justify-center shrink-0"
                                style={{ backgroundColor: `${CATEGORY_COLORS[def.category]}15`, color: CATEGORY_COLORS[def.category] }}
                              >
                                <Icon className="size-3.5" />
                              </div>
                              <span className="text-foreground/80 group-hover:text-foreground truncate">{def.name}</span>
                              <Plus className="size-3.5 ml-auto opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Center - Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 min-w-0 overflow-auto relative"
          onClick={(e) => {
            if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvasBg) {
              setSelectedWidget(null);
            }
          }}
        >
          <div
            data-canvas-bg="true"
            className="min-h-full p-4"
            style={{
              backgroundImage: showGrid
                ? `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                   linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`
                : 'none',
              backgroundSize: showGrid ? `${canvasWidth / 12}px 40px` : undefined,
            }}
          >
            <ReactGridLayout
              className="layout"
              layout={layout}
              cols={12}
              rowHeight={40}
              width={canvasWidth - 32}
              onLayoutChange={handleLayoutChange}
              isDraggable={isEditMode}
              isResizable={isEditMode}
              compactType="vertical"
              margin={[8, 8]}
              containerPadding={[0, 0]}
              useCSSTransforms
            >
              {widgets.map(widget => {
                const def = WIDGET_DEFINITIONS.find(d => d.type === widget.type);
                const isSelected = selectedWidget === widget.id;
                const color = CATEGORY_COLORS[def?.category || 'gauge'] || '#888';
                const Icon = def?.icon || Gauge;
                const layoutItem = layout.find(l => l.i === widget.id);

                return (
                  <div
                    key={widget.id}
                    className={`
                      rounded-lg overflow-hidden cursor-pointer transition-shadow
                      ${isSelected ? 'ring-2 ring-primary shadow-lg shadow-primary/10' : 'ring-1 ring-border/30 hover:ring-border/60'}
                    `}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedWidget(widget.id);
                    }}
                    style={{ backgroundColor: 'rgba(20,20,20,0.8)' }}
                  >
                    <div className="h-1 w-full" style={{ backgroundColor: color }} />
                    <div className="flex flex-col items-center justify-center h-[calc(100%-4px)] px-2 py-2 select-none">
                      <Icon className="size-5 mb-1.5" style={{ color }} />
                      <span className="text-xs font-medium text-foreground/80 text-center leading-tight">
                        {def?.name || widget.type}
                      </span>
                      {layoutItem && (
                        <span className="text-[10px] text-muted-foreground mt-1">
                          {layoutItem.w}×{layoutItem.h}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </ReactGridLayout>

            {widgets.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Grid3X3 className="size-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground/50">
                    {isEditMode ? 'Add widgets from the palette' : 'No widgets on this dashboard'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar - Widget Config */}
        {selectedWidget && selectedWidgetData && (
          <div className="w-[260px] shrink-0 border-l border-border/40 bg-[#0a0a0a] flex flex-col min-h-0">
            <div className="flex items-center justify-between px-3 py-3 border-b border-border/40">
              <span className="text-sm font-medium">Widget Config</span>
              <button
                onClick={() => setSelectedWidget(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</label>
                <div className="flex items-center gap-2">
                  {selectedWidgetDef && (
                    <div
                      className="size-8 rounded-md flex items-center justify-center"
                      style={{
                        backgroundColor: `${CATEGORY_COLORS[selectedWidgetDef.category]}15`,
                        color: CATEGORY_COLORS[selectedWidgetDef.category],
                      }}
                    >
                      <selectedWidgetDef.icon className="size-4" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">{selectedWidgetDef?.name || selectedWidgetData.type}</p>
                    <Badge variant="outline" className="text-[10px] mt-0.5">{selectedWidgetDef?.category || 'unknown'}</Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ID</label>
                <p className="text-xs text-foreground/60 font-mono break-all">{selectedWidgetData.id}</p>
              </div>

              <div className="h-px bg-border/40" />

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Configuration</label>
                <p className="text-xs text-muted-foreground italic">Widget-specific settings coming soon.</p>
              </div>
            </div>

            <div className="p-3 border-t border-border/40">
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => removeWidget(selectedWidgetData.id)}
              >
                <Trash2 className="size-3.5 mr-1" />
                Delete Widget
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
