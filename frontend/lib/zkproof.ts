// Re-export types and functions from zk-helpers
// This provides a single import point for the frontend

export interface ZKProof {
  pi_a: [string, string, string]
  pi_b: [[string, string], [string, string], [string, string]]
  pi_c: [string, string, string]
  protocol: string
  curve: string
}

export interface ProofData {
  proof: ZKProof
  publicSignals: string[]
  domain: string
  method: 'jwt' | 'email'
  generatedAt: number
  walletAddress: string
}

// Helper to compute domain hash using Poseidon
async function computeDomainHash(domain: string): Promise<bigint> {
  // Dynamic import to avoid SSR issues
  const { poseidon2 } = await import('poseidon-lite')

  const bytes = new TextEncoder().encode(domain)
  const maxLen = 64
  const domainBytes: bigint[] = []

  for (let i = 0; i < maxLen; i++) {
    domainBytes.push(i < bytes.length ? BigInt(bytes[i]) : 0n)
  }

  // Chunk and hash
  const chunks: bigint[] = []
  for (let i = 0; i < domainBytes.length; i += 16) {
    const chunk = domainBytes.slice(i, i + 16)
    while (chunk.length < 16) chunk.push(0n)
    chunks.push(poseidon2([chunk[0], chunk[1]]))
  }

  return chunks.length >= 2 ? poseidon2([chunks[0], chunks[1]]) : chunks[0]
}

// Generate random hex string
function randomHex(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Generate a random secret
function generateSecret(): bigint {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''))
}

// Convert address to field element
function addressToField(address: string): bigint {
  return BigInt(address.toLowerCase())
}

/**
 * Generate a ZK proof for JWT domain binding
 *
 * Currently generates a mock proof with real Poseidon hash computations.
 * The public signals (domainHash, nullifier, walletBinding) are correctly computed.
 *
 * In production with compiled circuits:
 * - Set useMock: false
 * - Provide wasmPath and zkeyPath
 */
export async function generateZKProof(
  domain: string,
  walletAddress: string,
  jwtExpiry: number,
  options?: {
    wasmPath?: string
    zkeyPath?: string
    useMock?: boolean
  }
): Promise<ProofData> {
  const { poseidon2 } = await import('poseidon-lite')

  // Compute real hashes for public signals
  const domainHash = await computeDomainHash(domain)
  const secret = generateSecret()
  const nullifier = poseidon2([domainHash, secret])
  const walletBinding = poseidon2([domainHash, addressToField(walletAddress)])

  // TODO: When circuit files are available, use snarkjs for real proof generation
  // if (!options?.useMock && options?.wasmPath && options?.zkeyPath) {
  //   const snarkjs = await import('snarkjs')
  //   const { proof, publicSignals } = await snarkjs.groth16.fullProve(...)
  // }

  // Generate mock proof structure with real public signals
  return {
    proof: {
      pi_a: [randomHex(), randomHex(), '0x1'],
      pi_b: [
        [randomHex(), randomHex()],
        [randomHex(), randomHex()],
        ['0x1', '0x1']
      ],
      pi_c: [randomHex(), randomHex(), '0x1'],
      protocol: 'groth16',
      curve: 'bn128'
    },
    publicSignals: [
      '0x' + domainHash.toString(16),
      '0x' + nullifier.toString(16),
      '0x' + walletBinding.toString(16)
    ],
    domain,
    method: 'jwt',
    generatedAt: Date.now(),
    walletAddress
  }
}

/**
 * Verify a ZK proof
 * Currently returns true for mock proofs (no verification key available)
 */
export async function verifyZKProof(
  proof: ProofData,
  verificationKeyPath?: string
): Promise<boolean> {
  if (!verificationKeyPath) {
    // Mock verification - just check structure
    return (
      proof.proof.pi_a.length === 3 &&
      proof.proof.pi_b.length === 3 &&
      proof.proof.pi_c.length === 3 &&
      proof.publicSignals.length >= 3
    )
  }

  try {
    const snarkjs = await import('snarkjs')
    const response = await fetch(verificationKeyPath)
    const vkey = await response.json()

    const snarkjsProof = {
      pi_a: proof.proof.pi_a.map(x => BigInt(x).toString()),
      pi_b: proof.proof.pi_b.map(arr => arr.map(x => BigInt(x).toString())),
      pi_c: proof.proof.pi_c.map(x => BigInt(x).toString()),
      protocol: proof.proof.protocol,
      curve: proof.proof.curve
    }

    const signals = proof.publicSignals.map(s => BigInt(s).toString())

    return await snarkjs.groth16.verify(vkey, signals, snarkjsProof)
  } catch (error) {
    console.error('Proof verification failed:', error)
    return false
  }
}
