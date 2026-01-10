export {
  generateJWTInputs,
  stringToFieldElements,
  addressToField,
  generateSecret,
  extractEmailDomain,
  computeDomainHash,
  computeNullifier,
  computeWalletBinding,
  type JWTInputs
} from './input-generator'

export {
  generateProof,
  generateProofBrowser,
  generateMockProof,
  verifyProof,
  type ZKProof,
  type ProofData,
  type ProofGeneratorConfig
} from './proof-generator'
