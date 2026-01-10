import * as snarkjs from 'snarkjs'
import {
  computeDomainHash,
  computeNullifier,
  computeWalletBinding,
  addressToField,
  generateSecret
} from './input-generator'

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

export interface ProofGeneratorConfig {
  wasmPath: string
  zkeyPath: string
}

/**
 * Generate a ZK proof using snarkjs
 * This is the production implementation that uses actual circuit files
 */
export async function generateProof(
  inputs: Record<string, string | string[]>,
  config: ProofGeneratorConfig
): Promise<{ proof: snarkjs.Groth16Proof; publicSignals: string[] }> {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    inputs,
    config.wasmPath,
    config.zkeyPath
  )

  return { proof, publicSignals }
}

/**
 * Generate a ZK proof in browser environment
 * Falls back to mock proof if circuit files are not available
 */
export async function generateProofBrowser(
  domain: string,
  walletAddress: string,
  jwtExpiry: number,
  options?: {
    wasmPath?: string
    zkeyPath?: string
    useMock?: boolean
  }
): Promise<ProofData> {
  const { wasmPath, zkeyPath, useMock = true } = options || {}

  // If we have circuit files and useMock is false, use real proof generation
  if (!useMock && wasmPath && zkeyPath) {
    try {
      const secret = generateSecret()
      const inputs = {
        emailDomain: stringToFieldElements(domain, 64),
        walletAddress: addressToField(walletAddress),
        globalSecret: secret,
        jwtPayload: new Array(512).fill('0'),
        domainLen: domain.length.toString()
      }

      const { proof, publicSignals } = await generateProof(inputs, { wasmPath, zkeyPath })

      return {
        proof: formatProof(proof),
        publicSignals: publicSignals.map(s => '0x' + BigInt(s).toString(16)),
        domain,
        method: 'jwt',
        generatedAt: Date.now(),
        walletAddress
      }
    } catch (error) {
      console.warn('Failed to generate real proof, falling back to mock:', error)
    }
  }

  // Generate mock proof with real hash computations
  return generateMockProof(domain, walletAddress, jwtExpiry)
}

/**
 * Helper to convert string to field elements
 */
function stringToFieldElements(str: string, maxLen: number): string[] {
  const bytes = new TextEncoder().encode(str)
  const elements: string[] = []
  for (let i = 0; i < maxLen; i++) {
    elements.push(i < bytes.length ? bytes[i].toString() : '0')
  }
  return elements
}

/**
 * Format snarkjs proof to our ZKProof interface
 */
function formatProof(proof: snarkjs.Groth16Proof): ZKProof {
  return {
    pi_a: [
      '0x' + BigInt(proof.pi_a[0]).toString(16),
      '0x' + BigInt(proof.pi_a[1]).toString(16),
      '0x' + BigInt(proof.pi_a[2]).toString(16)
    ] as [string, string, string],
    pi_b: [
      [
        '0x' + BigInt(proof.pi_b[0][0]).toString(16),
        '0x' + BigInt(proof.pi_b[0][1]).toString(16)
      ],
      [
        '0x' + BigInt(proof.pi_b[1][0]).toString(16),
        '0x' + BigInt(proof.pi_b[1][1]).toString(16)
      ],
      [
        '0x' + BigInt(proof.pi_b[2][0]).toString(16),
        '0x' + BigInt(proof.pi_b[2][1]).toString(16)
      ]
    ] as [[string, string], [string, string], [string, string]],
    pi_c: [
      '0x' + BigInt(proof.pi_c[0]).toString(16),
      '0x' + BigInt(proof.pi_c[1]).toString(16),
      '0x' + BigInt(proof.pi_c[2]).toString(16)
    ] as [string, string, string],
    protocol: proof.protocol,
    curve: proof.curve
  }
}

/**
 * Generate a mock proof with real Poseidon hash computations
 * The proof itself is not valid, but the public signals are correctly computed
 */
export function generateMockProof(
  domain: string,
  walletAddress: string,
  jwtExpiry: number
): ProofData {
  // Compute real hashes for public signals
  const domainHash = computeDomainHash(domain)
  const secret = BigInt(generateSecret())
  const nullifier = computeNullifier(domainHash, secret)
  const walletBinding = computeWalletBinding(domainHash, walletAddress)

  // Generate random proof elements (these won't verify, but have correct structure)
  const randomHex = () => {
    const bytes = new Uint8Array(32)
    if (typeof window !== 'undefined') {
      crypto.getRandomValues(bytes)
    } else {
      require('crypto').randomFillSync(bytes)
    }
    return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  return {
    proof: {
      pi_a: [randomHex(), randomHex(), '0x1'] as [string, string, string],
      pi_b: [
        [randomHex(), randomHex()],
        [randomHex(), randomHex()],
        ['0x1', '0x1']
      ] as [[string, string], [string, string], [string, string]],
      pi_c: [randomHex(), randomHex(), '0x1'] as [string, string, string],
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
 * Verify a ZK proof using snarkjs
 */
export async function verifyProof(
  proof: ZKProof,
  publicSignals: string[],
  verificationKeyPath: string
): Promise<boolean> {
  try {
    const response = await fetch(verificationKeyPath)
    const vkey = await response.json()

    // Convert hex strings back to decimal strings for snarkjs
    const snarkjsProof = {
      pi_a: proof.pi_a.map(x => BigInt(x).toString()),
      pi_b: proof.pi_b.map(arr => arr.map(x => BigInt(x).toString())),
      pi_c: proof.pi_c.map(x => BigInt(x).toString()),
      protocol: proof.protocol,
      curve: proof.curve
    }

    const signals = publicSignals.map(s => BigInt(s).toString())

    return await snarkjs.groth16.verify(vkey, signals, snarkjsProof)
  } catch (error) {
    console.error('Proof verification failed:', error)
    return false
  }
}
