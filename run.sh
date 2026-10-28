#!/bin/sh
# Serve RefleX on every interface so phones on the Pi's hotspot can reach it.
cd "$(dirname "$0")"
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
