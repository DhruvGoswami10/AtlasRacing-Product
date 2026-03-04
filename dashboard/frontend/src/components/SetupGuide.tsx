import { useState, useEffect, useCallback } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Wifi,
  WifiOff,
  Gamepad2,
  Rocket,
  HelpCircle,
  X,
  RefreshCw,
  Loader2,
} from 'lucide-react';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

const STORAGE_KEY = 'atlas-setup-complete';

interface SetupGuideProps {
  connectionStatus: ConnectionStatus;
  connectedGameName?: string | null;
  onRetryConnection?: () => void;
}

interface StepProps {
  stepNumber: number;
  title: string;
  done: boolean;
  active: boolean;
  children: React.ReactNode;
}

function Step({ stepNumber, title, done, active, children }: StepProps) {
  return (
    <div
      className={`rounded-xl border p-5 transition-all duration-300 ${
        done
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : active
            ? 'border-primary/40 bg-primary/5'
            : 'border-border/30 bg-card/30 opacity-60'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          {done ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <Circle className={`w-5 h-5 ${active ? 'text-primary' : 'text-muted-foreground/40'}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Step {stepNumber}
            </span>
            <h3 className={`text-sm font-semibold ${done ? 'text-emerald-300' : 'text-foreground'}`}>
              {title}
            </h3>
          </div>
          <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function SetupGuide({ connectionStatus, connectedGameName, onRetryConnection }: SetupGuideProps) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [expanded, setExpanded] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';
  const gameDetected = isConnected && !!connectedGameName;

  // Auto-mark complete when everything is working
  useEffect(() => {
    if (gameDetected && !dismissed) {
      const timeout = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, 'true');
        } catch {
          // ignore
        }
        setDismissed(true);
      }, 8000);
      return () => clearTimeout(timeout);
    }
  }, [gameDetected, dismissed]);

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
    setDismissed(true);
  }, []);

  const handleReopen = useCallback(() => {
    setDismissed(false);
    setShowHelp(false);
    setExpanded(true);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Show just the help button if dismissed
  if (dismissed) {
    return (
      <div className="relative">
        <button
          onClick={handleReopen}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-3 py-2 rounded-full bg-card/80 backdrop-blur-sm border border-border/40 text-muted-foreground hover:text-foreground hover:border-border/60 transition-all shadow-lg"
          title="Reopen Setup Guide"
        >
          <HelpCircle className="w-4 h-4" />
          <span className="text-xs font-medium">Setup Guide</span>
        </button>
      </div>
    );
  }

  const activeStep = !isConnected ? 1 : !gameDetected ? 2 : 3;

  return (
    <Card className="relative border-primary/20 bg-card/80 backdrop-blur-sm overflow-hidden">
      {/* Subtle top accent */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary/30 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <Rocket className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold text-foreground text-left">
              Welcome to Atlas Racing
            </h2>
            <p className="text-xs text-muted-foreground text-left">
              {activeStep === 3
                ? 'All set! You\'re ready to race.'
                : `Step ${activeStep} of 3 — Let's get you connected.`}
            </p>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground h-8 px-2"
            title="Dismiss setup guide"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Collapsible body */}
      {expanded && (
        <div className="px-6 pb-6 space-y-4">
          {/* Step 1: Backend Connection */}
          <Step stepNumber={1} title="Start the Backend" done={isConnected} active={activeStep === 1}>
            {isConnected ? (
              <div className="flex items-center gap-2 text-emerald-300">
                <Wifi className="w-4 h-4" />
                <span>Backend connected at localhost:8080</span>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  Atlas Racing needs the telemetry backend running to receive live data from your game.
                </p>
                <div className="bg-black/40 rounded-lg p-3 font-mono text-xs space-y-1">
                  <div className="text-muted-foreground"># From the project root:</div>
                  <div className="text-amber-300">cd dashboard/backend</div>
                  <div className="text-amber-300">mkdir build && cd build</div>
                  <div className="text-amber-300">cmake .. && cmake --build . --config Release</div>
                  <div className="text-amber-300">./atlas_backend</div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Or if you downloaded the release, just run <code className="text-primary/80">atlas_backend.exe</code>
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    {isConnecting ? (
                      <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                    ) : (
                      <WifiOff className="w-4 h-4 text-rose-400" />
                    )}
                    <span className={`text-xs font-medium ${isConnecting ? 'text-amber-300' : 'text-rose-300'}`}>
                      {isConnecting ? 'Connecting...' : 'Not connected'}
                    </span>
                  </div>
                  {onRetryConnection && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRetryConnection}
                      className="h-7 text-xs gap-1.5"
                      disabled={isConnecting}
                    >
                      <RefreshCw className={`w-3 h-3 ${isConnecting ? 'animate-spin' : ''}`} />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Step>

          {/* Step 2: Game Setup */}
          <Step stepNumber={2} title="Connect Your Game" done={gameDetected} active={activeStep === 2}>
            {gameDetected ? (
              <div className="flex items-center gap-2 text-emerald-300">
                <Gamepad2 className="w-4 h-4" />
                <span>{connectedGameName} detected</span>
              </div>
            ) : (
              <div className="space-y-3">
                <p>
                  Start your game and enable telemetry output so Atlas Racing can read live data.
                </p>

                <div className="space-y-2">
                  <div className="rounded-lg border border-border/30 p-3 bg-black/20">
                    <div className="font-medium text-foreground text-xs mb-1">F1 24 / F1 25</div>
                    <p className="text-xs">
                      Settings &rarr; Telemetry &rarr; UDP Telemetry: <strong>On</strong>,
                      Port: <strong>20777</strong>, Format: <strong>2024</strong>
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/30 p-3 bg-black/20">
                    <div className="font-medium text-foreground text-xs mb-1">Assetto Corsa</div>
                    <p className="text-xs">
                      Telemetry is read via shared memory — just start a session and Atlas picks it up automatically.
                    </p>
                  </div>
                </div>

                {isConnected && (
                  <p className="text-xs text-muted-foreground">
                    Backend is running — start your game and enter a session to see data flow.
                  </p>
                )}
              </div>
            )}
          </Step>

          {/* Step 3: Ready */}
          <Step stepNumber={3} title="Choose a Dashboard" done={gameDetected} active={activeStep === 3}>
            {gameDetected ? (
              <p className="text-emerald-300">
                Everything is connected! Pick a dashboard below and start racing.
              </p>
            ) : (
              <p>
                Once your game is connected, choose from 5 dashboards below — each designed for
                different racing needs.
              </p>
            )}
          </Step>

          {/* Dismiss button */}
          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-xs text-muted-foreground">
              {gameDetected ? 'Got it, let\'s race!' : 'Skip for now'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
