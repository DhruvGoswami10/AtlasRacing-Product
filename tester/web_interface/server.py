#!/usr/bin/env python3
"""
Atlas Racing Testing Suite - Web Server
Provides HTTP API bridge between web interface and C++ recorder/replayer tools
"""

import os
import json
import subprocess
import threading
import time
import re
from datetime import datetime
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from socketserver import ThreadingMixIn
import mimetypes
from typing import Optional

TESTER_ROOT = Path(__file__).resolve().parent.parent
BUILD_BIN_DIR = TESTER_ROOT / "build" / "bin"
SCENARIOS_DIR = TESTER_ROOT / "scenarios"
UPLOADED_DIR = SCENARIOS_DIR / "uploaded"
RECORDINGS_DIR = TESTER_ROOT / "recordings"

# Map game id to expected executable name and file extension
# Only F1 25 is supported for research data collection
import platform

_EXE = ".exe" if platform.system() == "Windows" else ""

GAME_CONFIG = {
    "f124": {
        "recorder": f"packet_recorder{_EXE}",
        "replayer": f"packet_replayer{_EXE}",
        "extension": ".f124",
        "transport": "udp"
    },
    "f125": {
        "recorder": f"packet_recorder_f125{_EXE}",
        "replayer": f"packet_replayer_f125{_EXE}",
        "extension": ".f125",
        "transport": "udp"
    },
}


def ensure_directory(path: Path):
    """Create directory (and parents) if it does not exist."""
    path.mkdir(parents=True, exist_ok=True)


def sanitize_filename(name: str) -> str:
    """Remove characters that are not safe for filenames on Windows."""
    sanitized = re.sub(r'[^A-Za-z0-9_\-\.]', '_', name)
    return sanitized.strip() or "session"


def is_within_directory(path: Path, directory: Path) -> bool:
    """Check if path is inside directory."""
    try:
        path.resolve().relative_to(directory.resolve())
        return True
    except ValueError:
        return False


def is_allowed_session_path(path: Path) -> bool:
    """Ensure session files stay within known directories."""
    resolved = path.resolve()
    allowed_roots = [
        SCENARIOS_DIR.resolve(),
        (SCENARIOS_DIR / "uploaded").resolve(),
        RECORDINGS_DIR.resolve()
    ]
    return any(is_within_directory(resolved, root) for root in allowed_roots)


def build_recording_filename(game_id: str, base_name: Optional[str] = None) -> Path:
    """Construct a unique filename for the target game."""
    config = GAME_CONFIG.get(game_id)
    if not config:
        raise ValueError(f"Unsupported game id: {game_id}")

    extension = config["extension"]
    ensure_directory(RECORDINGS_DIR)

    if base_name:
        base_name = sanitize_filename(base_name)
        filename = f"{base_name}{extension}"
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{game_id}_{timestamp}{extension}"

    return RECORDINGS_DIR / filename


def recorder_available(game_id: str) -> bool:
    config = GAME_CONFIG.get(game_id)
    if not config:
        return False
    executable = BUILD_BIN_DIR / config["recorder"]
    return executable.exists()


def replayer_available(game_id: str) -> bool:
    config = GAME_CONFIG.get(game_id)
    if not config:
        return False
    executable = BUILD_BIN_DIR / config["replayer"]
    return executable.exists()


def resolve_control_file_path(raw_path: str) -> Path:
    """Convert control file path into absolute path anchored at tester root."""
    path = Path(raw_path.strip())
    if not path.is_absolute():
        path = (TESTER_ROOT / path).resolve()
    return path


def build_recorder_command(game_id: str, output_path: Path, session_name: Optional[str] = None,
                           extra_args: Optional[list[str]] = None) -> list[str]:
    config = GAME_CONFIG.get(game_id)
    if not config:
        raise ValueError(f"Unsupported game id: {game_id}")

    cmd: list[str] = [str(BUILD_BIN_DIR / config["recorder"]), "-f", str(output_path)]
    if session_name:
        cmd.extend(["-n", session_name])

    if extra_args:
        cmd.extend(extra_args)
    return cmd


def build_replayer_command(game_id: str, session_file: Path, speed: float, target_ip: str, target_port: int,
                           start_offset: float = 0.0, loop: bool = False,
                           extra_args: Optional[list[str]] = None) -> list[str]:
    config = GAME_CONFIG.get(game_id)
    if not config:
        raise ValueError(f"Unsupported game id: {game_id}")

    transport = config.get("transport", "udp")

    cmd: list[str] = [
        str(BUILD_BIN_DIR / config["replayer"]),
        "-f", str(session_file),
        "-s", str(speed)
    ]

    if start_offset > 0:
        cmd.extend(["-o", str(start_offset)])
    if loop:
        cmd.append("-l")

    if transport == "udp":
        if target_ip:
            cmd.extend(["-i", target_ip])
        if target_port:
            cmd.extend(["-p", str(target_port)])

    if extra_args:
        cmd.extend(extra_args)

    return cmd

class TestingSuiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=".", **kwargs)
        
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_POST(self):
        """Handle API requests"""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/replay/start':
            self.handle_replay_start()
        elif parsed_path.path == '/api/replay/stop':
            self.handle_replay_stop()
        elif parsed_path.path == '/api/replay/pause':
            self.handle_replay_pause()
        elif parsed_path.path == '/api/replay/resume':
            self.handle_replay_resume()
        elif parsed_path.path == '/api/record/start':
            self.handle_record_start()
        elif parsed_path.path == '/api/record/stop':
            self.handle_record_stop()
        elif parsed_path.path == '/api/session/upload':
            self.handle_session_upload()
        elif parsed_path.path == '/api/session/delete':
            self.handle_session_delete()
        elif parsed_path.path == '/api/session/rename':
            self.handle_session_rename()
        else:
            self.send_error(404, "API endpoint not found")
    
    def do_GET(self):
        """Handle file requests and API calls"""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path.startswith('/api/'):
            if parsed_path.path == '/api/status':
                self.handle_status_request()
            elif parsed_path.path == '/api/sessions':
                self.handle_sessions_list()
            elif parsed_path.path == '/api/record/status':
                self.handle_record_status()
            elif parsed_path.path == '/api/session/download':
                self.handle_session_download()
            else:
                self.send_error(404, "API endpoint not found")
        else:
            # Serve static files
            super().do_GET()
    
    def _send_replayer_command(self, command: str):
        """Send a control command to the active replayer process."""
        global replayer_process, replayer_control_path

        if not replayer_process or replayer_process.poll() is not None:
            return False, 'No active replay process'

        if not replayer_control_path:
            fallback = resolve_control_file_path(f"replay_control_{replayer_process.pid}.tmp")
            replayer_control_path = fallback
            print(f"[SERVER] Derived control file path: {replayer_control_path}")

        try:
            with replayer_control_path.open('w', encoding='utf-8') as control_file:
                control_file.write(command)
            return True, str(replayer_control_path)
        except Exception as exc:
            return False, f'Failed to write control command: {exc}'


    def handle_replay_start(self):
        """Start packet replay"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            payload = self.rfile.read(content_length) if content_length else b'{}'
            data = json.loads(payload.decode('utf-8'))

            session_file = data.get('session_file')
            game_id = data.get('game', 'f125')
            speed = float(data.get('speed', 1.0) or 1.0)
            loop = bool(data.get('loop', False))
            start_offset = float(data.get('start_offset', 0.0) or 0.0)
            target_ip = data.get('target_ip', '127.0.0.1')
            target_port = int(data.get('target_port', 20777) or 20777)

            if not session_file or not os.path.exists(session_file):
                self.send_error(400, "Session file not found")
                return

            session_path = Path(session_file).resolve()

            if not replayer_available(game_id):
                self.send_json_response({
                    'status': 'error',
                    'message': f"Replay binary for '{game_id}' not found. Please build the tools."
                })
                return

            cmd = build_replayer_command(
                game_id,
                session_path,
                speed,
                target_ip,
                target_port,
                start_offset=start_offset,
                loop=loop
            )

            global replayer_process, replayer_control_path, current_replay_game
            if replayer_process and replayer_process.poll() is None:
                replayer_process.terminate()
                replayer_process.wait(timeout=5)

            print(f"[SERVER] Starting replayer ({game_id}): {' '.join(cmd)}")
            replayer_control_path = None
            current_replay_game = game_id
            replayer_process = subprocess.Popen(
                cmd,
                cwd=str(TESTER_ROOT),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True
            )

            def monitor_replayer():
                global replayer_control_path
                try:
                    for line in iter(replayer_process.stdout.readline, ''):
                        clean = line.strip()
                        if not clean:
                            continue
                        print(f"[REPLAYER] {clean}")
                        if "Control:" in clean:
                            control_part = clean.split("Control:", 1)[1].strip()
                            replayer_control_path = resolve_control_file_path(control_part)
                            print(f"[SERVER] Captured control file: {replayer_control_path}")
                except Exception as exc:
                    print(f"[SERVER] Replayer monitor error: {exc}")

            threading.Thread(target=monitor_replayer, daemon=True).start()

            self.send_json_response({
                'status': 'success',
                'message': 'Replay started',
                'pid': replayer_process.pid,
                'game': game_id
            })

        except Exception as exc:
            self.send_error(500, f"Failed to start replay: {exc}")
    def handle_replay_stop(self):
        """Stop packet replay"""
        try:
            global replayer_process, replayer_control_path, current_replay_game
            if replayer_process and replayer_process.poll() is None:
                replayer_process.terminate()
                replayer_process.wait(timeout=5)

            replayer_process = None
            replayer_control_path = None
            current_replay_game = None

            self.send_json_response({
                'status': 'success',
                'message': 'Replay stopped'
            })

        except Exception as exc:
            self.send_error(500, f"Failed to stop replay: {exc}")
    def handle_replay_pause(self):
        """Pause packet replay"""
        success, info = self._send_replayer_command('pause')
        if success:
            self.send_json_response({
                'status': 'success',
                'message': f"Pause command sent to {info}",
                'control_file': info
            })
        else:
            self.send_json_response({
                'status': 'error',
                'message': info
            })

    def handle_replay_resume(self):
        """Resume paused packet replay"""
        success, info = self._send_replayer_command('resume')
        if success:
            self.send_json_response({
                'status': 'success',
                'message': f"Resume command sent to {info}",
                'control_file': info
            })
        else:
            self.send_json_response({
                'status': 'error',
                'message': info
            })

    def handle_record_start(self):
        """Start packet recording through the web interface."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            payload = self.rfile.read(content_length) if content_length else b'{}'
            data = json.loads(payload.decode('utf-8'))

            game_id = data.get('game', 'f125')
            session_name = data.get('session_name')
            custom_filename = data.get('filename')
            port_value = data.get('port')
            sample_rate_value = data.get('sample_rate')

            global recorder_process, recorder_monitor_thread, recorder_status
            with recorder_lock:
                if recorder_process and recorder_process.poll() is None:
                    self.send_json_response({
                        'status': 'error',
                        'message': 'Recorder is already running',
                        'filepath': recorder_status.get('filepath')
                    })
                    return

                if not recorder_available(game_id):
                    self.send_json_response({
                        'status': 'error',
                        'message': f"Recorder binary for '{game_id}' not available. Please build the tools."
                    })
                    return

                config = GAME_CONFIG.get(game_id, {})
                transport = config.get('transport', 'udp')

                try:
                    port = int(port_value) if (transport == 'udp' and port_value not in (None, '')) else None
                except ValueError as exc:
                    self.send_error(400, f"Invalid port value: {exc}")
                    return

                try:
                    if transport == 'udp':
                        sample_rate = None
                    else:
                        if sample_rate_value in (None, ''):
                            sample_rate = 60
                        else:
                            sample_rate = int(sample_rate_value)
                except ValueError as exc:
                    self.send_error(400, f"Invalid sample_rate value: {exc}")
                    return

                output_path = build_recording_filename(game_id, custom_filename)
                extra_args = []
                if transport == 'udp' and port is not None:
                    extra_args.extend(['-p', str(port)])
                if transport != 'udp' and sample_rate is not None:
                    extra_args.extend(['-r', str(sample_rate)])

                cmd = build_recorder_command(game_id, output_path, session_name, extra_args)
                print(f"[SERVER] Starting recorder ({game_id}): {' '.join(cmd)}")

                recorder_process = subprocess.Popen(
                    cmd,
                    cwd=str(TESTER_ROOT),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True
                )

                recorder_status.update({
                    'running': True,
                    'game': game_id,
                    'session_name': session_name,
                    'filename': output_path.name,
                    'filepath': str(output_path),
                    'start_time': time.time(),
                    'packets': 0,
                    'duration_ms': 0,
                    'port': port if transport == 'udp' else None,
                    'sample_rate': sample_rate if transport != 'udp' else None,
                    'last_message': 'Recorder started',
                    'exit_code': None
                })

            def monitor_recorder():
                global recorder_process
                try:
                    for line in iter(recorder_process.stdout.readline, ''):
                        clean = line.strip()
                        if not clean:
                            continue
                        print(f"[RECORDER] {clean}")

                        stats_match = re.search(r'(Packets|Frames):\s*(\d+).*Duration:\s*([0-9\.]+)s', clean)
                        with recorder_lock:
                            recorder_status['last_message'] = clean
                            if stats_match:
                                recorder_status['packets'] = int(stats_match.group(2))
                                duration_seconds = float(stats_match.group(3))
                                recorder_status['duration_ms'] = int(duration_seconds * 1000)
                except Exception as exc:
                    print(f"[SERVER] Recorder monitor error: {exc}")
                finally:
                    exit_code = None
                    proc = recorder_process
                    if proc:
                        try:
                            exit_code = proc.wait(timeout=5)
                        except Exception:
                            exit_code = proc.poll()
                    with recorder_lock:
                        recorder_status['running'] = False
                        recorder_status['exit_code'] = exit_code
                        recorder_process = None

            recorder_monitor_thread = threading.Thread(target=monitor_recorder, daemon=True)
            recorder_monitor_thread.start()

            self.send_json_response({
                'status': 'success',
                'message': 'Recording started',
                'game': game_id,
                'filepath': str(output_path),
                'sample_rate': sample_rate if transport != 'udp' else None
            })

        except Exception as exc:
            self.send_error(500, f"Failed to start recording: {exc}")

    def handle_record_stop(self):
        """Stop the active recorder process."""
        try:
            global recorder_process, recorder_monitor_thread
            with recorder_lock:
                proc = recorder_process

            if proc and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)

            with recorder_lock:
                recorder_process = None
                recorder_monitor_thread = None
                recorder_status['running'] = False

            self.send_json_response({
                'status': 'success',
                'message': 'Recording stopped',
                'filepath': recorder_status.get('filepath')
            })

        except Exception as exc:
            self.send_error(500, f"Failed to stop recording: {exc}")

    def handle_record_status(self):
        """Return current recorder status."""
        with recorder_lock:
            snapshot = dict(recorder_status)

        snapshot['available_games'] = {game: recorder_available(game) for game in GAME_CONFIG}

        self.send_json_response(snapshot)


    def handle_session_upload(self):
        """Handle F124 file upload"""
        try:
            content_length = int(self.headers['Content-Length'])
            
            # Parse multipart form data
            content_type = self.headers.get('Content-Type', '')
            if not content_type.startswith('multipart/form-data'):
                self.send_error(400, "Expected multipart/form-data")
                return
            
            # Extract boundary
            boundary = content_type.split('boundary=')[1]
            boundary_bytes = ('--' + boundary).encode()
            
            # Read the full POST data
            post_data = self.rfile.read(content_length)
            
            # Simple multipart parser - find file data between boundaries
            parts = post_data.split(boundary_bytes)
            file_data = None
            filename = None
            
            for part in parts:
                if b'filename=' in part:
                    # Extract filename from Content-Disposition header
                    lines = part.split(b'\r\n')
                    for line in lines:
                        if b'filename=' in line:
                            filename_match = line.decode().split('filename=')[1].strip('"')
                            if filename_match:
                                filename = filename_match
                    
                    # Find the start of binary data (after \r\n\r\n)
                    data_start = part.find(b'\r\n\r\n')
                    if data_start != -1:
                        file_data = part[data_start + 4:]
                        # Remove trailing boundary marker
                        if file_data.endswith(b'\r\n'):
                            file_data = file_data[:-2]
                        break
            
            if not file_data or not filename:
                self.send_error(400, "No file data found in upload")
                return
            
            # Save uploaded file
            upload_dir = '../scenarios/uploaded'
            os.makedirs(upload_dir, exist_ok=True)
            
            # Use original filename with timestamp prefix to avoid conflicts
            safe_filename = f"uploaded_{int(time.time())}_{filename}"
            filepath = os.path.abspath(os.path.join(upload_dir, safe_filename))
            
            with open(filepath, 'wb') as f:
                f.write(file_data)
            
            self.send_json_response({
                'status': 'success',
                'message': 'Session uploaded successfully',
                'filename': safe_filename,
                'filepath': filepath,
                'size': len(file_data)
            })
            
        except Exception as e:
            self.send_error(500, f"Failed to upload session: {str(e)}")
    
    def handle_session_delete(self):
        """Delete a session file"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            filepath = data.get('filepath')
            if not filepath or not os.path.exists(filepath):
                self.send_error(400, "File not found")
                return
            
            abs_path = Path(filepath).resolve()
            if not is_allowed_session_path(abs_path):
                self.send_error(403, "Access denied")
                return
            
            os.remove(abs_path)
            filename = abs_path.name
            
            self.send_json_response({
                'status': 'success',
                'message': f'Session {filename} deleted successfully'
            })
            
        except Exception as e:
            self.send_error(500, f"Failed to delete session: {str(e)}")

    def handle_session_rename(self):
        """Rename a session file"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            payload = self.rfile.read(content_length) if content_length else b'{}'
            data = json.loads(payload.decode('utf-8'))

            filepath = data.get('filepath')
            new_name = data.get('new_name')

            if not filepath or not new_name:
                self.send_error(400, "filepath and new_name are required")
                return

            source_path = Path(filepath).resolve()
            if not source_path.exists():
                self.send_error(404, "Original file not found")
                return

            if not is_allowed_session_path(source_path):
                self.send_error(403, "Access denied")
                return

            sanitized_name = sanitize_filename(new_name)
            if not sanitized_name:
                self.send_error(400, "Invalid target name")
                return

            destination_path = source_path.with_name(f"{sanitized_name}{source_path.suffix}")
            if destination_path.exists():
                self.send_error(409, "A session with that name already exists")
                return

            source_path.rename(destination_path)

            self.send_json_response({
                'status': 'success',
                'message': 'Session renamed successfully',
                'filepath': str(destination_path),
                'filename': destination_path.name
            })

        except Exception as exc:
            self.send_error(500, f"Failed to rename session: {exc}")
    
    def handle_session_download(self):
        """Stream a session file to the client for download."""
        try:
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            filepath = params.get('filepath', [None])[0]

            if not filepath:
                self.send_error(400, "filepath query parameter required")
                return

            abs_path = Path(filepath).resolve()
            if not abs_path.exists() or not abs_path.is_file():
                self.send_error(404, "File not found")
                return

            if not is_allowed_session_path(abs_path):
                self.send_error(403, "Access denied")
                return

            file_size = abs_path.stat().st_size
            content_type = 'application/octet-stream'

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Disposition', f'attachment; filename="{abs_path.name}"')
            self.send_header('Content-Length', str(file_size))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            with open(abs_path, 'rb') as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)

        except Exception as exc:
            self.send_error(500, f"Failed to download session: {exc}")

    def handle_status_request(self):
        """Get system status"""
        global replayer_process, replayer_control_path, current_replay_game

        replayer_running = replayer_process and replayer_process.poll() is None
        dashboard_running = self.check_dashboard_connection()
        control_file = str(replayer_control_path) if replayer_control_path else None
        control_exists = bool(replayer_control_path and replayer_control_path.exists())

        with recorder_lock:
            recorder_snapshot = dict(recorder_status)

        recorder_snapshot['available_games'] = {game: recorder_available(game) for game in GAME_CONFIG}

        self.send_json_response({
            'replayer': {
                'running': replayer_running,
                'pid': replayer_process.pid if replayer_running else None,
                'control_file': control_file,
                'control_file_exists': control_exists,
                'game': current_replay_game
            },
            'dashboard': {
                'running': dashboard_running,
                'url': 'http://localhost:3000'
            },
            'recorder': recorder_snapshot
        })

    def handle_sessions_list(self):
        """List available session files"""
        try:
            sessions = []
            search_dirs = [SCENARIOS_DIR, UPLOADED_DIR, RECORDINGS_DIR]
            extensions = {cfg['extension'] for cfg in GAME_CONFIG.values()}

            for directory in search_dirs:
                if not directory.exists():
                    continue

                for entry in directory.iterdir():
                    if not entry.is_file():
                        continue
                    if entry.suffix.lower() not in extensions:
                        continue

                    stat_result = entry.stat()
                    game_id = None
                    for gid, cfg in GAME_CONFIG.items():
                        if cfg['extension'] == entry.suffix.lower():
                            game_id = gid
                            break

                    sessions.append({
                        'filename': entry.name,
                        'filepath': str(entry.resolve()),
                        'size': stat_result.st_size,
                        'modified': stat_result.st_mtime,
                        'game': game_id
                    })

            self.send_json_response({
                'sessions': sessions
            })

        except Exception as exc:
            self.send_error(500, f"Failed to list sessions: {exc}")

    def check_dashboard_connection(self):
        """Check if Atlas Racing dashboard is running"""
        try:
            import urllib.request
            urllib.request.urlopen('http://localhost:3000', timeout=1)
            return True
        except:
            return False
    
    def send_json_response(self, data):
        """Send JSON response with CORS headers"""
        response = json.dumps(data).encode('utf-8')
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(response)))
        self.end_headers()
        self.wfile.write(response)
    
    def log_message(self, format, *args):
        """Custom log format"""
        print(f"[{time.strftime('%H:%M:%S')}] {format % args}")

class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    """Thread per request HTTP server"""
    daemon_threads = True

# Global process tracker
replayer_process = None
replayer_control_path = None
current_replay_game = None

recorder_process = None
recorder_monitor_thread = None
recorder_lock = threading.Lock()
recorder_status = {
    "running": False,
    "game": None,
    "session_name": None,
    "filename": None,
    "filepath": None,
    "start_time": None,
    "packets": 0,
    "duration_ms": 0,
    "port": None,
    "last_message": None,
    "exit_code": None
}

def main():
    print("Atlas Racing Testing Suite - Web Server")
    print("=======================================")
    print()
    
    if not BUILD_BIN_DIR.exists():
        print(f"[ERROR] Build directory not found at {BUILD_BIN_DIR}")
        print("Please build the tester tools first:")
        print("  cd tester && mkdir build && cd build && cmake .. && make")
        return 1
    
    # Start HTTP server
    port = 8081
    server = ThreadingHTTPServer(('localhost', port), TestingSuiteHandler)
    
    print(f"[OK] Server starting on http://localhost:{port}")
    print("[INFO] Serving files from: web_interface/")
    print("[INFO] API endpoints available at: /api/*")
    print()
    print("Open your browser to: http://localhost:8081")
    print("Press Ctrl+C to stop the server")
    print()
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[WARN] Shutting down server...")

        # Clean up any running processes
        global replayer_process, recorder_process
        if replayer_process and replayer_process.poll() is None:
            print("[WARN] Stopping replayer process...")
            replayer_process.terminate()
        if recorder_process and recorder_process.poll() is None:
            print("[WARN] Stopping recorder process...")
            recorder_process.terminate()

        server.shutdown()
        print("[OK] Server stopped")
        return 0

if __name__ == '__main__':
    exit(main())
