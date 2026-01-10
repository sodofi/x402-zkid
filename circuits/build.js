const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const snarkjs = require('snarkjs');

const BUILD_DIR = path.join(__dirname, 'build');
const CIRCUIT_NAME = 'domainBinding';

async function build() {
  console.log('Building ZK circuit...\n');

  // Create build directory
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }

  // Step 1: Compile the circuit
  console.log('1. Compiling circuit...');
  try {
    execSync(
      `circom ${CIRCUIT_NAME}.circom --r1cs --wasm --sym -o build`,
      { cwd: __dirname, stdio: 'inherit' }
    );
  } catch (error) {
    console.error('Error compiling circuit. Make sure circom is installed:');
    console.error('  brew install circom  (macOS)');
    console.error('  Or visit: https://docs.circom.io/getting-started/installation/');
    process.exit(1);
  }

  // Step 2: Download Powers of Tau (for small circuits, use powersOfTau28_hez_final_12.ptau)
  const ptauPath = path.join(BUILD_DIR, 'pot12_final.ptau');
  if (!fs.existsSync(ptauPath)) {
    console.log('\n2. Downloading Powers of Tau ceremony file...');
    execSync(
      `curl -L -o ${ptauPath} https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau`,
      { stdio: 'inherit' }
    );
  } else {
    console.log('\n2. Powers of Tau file already exists, skipping download...');
  }

  // Step 3: Generate zkey (circuit-specific proving key)
  console.log('\n3. Generating proving key (zkey)...');
  const r1csPath = path.join(BUILD_DIR, `${CIRCUIT_NAME}.r1cs`);
  const zkey0Path = path.join(BUILD_DIR, `${CIRCUIT_NAME}_0.zkey`);
  const zkeyPath = path.join(BUILD_DIR, `${CIRCUIT_NAME}.zkey`);

  await snarkjs.zKey.newZKey(r1csPath, ptauPath, zkey0Path);

  // Contribute to the ceremony (in production, do a proper MPC ceremony)
  console.log('\n4. Contributing to ceremony...');
  await snarkjs.zKey.contribute(zkey0Path, zkeyPath, 'x402-zkid', 'random-entropy-string-' + Date.now());

  // Clean up intermediate file
  fs.unlinkSync(zkey0Path);

  // Step 4: Export verification key
  console.log('\n5. Exporting verification key...');
  const vkeyPath = path.join(BUILD_DIR, 'verification_key.json');
  const vkey = await snarkjs.zKey.exportVerificationKey(zkeyPath);
  fs.writeFileSync(vkeyPath, JSON.stringify(vkey, null, 2));

  // Step 5: Copy WASM to frontend public directory
  console.log('\n6. Copying artifacts to frontend...');
  const frontendPublicDir = path.join(__dirname, '..', 'frontend', 'public', 'zk');
  if (!fs.existsSync(frontendPublicDir)) {
    fs.mkdirSync(frontendPublicDir, { recursive: true });
  }

  // Copy wasm
  const wasmSrc = path.join(BUILD_DIR, `${CIRCUIT_NAME}_js`, `${CIRCUIT_NAME}.wasm`);
  const wasmDest = path.join(frontendPublicDir, `${CIRCUIT_NAME}.wasm`);
  fs.copyFileSync(wasmSrc, wasmDest);

  // Copy zkey
  fs.copyFileSync(zkeyPath, path.join(frontendPublicDir, `${CIRCUIT_NAME}.zkey`));

  // Copy verification key
  fs.copyFileSync(vkeyPath, path.join(frontendPublicDir, 'verification_key.json'));

  console.log('\n✅ Build complete!');
  console.log(`   WASM: ${wasmDest}`);
  console.log(`   ZKey: ${path.join(frontendPublicDir, `${CIRCUIT_NAME}.zkey`)}`);
  console.log(`   VKey: ${path.join(frontendPublicDir, 'verification_key.json')}`);
}

build().catch(console.error);
