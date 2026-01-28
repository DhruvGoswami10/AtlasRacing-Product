import os
import sys
import time
import traceback
import platform

APP_DIR = os.path.dirname(__file__)
if APP_DIR not in sys.path:
    sys.path.append(APP_DIR)

ARCH_BITS = platform.architecture()[0]
EXTRA_STDLIB = os.path.abspath(os.path.join(APP_DIR, "stdlib64" if ARCH_BITS == "64bit" else "stdlib"))
_EXTRA_STDLIB_STATUS = "missing"
if os.path.isdir(EXTRA_STDLIB):
    if EXTRA_STDLIB not in sys.path:
        sys.path.insert(0, EXTRA_STDLIB)
    os.environ["PATH"] = EXTRA_STDLIB + os.pathsep + os.environ.get("PATH", "")
    _EXTRA_STDLIB_STATUS = EXTRA_STDLIB
    try:
        _EXTRA_STDLIB_STATUS += " files=" + ",".join(sorted(os.listdir(EXTRA_STDLIB)))
    except Exception:
        pass


_LOG_PATHS = (
    os.path.join(os.path.expanduser("~"), "Documents", "Assetto Corsa", "logs", "atlaslink_debug.log"),
    os.path.join(APP_DIR, "atlaslink_debug.log"),
)


def _log(message):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    line = "[%s] %s\n" % (timestamp, message)
    for path in _LOG_PATHS:
        try:
            with open(path, "a") as handle:
                handle.write(line)
            break
        except Exception:
            continue

_log("AtlasLink bootstrap using arch=%s extra_stdlib=%s" % (ARCH_BITS, _EXTRA_STDLIB_STATUS))


try:
    import ac  # type: ignore
except Exception as exc:  # pragma: no cover - only hits outside AC runtime
    _log("Failed to import ac module: %s" % exc)
    raise

try:
    import app  # type: ignore
    _log("AtlasLink app module imported successfully")
except Exception:
    _log("Exception importing app module:\n%s" % traceback.format_exc())
    _log("sys.path=%s" % sys.path)
    _log("sys.builtin_module_names=%s" % (getattr(sys, "builtin_module_names", ()),))
    _log("platform=%s %s" % (platform.system(), platform.architecture()))
    try:
        import ctypes  # type: ignore
        _log("ctypes import succeeded")
    except Exception as cexc:
        _log("ctypes import failed: %s" % cexc)
    try:
        ac.consoleWrite("[AtlasLink] Import failed, running in fallback mode")
    except Exception:
        pass
    app = None  # type: ignore


def acMain(ac_version):
    if app is not None:
        _log("acMain invoked with version %s" % ac_version)
        return app.acMain(ac_version)

    window = ac.newApp("AtlasLink")  # type: ignore
    ac.setTitle(window, "AtlasLink (fallback)")  # type: ignore
    ac.setSize(window, 220, 80)  # type: ignore
    _log("Fallback acMain invoked; presenting placeholder window")
    return "AtlasLink"


def acUpdate(delta_t):
    if app is not None:
        app.acUpdate(delta_t)
