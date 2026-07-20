#!/bin/sh
set -e

npm --prefix backend run db:init
npm --prefix backend run db:demo-technicians
npm --prefix backend run db:demo-clients
npm --prefix backend run pricing:import

# Index the catalog progressively without delaying the public web server.
# The embedding script waits and resumes when the free Gemini quota resets.
(npm --prefix backend run pricing:embed || echo "WARNING: background pricing embedding stopped") &

exec node backend/server.js
