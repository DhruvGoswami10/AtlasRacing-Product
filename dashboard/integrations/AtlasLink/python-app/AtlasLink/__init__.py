import os
import sys

MODULE_DIR = os.path.dirname(__file__)
if MODULE_DIR not in sys.path:
    sys.path.append(MODULE_DIR)

import app  # type: ignore


APP_NAME = "AtlasLink"


def acMain(ac_version):
    return app.acMain(ac_version)


def acUpdate(delta_t):
    app.acUpdate(delta_t)
