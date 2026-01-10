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

### 3. Run the Project

```bash
# Install dependencies and start all services
make

# Or run individually
make install
make dev
```

### 4. Stop Services

```bash
make stop
```

## Project Structure

```
x402-zkid/
├── Makefile              # Build orchestration
├── package.json          # Root package with concurrently
├── packages/
│   ├── circuits/         # ZK circuit definitions (using @zk-email)
│   │   └── src/
│   │       └── jwt_domain_verifier.circom
│   └── zk-helpers/       # Input generation & proof helpers
│       └── src/
│           ├── input-generator.ts   # JWT to circuit inputs
│           ├── proof-generator.ts   # snarkjs proof generation
│           └── index.ts
├── frontend/             # Next.js app (Privy auth, proof generation)
│   ├── app/
│   │   ├── page.tsx      # Main page with login/dashboard
│   │   ├── layout.tsx    # Root layout with providers
│   │   └── globals.css   # Styles
│   ├── lib/
│   │   └── zkproof.ts    # Browser proof generation
│   └── components/
│       └── Providers.tsx # Privy provider wrapper
└── backend/              # Express.js API (x402, ZKP verification)
    └── src/
        └── index.ts      # Express server
```

## ZK Proof Architecture

### Flow
1. **Frontend**: User signs in via Google OAuth through Privy
2. **Input Generation**: JWT payload is transformed into circuit inputs
3. **Proof Generation**: snarkjs generates Groth16 proof in browser
4. **Verification**: Backend verifies proof using snarkjs

### Public Signals
The ZK proof exposes three public signals:
- `domainHash`: Poseidon hash of the email domain (e.g., gmail.com)
- `nullifier`: Unique identifier for the user (derived from domain + secret)
- `walletBinding`: Hash binding the wallet address to the domain

### Current State
The frontend by default generates **mock proofs** with real Poseidon hash computations for the public signals. To enable real proofs:
1. Compile the circuit with circom (optional - only if you need verifiable proofs)
2. Generate proving/verification keys
3. Place artifacts in `frontend/public/zk/`

## Ports
- Frontend: http://localhost:3000
- Backend: http://localhost:3001
