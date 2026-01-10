pragma circom 2.1.6;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// Domain Binding Circuit
// Proves knowledge of a domain string that hashes to a public commitment
// and binds it to a wallet address
template DomainBinding() {
    // Private inputs
    signal input domain[4];        // Domain encoded as 4 field elements (up to 124 chars)
    signal input walletAddress;    // Wallet address as a single field element
    signal input jwtExpiry;        // JWT expiration timestamp

    // Public outputs
    signal output domainHash;      // Poseidon hash of the domain
    signal output walletBinding;   // Hash binding wallet to domain
    signal output expiryPublic;    // Expiry made public for verification

    // Hash the domain using Poseidon
    component domainHasher = Poseidon(4);
    for (var i = 0; i < 4; i++) {
        domainHasher.inputs[i] <== domain[i];
    }
    domainHash <== domainHasher.out;

    // Create wallet binding = Poseidon(domainHash, walletAddress)
    component bindingHasher = Poseidon(2);
    bindingHasher.inputs[0] <== domainHash;
    bindingHasher.inputs[1] <== walletAddress;
    walletBinding <== bindingHasher.out;

    // Pass through expiry as public
    expiryPublic <== jwtExpiry;
}

component main {public []} = DomainBinding();
