#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== Full Diagnostic: start =="
echo "Root: ${ROOT_DIR}"

echo "\n[1/7] Backend e2e and smoke tests"
pushd "${ROOT_DIR}/backend" >/dev/null
source .venv/bin/activate
python scripts/e2e_system_flow.py
python scripts/smoke_auth_flow.py
popd >/dev/null

echo "\n[2/7] Legacy unit tests"
pushd "${ROOT_DIR}" >/dev/null
python -m unittest discover -s tests -p "test_*.py"
popd >/dev/null

echo "\n[3/7] Frontend production build"
pushd "${ROOT_DIR}/frontend" >/dev/null
npm run build
popd >/dev/null

if ! command -v railway >/dev/null 2>&1; then
  echo "\n[4/7] Railway CLI not found. Skipping Railway checks."
  echo "== Full Diagnostic: done (local checks only) =="
  exit 0
fi

echo "\n[4/7] Railway service status"
pushd "${ROOT_DIR}" >/dev/null
railway service status --service noble-savage-backend
railway service status --service noble-savage-frontend

echo "\n[5/7] Public health endpoints"
curl -fsS https://noble-savage-backend-production.up.railway.app/health
echo
curl -fsSI https://noble-savage-frontend-production.up.railway.app | head -n 1

echo "\n[6/7] Production upload diagnostic"
pushd "${ROOT_DIR}/backend" >/dev/null
source .venv/bin/activate
python - <<'PY'
import uuid
from io import BytesIO

import httpx
from docx import Document

base = "https://noble-savage-backend-production.up.railway.app"
run_id = uuid.uuid4().hex[:8]
email = f"prod.diag.script.{run_id}@noblesavage.local"
password = "prod-diag-pass-123"

with httpx.Client(timeout=60.0) as client:
	reg = client.post(
		f"{base}/api/auth/register",
		json={"email": email, "password": password, "name": "Prod Diag Script"},
	)
	assert reg.status_code == 200, reg.text
	token = reg.json()["access_token"]
	headers = {"Authorization": f"Bearer {token}"}

	doc = Document()
	doc.add_paragraph("Production diagnostic DOCX upload via script.")
	bio = BytesIO()
	doc.save(bio)

	files = [
		(
			"files",
			(
				"prod-diagnostic-script.docx",
				bio.getvalue(),
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			),
		),
		(
			"files",
			("prod_diag_script.py", b"def prod_check_script():\n    return 'ok'\n", "text/x-python"),
		),
	]

	up = client.post(f"{base}/api/knowledge/upload", files=files, headers=headers)
	assert up.status_code == 200, up.text
	body = up.json()
	assert body["successful_files"] == 2, body
	assert body["failed_files"] == 0, body
	assert body["total_entries_created"] >= 2, body

print("prod_upload_diag_ok")
PY
popd >/dev/null

echo "\n[7/7] Git quick status"
git status --short
popd >/dev/null

echo "\n== Full Diagnostic: all checks passed =="
