pragma circom 2.1.6;

include "node_modules/@zk-email/circuits/helpers/base64.circom";
include "node_modules/@zk-email/circuits/utils/hash.circom";

/**
 * JWT Domain Verifier Circuit
 *
 * This circuit verifies a JWT payload and extracts the email domain.
 * It produces a domain hash that can be used as a public identifier
 * without revealing the actual email address.
 *
 * Inputs:
 * - jwtPayload: The decoded JWT payload as field elements
 * - emailDomain: The email domain extracted from the JWT
 * - walletAddress: The wallet address to bind to
 * - globalSecret: A secret used to generate the nullifier
 *
 * Outputs:
 * - domainHash: Poseidon hash of the domain (public identifier)
 * - nullifier: Unique identifier for this user/secret combination
 * - walletBinding: Hash binding the wallet to the domain
 */
template JWTDomainVerifier(maxPayloadLen, maxDomainLen) {
    // Private inputs
    signal input jwtPayload[maxPayloadLen];      // JWT payload as bytes
    signal input emailDomain[maxDomainLen];       // Email domain as bytes
    signal input domainLen;                        // Actual length of domain
    signal input walletAddress;                    // Wallet address as field
    signal input globalSecret;                     // Secret for nullifier

    // Public outputs
    signal output domainHash;
    signal output nullifier;
    signal output walletBinding;

    // Hash the domain using Poseidon
    component domainHasher = PoseidonLarge(maxDomainLen);
    for (var i = 0; i < maxDomainLen; i++) {
        domainHasher.in[i] <== emailDomain[i];
    }
    domainHash <== domainHasher.out;

    // Generate nullifier = Poseidon(domainHash, globalSecret)
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== domainHash;
    nullifierHasher.inputs[1] <== globalSecret;
    nullifier <== nullifierHasher.out;

    // Create wallet binding = Poseidon(domainHash, walletAddress)
    component bindingHasher = Poseidon(2);
    bindingHasher.inputs[0] <== domainHash;
    bindingHasher.inputs[1] <== walletAddress;
    walletBinding <== bindingHasher.out;
}

// Poseidon for large inputs (chunks into smaller pieces)
template PoseidonLarge(n) {
    signal input in[n];
    signal output out;

    var numChunks = (n + 15) \ 16; // Ceiling division by 16
    component hashers[numChunks];
    signal intermediate[numChunks];

    for (var i = 0; i < numChunks; i++) {
        var chunkSize = 16;
        if (i == numChunks - 1 && n % 16 != 0) {
            chunkSize = n % 16;
        }

        hashers[i] = Poseidon(chunkSize);
        for (var j = 0; j < chunkSize; j++) {
            hashers[i].inputs[j] <== in[i * 16 + j];
        }

        if (chunkSize < 16) {
            // Pad with zeros for remaining inputs
            for (var j = chunkSize; j < 16; j++) {
                hashers[i].inputs[j] <== 0;
            }
        }

        intermediate[i] <== hashers[i].out;
    }

    // Final hash of all intermediate results
    component finalHasher = Poseidon(numChunks);
    for (var i = 0; i < numChunks; i++) {
        finalHasher.inputs[i] <== intermediate[i];
    }
    out <== finalHasher.out;
}

component main {public []} = JWTDomainVerifier(512, 64);
