import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Lock, Play, ChevronRight, Wrench } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface Game {
  id: string;
  name: string;
  status: 'available' | 'locked';
  image: string;
  description: string;
}

interface MainMenuProps {
  onGameSelect: (gameId: 'f1-24' | 'assetto-corsa') => void;
  onDevDashboard?: () => void;
}

export function MainMenu({ onGameSelect, onDevDashboard }: MainMenuProps) {
  const games: Game[] = [
    {
      id: 'f1-24',
      name: 'F1 24',
      status: 'available',
      image: 'https://images.unsplash.com/photo-1721490645563-8e87725bbfa4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmb3JtdWxhJTIwMSUyMHJhY2luZyUyMGNhcnxlbnwxfHx8fDE3NTUzMDc3NjB8MA&ixlib=rb-4.1.0&q=80&w=1080',
      description: 'The official Formula 1 racing simulation'
    },
    {
      id: 'assetto-corsa',
      name: 'Assetto Corsa',
      status: 'available',
      image: 'https://images.unsplash.com/photo-1752070200874-05c187a46b39?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhc3NldHRvJTIwY29yc2ElMjByYWNpbmd8ZW58MXx8fHwxNzU1MzA3NzYzfDA&ixlib=rb-4.1.0&q=80&w=1080',
      description: 'The ultimate racing simulator'
    },
    {
      id: 'f1-25',
      name: 'F1 25',
      status: 'locked',
      image: 'https://images.unsplash.com/photo-1664530550244-d616a32ed041?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyYWNpbmclMjBzaW11bGF0b3IlMjBjb2NrcGl0fGVufDF8fHx8MTc1NTMwNzc2N3ww&ixlib=rb-4.1.0&q=80&w=1080',
      description: 'Coming Soon'
    },
    {
      id: 'acc',
      name: 'Assetto Corsa Competizione',
      status: 'locked',
      image: 'https://images.unsplash.com/photo-1664689474020-4252c0ad13b9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxndDMlMjByYWNpbmclMjBjYXJ8ZW58MXx8fHwxNzU1MzA3Nzc4fDA&ixlib=rb-4.1.0&q=80&w=1080',
      description: 'Coming Soon'
    },
    {
      id: 'truck-sim',
      name: 'Truck Simulator',
      status: 'locked',
      image: 'https://images.unsplash.com/photo-1743649978995-c76212449e15?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNldCUyMHJhY2luZyUyMHNpbXVsYXRvcnxlbnwxfHx8fDE3NTUzMDc3NzV8MA&ixlib=rb-4.1.0&q=80&w=1080',
      description: 'Coming Soon'
    },
    {
      id: 'le-mans',
      name: 'Le Mans Ultimate',
      status: 'locked',
      image: 'https://images.unsplash.com/photo-1676128126490-1b0b3c582e5e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNsZSUyMG1hbnMlMjByYWNpbmclMjBjYXJzfGVufDF8fHx8MTc1NTMwNzc3MXww&ixlib=rb-4.1.0&q=80&w=1080',
      description: 'Coming Soon'
    }
  ];

  const handleCardClick = (game: Game) => {
    if (game.status === 'available') {
      onGameSelect(game.id as 'f1-24' | 'assetto-corsa');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-background/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col items-center text-center max-w-2xl mx-auto relative">
            <h1 className="text-4xl tracking-[0.2em] text-foreground mb-3">
              ATLAS RACING
            </h1>
            <div className="w-16 h-px bg-primary/60 mb-4"></div>
            <p className="text-muted-foreground">
              Professional telemetry dashboard for racing simulators
            </p>

            {/* Dev Dashboard Button - positioned in top right */}
            {onDevDashboard && (
              <Button
                onClick={onDevDashboard}
                className="absolute right-0 top-1/2 -translate-y-1/2 bg-amber-600 hover:bg-amber-700 text-white shadow-md"
                size="sm"
              >
                <Wrench className="w-4 h-4 mr-2" />
                Dev Dashboard
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Available Games */}
          <div className="mb-16">
            <div className="flex items-center gap-3 mb-8">
              <h2 className="text-xl text-foreground">Available Platforms</h2>
              <div className="flex-1 h-px bg-border"></div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {games.filter(game => game.status === 'available').map((game) => (
                <Card
                  key={game.id}
                  className="group border-border/50 hover:border-border transition-all duration-300 cursor-pointer hover:shadow-lg overflow-hidden"
                  onClick={() => handleCardClick(game)}
                >
                  <CardContent className="p-0">
                    <div className="relative">
                      <ImageWithFallback
                        src={game.image}
                        alt={game.name}
                        className="w-full h-48 object-cover group-hover:scale-[1.02] transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-80"></div>
                      
                      {/* Status Badge */}
                      <div className="absolute top-4 right-4">
                        <Badge className="bg-green-500/90 text-white border-0 shadow-sm">
                          <Play className="w-3 h-3 mr-1" />
                          Available
                        </Badge>
                      </div>

                      {/* Content Overlay */}
                      <div className="absolute bottom-0 left-0 right-0 p-6">
                        <div className="flex items-end justify-between">
                          <div>
                            <h3 className="text-xl text-white mb-1 tracking-wide">
                              {game.name}
                            </h3>
                            <p className="text-gray-200 text-sm opacity-90">
                              {game.description}
                            </p>
                          </div>
                          <div className="text-white/80 group-hover:text-white group-hover:translate-x-1 transition-all duration-200">
                            <ChevronRight className="w-5 h-5" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Coming Soon */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <h2 className="text-xl text-foreground">Coming Soon</h2>
              <div className="flex-1 h-px bg-border"></div>
            </div>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {games.filter(game => game.status === 'locked').map((game) => (
                <Card
                  key={game.id}
                  className="border-border/30 opacity-75 hover:opacity-90 transition-opacity overflow-hidden"
                >
                  <CardContent className="p-0">
                    <div className="relative">
                      <ImageWithFallback
                        src={game.image}
                        alt={game.name}
                        className="w-full h-32 object-cover grayscale"
                      />
                      <div className="absolute inset-0 bg-black/40"></div>
                      
                      {/* Lock Badge */}
                      <div className="absolute top-3 right-3">
                        <Badge variant="secondary" className="bg-muted/90 text-muted-foreground border-0 text-xs">
                          <Lock className="w-3 h-3 mr-1" />
                          Locked
                        </Badge>
                      </div>

                      {/* Content Overlay */}
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <h3 className="text-sm text-white mb-1">
                          {game.name}
                        </h3>
                        <p className="text-xs text-gray-300">
                          {game.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Footer Info */}
          <div className="mt-16 text-center">
            <p className="text-sm text-muted-foreground">
              Select an available platform to access telemetry dashboards
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}