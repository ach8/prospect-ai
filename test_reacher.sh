#!/bin/bash
cat > /tmp/req_vps.json << 'EOF'
{"to_email":"pierre.garro@elysee-digital.fr","from_email":"verify@srv1634548.hstgr.cloud","hello_name":"srv1634548.hstgr.cloud"}
EOF

echo "=== Test OVH with VPS hostname as from_email domain (no SPF) ==="
time curl -s -X POST http://localhost:8080/v0/check_email -H "Content-Type: application/json" -d @/tmp/req_vps.json --max-time 20
echo ""
echo "=== DONE ==="
