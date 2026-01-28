import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Wifi, WifiOff, Settings, CheckCircle, XCircle } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface GameDetailsProps {
  gameId: 'f1-24' | 'assetto-corsa';
  onConnect: () => void;
}

interface GameInfo {
  name: string;
  description: string;
  image: string;
  instructions: string[];
  port: string;
  requirements: string[];
}

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed';

export function GameDetails({ gameId, onConnect }: GameDetailsProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [progress, setProgress] = useState(0);

  const gameInfo: Record<string, GameInfo> = {
    'f1-24': {
      name: 'F1 24',
      description: 'Experience the pinnacle of motorsport with the official Formula 1 racing simulation. Access real-time telemetry data including speed, RPM, tire temperatures, and comprehensive race analytics.',
      image: 'https://images.unsplash.com/photo-1721490645563-8e87725bbfa4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmb3JtdWxhJTIwMSUyMHJhY2luZyUyMGNhcnxlbnwxfHx8fDE3NTUzMDc3NjB8MA&ixlib=rb-4.1.0&q=80&w=1080',
      instructions: [
        'Launch F1 24 and go to Game Options',
        'Navigate to Settings > Telemetry Settings',
        'Enable "UDP Telemetry Output"',
        'Set IP Address to your computer\'s IP',
        'Set Port to 20777',
        'Set Send Rate to 60Hz',
        'Start a race or practice session'
      ],
      port: '20777',
      requirements: [
        'F1 24 installed and running',
        'UDP Telemetry enabled in game settings',
        'Network connection to the game'
      ]
    },
    'assetto-corsa': {
      name: 'Assetto Corsa',
      description: 'Connect to the ultimate racing simulator for professional-grade telemetry analysis. Monitor detailed car dynamics, tire performance, and track conditions in real-time.',
      image: 'https://images.unsplash.com/photo-1752070200874-05c187a46b39?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhc3NldHRvJTIwY29yc2ElMjByYWNpbmd8ZW58MXx8fHwxNzU1MzA3NzYzfDA&ixlib=rb-4.1.0&q=80&w=1080',
      instructions: [
        'Launch Assetto Corsa',
        'Install and activate Content Manager (recommended)',
        'Go to Settings > Assetto Corsa > Gameplay',
        'Enable "Shared Memory"',
        'Set refresh rate to 100Hz',
        'Start driving session',
        'Telemetry will be available during driving'
      ],
      port: 'Shared Memory',
      requirements: [
        'Assetto Corsa installed and running',
        'Shared Memory interface enabled',
        'Content Manager (recommended)'
      ]
    }
  };

  const currentGame = gameInfo[gameId];

  const handleConnect = () => {
    setConnectionStatus('connecting');
    setProgress(0);

    // Simulate connection progress
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          // Simulate success/failure (90% success rate)
          const success = Math.random() > 0.1;
          setConnectionStatus(success ? 'connected' : 'failed');
          
          if (success) {
            setTimeout(() => {
              onConnect();
            }, 1500);
          }
          return 100;
        }
        return prev + Math.random() * 15 + 5;
      });
    }, 200);
  };

  const getConnectionButton = () => {
    switch (connectionStatus) {
      case 'idle':
        return (
          <Button onClick={handleConnect} className="w-full" size="lg">
            <Wifi className="w-4 h-4 mr-2" />
            Connect to {currentGame.name}
          </Button>
        );
      case 'connecting':
        return (
          <Button disabled className="w-full" size="lg">
            <div className="animate-spin w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full" />
            Connecting...
          </Button>
        );
      case 'connected':
        return (
          <Button className="w-full bg-green-600 hover:bg-green-700" size="lg">
            <CheckCircle className="w-4 h-4 mr-2" />
            Connected Successfully
          </Button>
        );
      case 'failed':
        return (
          <Button 
            onClick={handleConnect} 
            variant="destructive" 
            className="w-full" 
            size="lg"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Connection Failed - Retry
          </Button>
        );
    }
  };

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'connecting':
        return (
          <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse mr-2" />
            Connecting
          </Badge>
        );
      case 'connected':
        return (
          <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2" />
            Connected
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-2" />
            Connection Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <WifiOff className="w-3 h-3 mr-2" />
            Not Connected
          </Badge>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-background/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-6">
          <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-3">
              <h1 className="text-2xl tracking-wide text-foreground">
                {currentGame.name}
              </h1>
              {getStatusBadge()}
            </div>
            <p className="text-sm text-muted-foreground">
              Configure connection settings and establish telemetry link
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Game Information */}
            <Card className="border-border/50">
              <CardContent className="p-0">
                <div className="relative">
                  <ImageWithFallback
                    src={currentGame.image}
                    alt={currentGame.name}
                    className="w-full h-64 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                  <div className="absolute bottom-6 left-6 right-6">
                    <h3 className="text-xl text-white mb-2">About {currentGame.name}</h3>
                  </div>
                </div>
                <div className="p-6">
                  <p className="text-muted-foreground leading-relaxed">
                    {currentGame.description}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Connection Panel */}
            <div className="space-y-6">
              {/* Connection Status */}
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Connection
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {connectionStatus === 'connecting' && (
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span>Connecting to {currentGame.name}</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}
                  
                  {getConnectionButton()}

                  {connectionStatus === 'connected' && (
                    <div className="text-center text-green-600 dark:text-green-400 text-sm bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                      Connection established successfully!
                      <br />
                      Redirecting to dashboards...
                    </div>
                  )}

                  {connectionStatus === 'failed' && (
                    <div className="text-center text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-950 p-3 rounded-lg">
                      Failed to connect. Check game settings and try again.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Requirements */}
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>System Requirements</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {currentGame.requirements.map((req, index) => (
                      <li key={index} className="flex items-start gap-3 text-sm">
                        <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0" />
                        <span className="text-muted-foreground">{req}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                    <p className="text-sm">
                      <span className="text-foreground">Connection Port:</span>{' '}
                      <code className="text-primary bg-muted px-2 py-1 rounded text-xs">
                        {currentGame.port}
                      </code>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Setup Instructions */}
          <Card className="border-border/50 mt-8">
            <CardHeader>
              <CardTitle>Setup Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {currentGame.instructions.map((instruction, index) => (
                  <li key={index} className="flex gap-4">
                    <div className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm">
                      {index + 1}
                    </div>
                    <span className="text-muted-foreground pt-0.5">{instruction}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}