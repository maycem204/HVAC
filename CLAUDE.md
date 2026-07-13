# Agent Guidance

## Architecture Decision

Use the explicitly approved Node.js architecture for this project.

Target stack:
- Node.js/Express backend
- PostgreSQL database
- DeepSeek API for extraction, writing and judging
- React frontend using one API base URL

## Do Not Reintroduce

- FastAPI runtime
- SQLite auth or outcome databases
- LM Studio/local LLM production dependency
- multiple backend ports for production features
- Supabase auth/client code

## Preserve For Migration

- `backend/services/pricing/`: deterministic pricing and orchestration
- `backend/init-db.sql`: PostgreSQL schema reference
- `frontend/`: reusable React UI
- `test_vectoriel_excel.py`: vector search proof of concept

`backend/` is the production Node.js/Express backend.
