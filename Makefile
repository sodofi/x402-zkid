.PHONY: all install dev stop frontend backend circuits clean

all: install circuits dev

install:
	pnpm run install:all

circuits:
	pnpm run build:circuits

dev:
	pnpm run dev

stop:
	@pkill -f "next dev" 2>/dev/null || true
	@pkill -f "tsx watch" 2>/dev/null || true
	@pkill -f "node.*backend" 2>/dev/null || true
	@echo "Services stopped"

frontend:
	cd frontend && pnpm run dev

backend:
	cd backend && pnpm run dev

clean:
	rm -rf node_modules frontend/node_modules backend/node_modules circuits/node_modules
	rm -rf circuits/build frontend/public/zk
