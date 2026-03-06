import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { Smartphone, Monitor, Copy, Check } from 'lucide-react';

interface QRCodePanelProps {
  backendPort?: number;
}

export function QRCodePanel({ backendPort = 8080 }: QRCodePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dashboardURL, setDashboardURL] = useState('');
  const [copied, setCopied] = useState(false);
  const [lanIP, setLanIP] = useState<string | null>(null);

  useEffect(() => {
    const currentPort = window.location.port || '3000';
    const currentHost = window.location.hostname;

    const fallbackURL = currentHost === 'localhost' || currentHost === '127.0.0.1'
      ? `http://localhost:${currentPort}`
      : `${window.location.protocol}//${currentHost}:${currentPort}`;

    setDashboardURL(fallbackURL);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    fetch(`http://${currentHost}:${backendPort}/api/info`, { signal: controller.signal })
      .then((r) => r.json())
      .then((info) => {
        clearTimeout(timeout);
        if (info.ip && info.ip !== '127.0.0.1') {
          setLanIP(info.ip);
          setDashboardURL(`http://${info.ip}:${currentPort}`);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
      });

    return () => { controller.abort(); clearTimeout(timeout); };
  }, [backendPort]);

  useEffect(() => {
    if (!dashboardURL || !canvasRef.current) return;

    QRCode.toCanvas(canvasRef.current, dashboardURL, {
      width: 160,
      margin: 2,
      color: { dark: '#ffffffee', light: '#00000000' },
    }).catch(() => {});
  }, [dashboardURL]);

  const handleCopy = () => {
    navigator.clipboard.writeText(dashboardURL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-6">
      <div className="flex items-start gap-6">
        <div className="flex-shrink-0">
          <canvas ref={canvasRef} className="rounded-lg" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-medium text-foreground mb-2 flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Connect Another Device
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Scan this QR code with your phone or tablet to open the dashboard.
            Both devices must be on the same WiFi network.
          </p>

          <div className="flex items-center gap-2 mb-3">
            <code className="flex-1 px-3 py-2 rounded-md bg-secondary/50 text-sm text-foreground font-mono truncate">
              {dashboardURL}
            </code>
            <button
              onClick={handleCopy}
              className="p-2 rounded-md bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Copy URL"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          {lanIP ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Monitor className="w-3.5 h-3.5" />
              <span>LAN IP: {lanIP}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Start Atlas Core backend to detect your LAN IP for cross-device access.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
