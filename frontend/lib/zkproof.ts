import * as snarkjs from 'snarkjs'

export interface ZKProof {
  proof: {
    pi_a: string[]
    pi_b: string[][]
    pi_c: string[]
    protocol: string
    curve: string
  }
  publicSignals: string[]
  domain: string
  method: string
  generatedAt: number
  walletAddress: string
}

// Convert string to field elements (4 elements, each can hold ~31 bytes)
function stringToFieldElements(str: string): bigint[] {
  const bytes = new TextEncoder().encode(str)
  const elements: bigint[] = [0n, 0n, 0n, 0n]

  for (let i = 0; i < Math.min(bytes.length, 124); i++) {
    const elementIndex = Math.floor(i / 31)
    const bytePosition = i % 31
    elements[elementIndex] += BigInt(bytes[i]) << BigInt(bytePosition * 8)
  }

  return elements
}

// Convert address string to field element
function addressToField(address: string): bigint {
  // Remove 0x prefix and convert to bigint
  const hex = address.toLowerCase().replace('0x', '')
  return BigInt('0x' + hex)
}

// Format proof for JSON output
function formatProof(proof: snarkjs.Groth16Proof): ZKProof['proof'] {
  return {
    pi_a: proof.pi_a.map(x => '0x' + BigInt(x).toString(16)),
    pi_b: proof.pi_b.map(arr => arr.map(x => '0x' + BigInt(x).toString(16))),
    pi_c: proof.pi_c.map(x => '0x' + BigInt(x).toString(16)),
    protocol: proof.protocol,
    curve: proof.curve
  }
}

export async function generateZKProof(
  domain: string,
  walletAddress: string,
  jwtExpiry: number
): Promise<ZKProof> {
  // Prepare circuit inputs
  const domainFields = stringToFieldElements(domain)
  const walletField = addressToField(walletAddress)

  const input = {
    domain: domainFields.map(x => x.toString()),
    walletAddress: walletField.toString(),
    jwtExpiry: jwtExpiry.toString()
  }

  console.log('Generating ZK proof with inputs:', input)

  // Load circuit artifacts
  const wasmPath = '/zk/domainBinding.wasm'
  const zkeyPath = '/zk/domainBinding.zkey'

  try {
    // Generate the proof using snarkjs
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      wasmPath,
      zkeyPath
    )

    console.log('Proof generated:', proof)
    console.log('Public signals:', publicSignals)

    return {
      proof: formatProof(proof),
      publicSignals: publicSignals.map(s => '0x' + BigInt(s).toString(16)),
      domain,
      method: 'jwt',
      generatedAt: Date.now(),
      walletAddress
    }
  } catch (error) {
    console.error('Error generating ZK proof:', error)
    throw error
  }
}

export async function verifyZKProof(zkProof: ZKProof): Promise<boolean> {
  try {
    // Load verification key
    const response = await fetch('/zk/verification_key.json')
    const vkey = await response.json()

    // Convert proof back to snarkjs format
    const proof = {
      pi_a: zkProof.proof.pi_a.map(x => BigInt(x).toString()),
      pi_b: zkProof.proof.pi_b.map(arr => arr.map(x => BigInt(x).toString())),
      pi_c: zkProof.proof.pi_c.map(x => BigInt(x).toString()),
      protocol: zkProof.proof.protocol,
      curve: zkProof.proof.curve
    }

    const publicSignals = zkProof.publicSignals.map(s => BigInt(s).toString())

    const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof)
    return isValid
  } catch (error) {
    console.error('Error verifying proof:', error)
    return false
  }
}
