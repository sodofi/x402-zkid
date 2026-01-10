# ZKID Authentication System for x402 Negotiations

## Overview

ZKID Auth Server
- Use Privy to Generate Google OAuth Wallet. Get a JWT, extract the domain information.
- Run a Zero Knowledge Proof over the JWT to get a downloadable ZK proof that a wallet binds to some domain.

x402 Backend API
- The client will send request for premium resource (eg. a document/endpoint). Server responds with 402. Client will respond with ZKP Auth + the x402 payment payload. Only goes through if the ZKP validation is OK.
- The backend API keeps a MongoDB Atlas server that keeps track of nonces to prevent replay attacks
- For testing this should all occur on Base testnet

Extensions:
- We can then do auth-gated documents (eg. ones that require a particular domain to access), whitelisted/blacklisted domains etc. All done through the MongoDB
- Do a conversation/inference interface using Fireworks AI. After authing, the user will "negotiate" with the server for a price.

---

## Setup

### Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- circom (`brew install circom` on macOS, or https://docs.circom.io/getting-started/installation/)
- Privy account (https://dashboard.privy.io)

### 1. Configure Privy

1. Create an app at https://dashboard.privy.io
2. Enable Google OAuth in Login Methods
3. Add `http://localhost:3000` to Allowed Origins
4. Copy your App ID

### 2. Set Environment Variables

```bash
# Frontend
cp frontend/.env.example frontend/.env.local
# Edit frontend/.env.local and add your Privy App ID
```

### 3. Build ZK Circuits

```bash
# Build circom circuits (compiles circuit, generates proving/verification keys)
make circuits

# This creates:
# - frontend/public/zk/domainBinding.wasm
# - frontend/public/zk/domainBinding.zkey
# - frontend/public/zk/verification_key.json
```

### 4. Run the Project

```bash
# Install dependencies, build circuits, and start all services
make

# Or run individually
make install
make circuits
make dev
```

### 5. Stop Services

```bash
make stop
```

## Project Structure

```
x402-zkid/
├── Makefile              # Build orchestration
├── package.json          # Root package with concurrently
├── circuits/             # Circom ZK circuits
│   ├── domainBinding.circom  # Domain binding circuit
│   ├── build.js          # Circuit compilation script
│   └── build/            # Compiled artifacts
├── frontend/             # Next.js app (Privy auth, proof generation)
│   ├── app/
│   │   ├── page.tsx      # Main page with login/dashboard
│   │   ├── layout.tsx    # Root layout with providers
│   │   └── globals.css   # Styles
│   ├── lib/
│   │   └── zkproof.ts    # snarkjs proof generation
│   ├── public/zk/        # Circuit artifacts (wasm, zkey, vkey)
│   └── components/
│       └── Providers.tsx # Privy provider wrapper
└── backend/              # Express.js API (x402, ZKP verification)
    └── src/
        └── index.ts      # Express server
```

## Ports

- Frontend: http://localhost:3000
- Backend: http://localhost:3001
