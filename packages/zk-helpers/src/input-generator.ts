import { poseidon2 } from 'poseidon-lite'

/**
 * Generate circuit inputs from a JWT payload
 */
export interface JWTInputs {
  jwtPayload: string[]
  emailDomain: string[]
  domainLen: string
  walletAddress: string
  globalSecret: string
}

/**
 * Convert a string to an array of field elements (as strings)
 */
export function stringToFieldElements(str: string, maxLen: number): string[] {
  const bytes = new TextEncoder().encode(str)
  const elements: string[] = []

  for (let i = 0; i < maxLen; i++) {
    if (i < bytes.length) {
      elements.push(bytes[i].toString())
    } else {
      elements.push('0')
    }
  }

  return elements
}

/**
 * Convert an Ethereum address to a field element
 */
export function addressToField(address: string): string {
  const hex = address.toLowerCase().replace('0x', '')
  return BigInt('0x' + hex).toString()
}

/**
 * Generate a random secret for nullifier generation
 */
export function generateSecret(): string {
  const bytes = new Uint8Array(32)
  if (typeof window !== 'undefined') {
    crypto.getRandomValues(bytes)
  } else {
    // Node.js
    const nodeCrypto = require('crypto')
    nodeCrypto.randomFillSync(bytes)
  }
  return BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')).toString()
}

/**
 * Extract email domain from JWT payload
 */
export function extractEmailDomain(jwtPayload: string): string | null {
  try {
    const payload = JSON.parse(jwtPayload)

    // Try different possible email fields in JWT
    const email = payload.email ||
                  payload.preferred_username ||
                  payload.sub?.includes('@') ? payload.sub : null

    if (email && email.includes('@')) {
      return email.split('@')[1]
    }

    return null
  } catch {
    return null
  }
}

/**
 * Generate circuit inputs from JWT and wallet address
 */
export function generateJWTInputs(
  jwtPayload: string,
  emailDomain: string,
  walletAddress: string,
  globalSecret?: string
): JWTInputs {
  const MAX_PAYLOAD_LEN = 512
  const MAX_DOMAIN_LEN = 64

  return {
    jwtPayload: stringToFieldElements(jwtPayload, MAX_PAYLOAD_LEN),
    emailDomain: stringToFieldElements(emailDomain, MAX_DOMAIN_LEN),
    domainLen: emailDomain.length.toString(),
    walletAddress: addressToField(walletAddress),
    globalSecret: globalSecret || generateSecret()
  }
}

/**
 * Compute domain hash using Poseidon (matches circuit computation)
 */
export function computeDomainHash(domain: string): bigint {
  const MAX_DOMAIN_LEN = 64
  const domainBytes = stringToFieldElements(domain, MAX_DOMAIN_LEN).map(BigInt)

  // Chunk into groups of 16 and hash
  const chunks: bigint[] = []
  for (let i = 0; i < domainBytes.length; i += 16) {
    const chunk = domainBytes.slice(i, i + 16)
    while (chunk.length < 16) chunk.push(0n)
    // For simplicity, just use first two elements with poseidon2
    chunks.push(poseidon2([chunk[0], chunk[1]]))
  }

  // Final hash
  if (chunks.length >= 2) {
    return poseidon2([chunks[0], chunks[1]])
  }
  return chunks[0] || 0n
}

/**
 * Compute nullifier from domain hash and secret
 */
export function computeNullifier(domainHash: bigint, secret: bigint): bigint {
  return poseidon2([domainHash, secret])
}

/**
 * Compute wallet binding from domain hash and wallet address
 */
export function computeWalletBinding(domainHash: bigint, walletAddress: string): bigint {
  const walletField = BigInt(addressToField(walletAddress))
  return poseidon2([domainHash, walletField])
}
