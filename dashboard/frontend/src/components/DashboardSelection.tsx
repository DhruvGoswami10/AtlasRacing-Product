import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ArrowRight, Gauge, Trophy, Code, Radio, LayoutGrid, Smartphone, Settings, RefreshCw } from 'lucide-react';
import { SetupGuide } from './SetupGuide';
import { QRCodePanel } from './QRCodePanel';
import { getStoredBackendHost, setBackendHost, clearBackendHost } from '../services/sse';

type DashboardId =
  | 'f1-pro'
  | 'gt-endurance'
  | 'live-analysis'
  | 'dev-mode'
  | 'gp-race-board'
  | 'dashboard-builder'
  | 'minimal-hud';

interface DashboardOption {
  id: DashboardId;
  name: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  status: 'stable' | 'beta' | 'new';
  category: 'f1' | 'gt' | 'direct' | 'dev';
}

const dashboards: DashboardOption[] = [
  {
    id: 'dev-mode',
    name: 'Dev Mode Dashboard',
    description:
      'Raw telemetry data viewer for development and testing - shows all implemented values',
    features: [
      'All telemetry values',
      'Game detection',
      'Driver grid info',
      'Debug information',
      'Universal for all games',
    ],
    icon: <Code className="w-6 h-6" />,
    status: 'stable',
    category: 'dev',
  },
  {
    id: 'f1-pro',
    name: 'F1 Dashboard',
    description:
      'Grid-based F1 dashboard with sector timing bars, comprehensive telemetry layout, and professional F1 broadcast styling',
    features: [
      'Grid Layout System',
      'Sector Timing Bars',
      'ERS & DRS Integration',
      'Tyre Compound Display',
      'Pit Window Status',
    ],
    icon: <Trophy className="w-6 h-6" />,
    status: 'new',
    category: 'f1',
  },
  {
    id: 'gt-endurance',
    name: 'Endurance Dashboard',
    description: 'Clean GT racing interface inspired by modern sim racing displays',
    features: ['Central Gear Display', 'RPM Lights', 'Input Monitoring', 'Tyre Temps'],
    icon: <Gauge className="w-6 h-6" />,
    status: 'new',
    category: 'gt',
  },
  {
    id: 'live-analysis',
    name: 'Live Race Analysis',
    description:
      'Full live telemetry view with lap deltas, tyre temps/wear, inputs, and trend charts for active sessions',
    features: [
      'Real-time speed/RPM/gear and inputs',
      'Tyre temps & wear with slip detection',
      'Sector timing + steering traces',
      'Live charts sourced from telemetry stream',
      'Session insights without AI dependencies',
    ],
    icon: <Radio className="w-6 h-6" />,
    status: 'stable',
    category: 'f1',
  },
  {
    id: 'gp-race-board',
    name: 'Race Director',
    description:
      'Multiview race board with leaderboard, track map, telemetry traces, and tire status in a GT-style layout',
    features: [
      'Multi-car leaderboard and relative gaps',
      'Track map with opponents',
      'Input traces (throttle/brake/speed)',
      'Tyre temp cards and telemetry bars'
    ],
    icon: <Radio className="w-6 h-6" />,
    status: 'beta',
    category: 'f1',
  },
  {
    id: 'minimal-hud',
    name: 'Minimal HUD',
    description:
      'Compact heads-up display designed for phone landscape as a second screen. Glanceable essentials only.',
    features: [
      'Position, gear, speed, delta',
      'Tyre wear strip',
      'Phone-landscape optimized (800x360)',
      'Zero clutter — peripheral vision friendly',
    ],
    icon: <Smartphone className="w-6 h-6" />,
    status: 'new',
    category: 'gt',
  },
  {
    id: 'dashboard-builder',
    name: 'Dashboard Builder',
    description:
      'Build your own dashboard with drag-and-drop widgets. Save, load, and share custom layouts.',
    features: [
      'Drag & drop widget placement',
      '18+ telemetry widgets',
      'Save & load layouts',
      'Undo/Redo support',
      'Grid-based responsive design',
    ],
    icon: <LayoutGrid className="w-6 h-6" />,
    status: 'new',
    category: 'dev',
  },
];

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface DashboardSelectionProps {
  onDashboardSelect: (dashboardId: DashboardId) => void;
  connectionStatus: ConnectionStatus;
  connectedGameName?: string | null;
  onRetryConnection?: () => void;
}

function openDashboardPopup(dashboardId: DashboardId) {
  const w = window.screen.availWidth;
  const h = window.screen.availHeight;
  window.open(
    `${window.location.pathname}#/dashboard/${dashboardId}`,
    `atlas-${dashboardId}`,
    `popup,width=${w},height=${h},left=0,top=0,menubar=no,toolbar=no,location=no,status=no`,
  );
}

export function DashboardSelection({
  onDashboardSelect,
  connectionStatus,
  connectedGameName,
  onRetryConnection,
}: DashboardSelectionProps) {
  const [showConnectionSettings, setShowConnectionSettings] = useState(false);
  const [manualHost, setManualHost] = useState('');
  const [discoveredHosts, setDiscoveredHosts] = useState<Array<{ ip: string; ssePort: number; game: string }>>([]);
  const currentHost = getStoredBackendHost() || window.location.hostname;

  const fetchDiscovery = useCallback(() => {
    const preferredHost = getStoredBackendHost() || window.location.hostname;
    const hosts = preferredHost === window.location.hostname
      ? [preferredHost]
      : [preferredHost, window.location.hostname];

    const tryHost = (index: number) => {
      if (index >= hosts.length) {
        setDiscoveredHosts([]);
        return;
      }

      fetch(`http://${hosts[index]}:8080/api/discover`)
        .then((r) => {
          if (!r.ok) {
            throw new Error(`Discovery failed on ${hosts[index]}`);
          }
          return r.json();
        })
        .then((data) => setDiscoveredHosts(Array.isArray(data.instances) ? data.instances : []))
        .catch(() => tryHost(index + 1));
    };

    tryHost(0);
  }, []);

  useEffect(() => {
    fetchDiscovery();
    const interval = setInterval(fetchDiscovery, 5000);
    return () => clearInterval(interval);
  }, [fetchDiscovery]);

  const handleConnect = (host: string) => {
    setBackendHost(host);
    window.location.reload();
  };

  const handleReset = () => {
    clearBackendHost();
    window.location.reload();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'stable':
        return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'beta':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'new':
        return 'bg-slate-500/15 text-slate-200 border-slate-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const connectionLabel = (() => {
    switch (connectionStatus) {
      case 'connected':
        return connectedGameName ? `Connected • ${connectedGameName}` : 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection Error';
      default:
        return 'Disconnected';
    }
  })();

  const connectionPillClasses = (() => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30';
      case 'connecting':
        return 'bg-amber-500/15 text-amber-200 border border-amber-500/30';
      case 'error':
        return 'bg-rose-500/15 text-rose-200 border border-rose-500/30';
      default:
        return 'bg-slate-700/50 text-slate-200 border border-slate-600/50';
    }
  })();

  const renderDashboardCards = (dashboardList: typeof dashboards) => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
      {dashboardList.map((dashboard) => (
        <Card
          key={dashboard.id}
          className="relative overflow-hidden border-border/40 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 group min-h-[420px] flex flex-col"
        >
          <CardHeader className="pb-6 px-8 pt-8 flex-shrink-0">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="p-4 rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                  {dashboard.icon}
                </div>
                <div className="flex-1">
                  <CardTitle className="text-xl mb-3 leading-tight">{dashboard.name}</CardTitle>
                  <Badge
                    variant="outline"
                    className={`text-sm capitalize px-3 py-1 ${getStatusColor(dashboard.status)}`}
                  >
                    {dashboard.status}
                  </Badge>
                </div>
              </div>
            </div>
            <CardDescription className="text-base text-muted-foreground leading-relaxed">
              {dashboard.description}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-0 pb-8 px-8 flex-1 flex flex-col justify-between">
            <div className="space-y-6 flex-1">
              <div>
                <h4 className="text-base font-medium mb-4 text-muted-foreground">Key Features</h4>
                <div className="grid grid-cols-1 gap-3">
                  {dashboard.features.map((feature, index) => (
                    <div
                      key={`${dashboard.id}-feature-${index}`}
                      className="text-base text-muted-foreground flex items-center gap-3"
                    >
                      <div className="w-2 h-2 bg-primary/60 rounded-full flex-shrink-0" />
                      <span className="leading-relaxed">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Button
              onClick={() => openDashboardPopup(dashboard.id)}
              className="w-full group/btn h-12 text-base mt-6"
              variant="default"
            >
              Launch Dashboard
              <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background flex flex-col">
      <div className="border-b border-border/40 bg-card/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-light tracking-[0.35em] text-foreground">
                ATLAS RACING
              </h1>
              <p className="text-muted-foreground">
                Choose a dashboard to launch your live telemetry experience.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 md:items-end">
              <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-secondary/30 border border-border/40">
                <Radio className="w-4 h-4 text-muted-foreground" />
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${connectionPillClasses}`}>
                  {connectionLabel}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        {/* QR code for connecting other devices */}
        <div className="mb-8">
          <QRCodePanel />
        </div>

        {/* Backend connection settings */}
        <div className="mb-8">
          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-3">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              <span className="text-sm text-muted-foreground">
                Backend: <span className="text-foreground font-mono">{currentHost}</span>
              </span>
              {discoveredHosts.length > 0 && !showConnectionSettings && (
                <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">
                  {discoveredHosts.length} remote {discoveredHosts.length === 1 ? 'source' : 'sources'} found
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setShowConnectionSettings(!showConnectionSettings)}
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>

          {showConnectionSettings && (
            <Card className="mt-2 border-border/40 bg-card/60">
              <CardContent className="p-4 space-y-4">
                {discoveredHosts.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Discovered Atlas Core Instances</h4>
                    <div className="flex flex-wrap gap-2">
                      {discoveredHosts.map((h, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="font-mono"
                          onClick={() => handleConnect(h.ip)}
                        >
                          {h.ip}{h.game ? ` (${h.game})` : ''}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Manual Connection</h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualHost}
                      onChange={e => setManualHost(e.target.value)}
                      placeholder="e.g. 192.168.1.100"
                      className="flex-1 px-3 py-1.5 rounded-md border border-border bg-background text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      onKeyDown={e => { if (e.key === 'Enter' && manualHost.trim()) handleConnect(manualHost.trim()); }}
                    />
                    <Button
                      size="sm"
                      disabled={!manualHost.trim()}
                      onClick={() => handleConnect(manualHost.trim())}
                    >
                      Connect
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <Button variant="ghost" size="sm" onClick={fetchDiscovery} className="text-muted-foreground">
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Refresh
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
                    Reset to auto-detect
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* First-run setup guide */}
        <div className="mb-8">
          <SetupGuide
            connectionStatus={connectionStatus}
            connectedGameName={connectedGameName}
            onRetryConnection={onRetryConnection}
          />
        </div>

        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl mb-2 text-foreground">Available Dashboards</h2>
            <p className="text-muted-foreground">
              Choose from our collection of professional racing dashboards.
            </p>
          </div>
        </div>

        {renderDashboardCards(dashboards)}
      </div>
    </div>
  );
}

